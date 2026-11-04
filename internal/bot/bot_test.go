package bot

import (
	"context"
	"errors"
	"fmt"
	"image"
	"image/png"
	"io"
	"log/slog"
	"os"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/affddn/rogo/internal/device"
	"github.com/affddn/rogo/internal/screens"
)

func TestTapRefusesDenyListedButton(t *testing.T) {
	f, err := os.Open("../../captures/auto-1.png")
	if err != nil {
		t.Skip("reference capture auto-1.png not present")
	}
	defer f.Close()
	frame, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	d := device.New("test")
	d.DryRun = true
	b := New(d, slog.New(slog.NewTextHandler(io.Discard, nil)))
	b.Shots, b.Settle, b.last = t.TempDir(), 0, frame

	if err := b.Tap(context.Background(), image.Pt(567, 725), "go unlock"); !errors.Is(err, ErrDenied) {
		t.Fatalf("tap on Go Unlock: got %v, want ErrDenied", err)
	}
	if err := b.Tap(context.Background(), image.Pt(516, 830), "ok"); err != nil {
		t.Fatalf("tap on OK refused: %v", err)
	}
}

func TestTapRefusesAccelerate(t *testing.T) {
	f, err := os.Open("../../captures/summon-timer3.png")
	if err != nil {
		t.Skip("reference capture summon-timer3.png not present")
	}
	defer f.Close()
	frame, _ := png.Decode(f)
	d := device.New("test")
	d.DryRun = true
	b := New(d, slog.New(slog.NewTextHandler(io.Discard, nil)))
	b.Shots, b.Settle, b.last = t.TempDir(), 0, frame
	if err := b.Tap(context.Background(), image.Pt(360, 966), "accelerate"); !errors.Is(err, ErrDenied) {
		t.Fatalf("tap on Accelerate: got %v, want ErrDenied", err)
	}
}

func TestTapRefusesSeasonPassPriceOnEveryTab(t *testing.T) {
	for _, name := range []string{"seasonpass.png", "seasonpass-eq.png", "seasonpass-pet.png"} {
		f, err := os.Open("../../captures/" + name)
		if err != nil {
			t.Skipf("reference capture %s not present", name)
		}
		frame, _ := png.Decode(f)
		f.Close()
		d := device.New("test")
		d.DryRun = true
		b := New(d, slog.New(slog.NewTextHandler(io.Discard, nil)))
		b.Shots, b.Settle, b.last = t.TempDir(), 0, frame
		if err := b.Tap(context.Background(), image.Pt(532, 1129), "price"); !errors.Is(err, ErrDenied) {
			t.Errorf("%s: tap on paid unlock got %v, want ErrDenied", name, err)
		}
		if err := b.Tap(context.Background(), image.Pt(188, 1129), "claim all"); err != nil {
			t.Errorf("%s: Claim All refused: %v", name, err)
		}
	}
}

// fakeADB is an adb that always shows shot and logs each input command.
func fakeADB(t *testing.T, shot string) (adb, inputs string) {
	t.Helper()
	if _, err := os.Stat(shot); err != nil {
		t.Skipf("reference capture %s not present", shot)
	}
	dir := t.TempDir()
	adb, inputs = filepath.Join(dir, "adb"), filepath.Join(dir, "inputs")
	abs, _ := filepath.Abs(shot)
	script := "#!/bin/sh\ncase \"$*\" in\n*screencap*) cat '" + abs + "' ;;\n*input*) echo \"$*\" >> '" + inputs + "' ;;\nesac\n"
	if err := os.WriteFile(adb, []byte(script), 0o755); err != nil {
		t.Fatal(err)
	}
	return adb, inputs
}

func TestTapWaitTapsAgainOnlyWhileStillOnFrom(t *testing.T) {
	adb, inputs := fakeADB(t, "../../captures/main3.png")
	d := device.New("test")
	d.ADB = adb
	b := New(d, slog.New(slog.NewTextHandler(io.Discard, nil)))
	b.Shots, b.Settle = t.TempDir(), 0
	ctx := context.Background()

	// Still on main after the tap: it was dropped, tap once more.
	if _, _, err := b.TapWait(ctx, screens.Main, image.Pt(190, 1215), "weapon", 10*time.Millisecond, screens.WeaponGacha); !errors.Is(err, ErrTimeout) {
		t.Fatalf("got %v, want ErrTimeout", err)
	}
	if got, _ := os.ReadFile(inputs); strings.Count(string(got), "tap 190 1215") != 2 {
		t.Fatalf("taps sent:\n%s\nwant two", got)
	}

	// Somewhere other than from: the first tap did something; no retry.
	_ = os.Remove(inputs)
	if _, _, err := b.TapWait(ctx, screens.Enhance, image.Pt(640, 935), "resonate", 10*time.Millisecond, screens.Resonate); !errors.Is(err, ErrTimeout) {
		t.Fatalf("got %v, want ErrTimeout", err)
	}
	if got, _ := os.ReadFile(inputs); strings.Count(string(got), "tap 640 935") != 1 {
		t.Fatalf("taps sent:\n%s\nwant one", got)
	}
}

func TestTapRefusesValuePackPrice(t *testing.T) {
	f, err := os.Open("../../captures/value-pack.png")
	if err != nil {
		t.Skip("reference capture value-pack.png not present")
	}
	defer f.Close()
	frame, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	d := device.New("test")
	d.DryRun = true
	b := New(d, slog.New(slog.NewTextHandler(io.Discard, nil)))
	b.Shots, b.Settle, b.last = t.TempDir(), 0, frame

	if err := b.Tap(context.Background(), image.Pt(360, 958), "price"); !errors.Is(err, ErrDenied) {
		t.Fatalf("tap on RM 8.99: got %v, want ErrDenied", err)
	}
	if err := b.Tap(context.Background(), image.Pt(640, 202), "close"); err != nil {
		t.Fatalf("tap on close refused: %v", err)
	}
}

func TestTapRefusesCardRenewalPrice(t *testing.T) {
	f, err := os.Open("../../captures/daily/sp-owned.png")
	if err != nil {
		t.Skip("reference capture daily/sp-owned.png not present")
	}
	defer f.Close()
	frame, err := png.Decode(f)
	if err != nil {
		t.Fatal(err)
	}
	d := device.New("test")
	d.DryRun = true
	b := New(d, slog.New(slog.NewTextHandler(io.Discard, nil)))
	b.Shots, b.Settle, b.last = t.TempDir(), 0, frame
	if err := b.Tap(context.Background(), image.Pt(497, 803), "monthly card price"); !errors.Is(err, ErrDenied) {
		t.Fatalf("tap on RM 8.99: got %v, want ErrDenied", err)
	}
}

func TestPruneShots(t *testing.T) {
	dir := t.TempDir()
	b := New(device.New("test"), slog.New(slog.NewTextHandler(io.Discard, nil)))
	b.Shots = dir
	old := time.Now().Add(-10 * 24 * time.Hour)
	for i := 0; i < 6; i++ {
		p := filepath.Join(dir, fmt.Sprintf("%02d.png", i))
		if err := os.WriteFile(p, []byte("x"), 0o644); err != nil {
			t.Fatal(err)
		}
		mod := time.Now().Add(time.Duration(i) * time.Minute)
		if i < 2 {
			mod = old
		}
		os.Chtimes(p, mod, mod)
	}
	os.WriteFile(filepath.Join(dir, "notes.txt"), []byte("keep"), 0o644)
	// 2 too old, then the oldest of the remaining 4 beyond 3.
	if n := b.PruneShots(7*24*time.Hour, 3); n != 3 {
		t.Errorf("removed %d, want 3", n)
	}
	left, _ := os.ReadDir(dir)
	var names []string
	for _, e := range left {
		names = append(names, e.Name())
	}
	if strings.Join(names, ",") != "03.png,04.png,05.png,notes.txt" {
		t.Errorf("left %v", names)
	}
}
