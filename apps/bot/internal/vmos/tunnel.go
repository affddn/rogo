package vmos

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"net"
	"strconv"
	"strings"
	"sync"
	"time"

	"golang.org/x/crypto/ssh"
)

// Forward is the ssh port-forward described by an ADB.Command such as
// "ssh -oStrictHostKeyChecking=accept-new s@129.227.56.194 -p 1824 -L 61644:localhost:1 -Nf".
type Forward struct {
	User, Host string
	Port       int
	// Remote is the target dialled through the ssh connection.
	Remote string
}

func ParseCommand(cmd string) (Forward, error) {
	var f Forward
	fields := strings.Fields(cmd)
	for i := 0; i < len(fields); i++ {
		switch a := fields[i]; {
		case a == "-p" && i+1 < len(fields):
			p, err := strconv.Atoi(fields[i+1])
			if err != nil {
				return f, fmt.Errorf("bad port %q", fields[i+1])
			}
			f.Port = p
			i++
		case a == "-L" && i+1 < len(fields):
			// local:remoteHost:remotePort; the local side is ours to choose.
			parts := strings.Split(fields[i+1], ":")
			if len(parts) != 3 {
				return f, fmt.Errorf("bad forward %q", fields[i+1])
			}
			f.Remote = net.JoinHostPort(parts[1], parts[2])
			i++
		case strings.Contains(a, "@") && !strings.HasPrefix(a, "-"):
			at := strings.LastIndex(a, "@")
			f.User, f.Host = a[:at], a[at+1:]
		}
	}
	if f.User == "" || f.Host == "" || f.Port == 0 || f.Remote == "" {
		return f, fmt.Errorf("unrecognised ssh command %q", cmd)
	}
	return f, nil
}

// Tunnel serves a local TCP port that forwards to the cloud phone's adbd.
type Tunnel struct {
	Local string // e.g. 127.0.0.1:15555
	Log   *slog.Logger

	mu     sync.Mutex
	fwd    Forward
	key    string
	client *ssh.Client
}

// Update swaps in fresh connection details (after a key refresh); existing
// adb connections finish on the old ssh session, new ones use the new one.
func (t *Tunnel) Update(a *ADB) error {
	f, err := ParseCommand(a.Command)
	if err != nil {
		return err
	}
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.client != nil && (t.fwd != f || t.key != a.Key) {
		t.client.Close()
		t.client = nil
	}
	t.fwd, t.key = f, a.Key
	return nil
}

// keepAlive pings the ssh server so NAT and the gateway don't drop an idle
// session, and closes it when pings stop getting answers so the next adb
// connection redials. The gateway stalls now and then and adb commands hang
// until the session is dropped, so pings are frequent; but a ping answer
// queues behind a screenshot (1.1 MB, ~4.5 s) on the same connection, so the
// deadline is generous: 5 s dropped healthy sessions mid-transfer.
func (t *Tunnel) keepAlive(c *ssh.Client) {
	tick := time.NewTicker(10 * time.Second)
	defer tick.Stop()
	for range tick.C {
		done := make(chan error, 1)
		go func() {
			_, _, err := c.SendRequest("keepalive@openssh.com", true, nil)
			done <- err
		}()
		select {
		case err := <-done:
			if err == nil {
				continue
			}
		case <-time.After(20 * time.Second):
		}
		t.Log.Warn("tunnel ssh keepalive failed, dropping session")
		c.Close()
		return
	}
}

func (t *Tunnel) sshClient() (*ssh.Client, error) {
	t.mu.Lock()
	defer t.mu.Unlock()
	if t.client != nil {
		return t.client, nil
	}
	if t.key == "" {
		return nil, fmt.Errorf("tunnel has no connection key yet")
	}
	cfg := &ssh.ClientConfig{
		User: t.fwd.User,
		Auth: []ssh.AuthMethod{ssh.Password(t.key)},
		// The gateway's host key rotates with the cloud fleet and the
		// connection key already authenticates both ends of this short-lived
		// session, so host keys are not pinned.
		HostKeyCallback: ssh.InsecureIgnoreHostKey(),
		Timeout:         15 * time.Second,
	}
	c, err := ssh.Dial("tcp", net.JoinHostPort(t.fwd.Host, strconv.Itoa(t.fwd.Port)), cfg)
	if err != nil {
		return nil, err
	}
	t.client = c
	go t.keepAlive(c)
	go func() {
		_ = c.Wait()
		t.mu.Lock()
		if t.client == c {
			t.client = nil
		}
		t.mu.Unlock()
	}()
	return c, nil
}

// Serve accepts local connections until ctx ends.
func (t *Tunnel) Serve(ctx context.Context) error {
	ln, err := net.Listen("tcp", t.Local)
	if err != nil {
		return err
	}
	go func() {
		<-ctx.Done()
		ln.Close()
		t.mu.Lock()
		if t.client != nil {
			t.client.Close()
		}
		t.mu.Unlock()
	}()
	for {
		conn, err := ln.Accept()
		if err != nil {
			if ctx.Err() != nil {
				return nil
			}
			return err
		}
		go t.pipe(conn)
	}
}

func (t *Tunnel) pipe(local net.Conn) {
	defer local.Close()
	c, err := t.sshClient()
	if err != nil {
		t.Log.Warn("tunnel ssh connect failed", "err", err)
		return
	}
	t.mu.Lock()
	remote := t.fwd.Remote
	t.mu.Unlock()
	upstream, err := c.Dial("tcp", remote)
	if err != nil {
		t.Log.Warn("tunnel forward failed", "err", err)
		// A stale session cannot forward; drop it so the next connection redials.
		t.mu.Lock()
		if t.client == c {
			t.client.Close()
			t.client = nil
		}
		t.mu.Unlock()
		return
	}
	// Copy both ways until both sides finish. Returning after the first
	// direction ends would close the other mid-stream; an idle adb
	// connection must also stay open indefinitely.
	var wg sync.WaitGroup
	wg.Add(2)
	go func() {
		defer wg.Done()
		_, _ = io.Copy(upstream, local)
		upstream.Close()
	}()
	go func() {
		defer wg.Done()
		_, _ = io.Copy(local, upstream)
		local.Close()
	}()
	wg.Wait()
}
