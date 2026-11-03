package bot

import (
	"context"
	"errors"
	"image"
	"image/png"
	"io"
	"log/slog"
	"os"
	"testing"

	"github.com/affddn/rogo/internal/device"
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
