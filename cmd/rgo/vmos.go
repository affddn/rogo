package main

import (
	"bufio"
	"context"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"time"

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
}

const tunnelLocal = "127.0.0.1:15555"

func newVMOSTunnel(log *slog.Logger) (*vmosTunnel, bool) {
	ak, sk, pad := os.Getenv("RGO_VMOS_AK"), os.Getenv("RGO_VMOS_SK"), os.Getenv("RGO_VMOS_PAD")
	if ak == "" || sk == "" || pad == "" {
		return nil, false
	}
	return &vmosTunnel{client: vmos.NewClient(ak, sk), pad: pad, tunnel: &vmos.Tunnel{Local: tunnelLocal, Log: log}, log: log}, true
}

// Refresh asks VMOS for a 7-day tunnel and points the local port at it.
func (v *vmosTunnel) Refresh(ctx context.Context) error {
	a, err := v.client.ADBInfo(ctx, v.pad, 7*24*time.Hour)
	if err != nil {
		return fmt.Errorf("vmos adb info: %w", err)
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
				if time.Until(v.expires) < 24*time.Hour {
					if err := v.Refresh(ctx); err != nil {
						v.log.Error("tunnel renew failed", "err", err)
					}
				}
			}
		}
	}()
	return nil
}
