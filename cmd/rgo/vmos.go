package main

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

	"github.com/affddn/rogo/internal/device"
	"github.com/affddn/rogo/internal/vmos"
)

// loadEnv reads KEY=VALUE lines from a file into the environment without
// overriding variables that are already set.
func loadEnv(path string) {
	f, err := os.Open(path)
	if err != nil {
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	for sc.Scan() {
		line := strings.TrimSpace(sc.Text())
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		k, v, ok := strings.Cut(line, "=")
		if !ok {
			continue
		}
		k, v = strings.TrimSpace(k), strings.Trim(strings.TrimSpace(v), `"'`)
		if _, set := os.LookupEnv(k); !set {
			os.Setenv(k, v)
		}
	}
}

// vmosTunnel is a self-managed adb tunnel to the VMOS phone, configured by
// RGO_VMOS_AK / RGO_VMOS_SK (console: Developer -> API) and RGO_VMOS_PAD
// (the phone's ID in the console).
type vmosTunnel struct {
	client  *vmos.Client
	pad     string
	tunnel  *vmos.Tunnel
	expires time.Time
	log     *slog.Logger
	static  *vmos.ADB // set when configured from a copied key instead of the API
}

const tunnelLocal = "127.0.0.1:15555"

func newVMOSTunnel(log *slog.Logger) (*vmosTunnel, bool) {
	t := &vmos.Tunnel{Local: tunnelLocal, Log: log}
	ak, sk, pad := os.Getenv("RGO_VMOS_AK"), os.Getenv("RGO_VMOS_SK"), os.Getenv("RGO_VMOS_PAD")
	if ak != "" && sk != "" && pad != "" {
		return &vmosTunnel{client: vmos.NewClient(ak, sk), pad: pad, tunnel: t, log: log}, true
	}
	// Static mode: the ssh command and key from the phone's Local debugging
	// tab. No renewal, but the ssh session is redialled whenever it drops.
	cmd, key := os.Getenv("RGO_TUNNEL_COMMAND"), os.Getenv("RGO_TUNNEL_KEY")
	if cmd != "" && key != "" {
		v := &vmosTunnel{tunnel: t, log: log, static: &vmos.ADB{Command: cmd, Key: key, ExpireTime: os.Getenv("RGO_TUNNEL_EXPIRES")}}
		return v, true
	}
	return nil, false
}

// Refresh asks VMOS for a 7-day tunnel and points the local port at it.
func (v *vmosTunnel) Refresh(ctx context.Context) error {
	if v.static != nil {
		if err := v.tunnel.Update(v.static); err != nil {
			return err
		}
		v.expires, _ = v.static.Expires()
		v.log.Info("static adb tunnel configured", "expires", v.static.ExpireTime)
		return nil
	}
	a, err := v.client.ADBInfo(ctx, v.pad, 7*24*time.Hour)
	if err != nil {
		return fmt.Errorf("vmos adb info: %w", err)
	}
	// An open tunnel keeps its old expiry; with under a day left, close it so
	// VMOS opens a fresh 7-day one.
	if exp, _ := a.Expires(); time.Until(exp) < 24*time.Hour {
		v.log.Info("vmos adb tunnel expires soon, opening a new one", "expires", a.ExpireTime)
		if err := v.client.CloseADB(ctx, v.pad); err != nil {
			v.log.Warn("vmos adb close failed, keeping the old tunnel", "err", err)
		} else if a, err = v.client.ADBInfo(ctx, v.pad, 7*24*time.Hour); err != nil {
			return fmt.Errorf("vmos adb info after close: %w", err)
		}
	}
	if err := v.tunnel.Update(a); err != nil {
		return err
	}
	v.expires, _ = a.Expires()
	v.log.Info("vmos adb tunnel ready", "pad", v.pad, "expires", v.expires.Format(time.DateTime))
	return nil
}

// Start serves the tunnel and renews it a day before expiry.
func (v *vmosTunnel) Start(ctx context.Context) error {
	if err := v.Refresh(ctx); err != nil {
		return err
	}
	go func() {
		if err := v.tunnel.Serve(ctx); err != nil {
			v.log.Error("tunnel stopped", "err", err)
		}
	}()
	go func() {
		t := time.NewTicker(time.Hour)
		defer t.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-t.C:
				if v.static == nil && time.Until(v.expires) < 24*time.Hour {
					if err := v.Refresh(ctx); err != nil {
						v.log.Error("tunnel renew failed", "err", err)
					}
				}
			}
		}
	}()
	return nil
}

// cmdTunnelRotate closes the phone's adb tunnel session so the next connect
// gets a fresh one, which can land on a less busy VMOS gateway. A running
// bot reconnects to it on its own.
func cmdTunnelRotate(ctx context.Context, _ *device.Device, _ []string) error {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	v, ok := newVMOSTunnel(log)
	if !ok || v.client == nil {
		return fmt.Errorf("rotating needs VMOS API keys in .env")
	}
	before, err := v.client.ADBInfo(ctx, v.pad, 7*24*time.Hour)
	if err != nil {
		return err
	}
	if err := v.client.CloseADB(ctx, v.pad); err != nil {
		return err
	}
	after, err := v.client.ADBInfo(ctx, v.pad, 7*24*time.Hour)
	if err != nil {
		return err
	}
	fb, _ := vmos.ParseCommand(before.Command)
	fa, _ := vmos.ParseCommand(after.Command)
	fmt.Printf("gateway %s:%d -> %s:%d, expires %s\n", fb.Host, fb.Port, fa.Host, fa.Port, after.ExpireTime)
	return nil
}

// cmdTunnel serves the adb tunnel on localhost:15555 until interrupted.
func cmdTunnel(ctx context.Context, _ *device.Device, _ []string) error {
	log := slog.New(slog.NewTextHandler(os.Stderr, nil))
	t, ok := newVMOSTunnel(log)
	if !ok {
		return fmt.Errorf("no VMOS API keys or RGO_TUNNEL_COMMAND/RGO_TUNNEL_KEY configured")
	}
	if err := t.Start(ctx); err != nil {
		return err
	}
	log.Info("serving adb tunnel", "addr", tunnelLocal)
	<-ctx.Done()
	return nil
}
