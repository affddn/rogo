// Package bot holds the look-decide-tap loop shared by every task.
package bot

import (
	"context"
	"errors"
	"fmt"
	"image"
	"image/png"
	"log/slog"
	"os"
	"path/filepath"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/device"
	"github.com/affddn/rogo/internal/screens"
)

const Package = "com.ggv.rogosea.aos"

// ErrTimeout means the expected screen never showed.
var ErrTimeout = errors.New("timed out waiting for screen")

type Bot struct {
	D   *device.Device
	Log *slog.Logger
	// Shots is where screenshots of unexpected screens are saved.
	Shots string
	// Settle is the pause after a tap before looking again; UI transitions
	// in this game take about a second.
	Settle time.Duration
}

func New(d *device.Device, log *slog.Logger) *Bot {
	return &Bot{D: d, Log: log, Shots: "captures/unknown", Settle: 1200 * time.Millisecond}
}

// Look takes a full screenshot and classifies it.
func (b *Bot) Look(ctx context.Context) (screens.ID, image.Image, error) {
	frame, err := b.D.Screenshot(ctx)
	if err != nil {
		return screens.Unknown, nil, err
	}
	return screens.Detect(frame), frame, nil
}

// Wait looks until one of ids shows or timeout passes.
func (b *Bot) Wait(ctx context.Context, timeout time.Duration, ids ...screens.ID) (screens.ID, image.Image, error) {
	deadline := time.Now().Add(timeout)
	for {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return id, frame, err
		}
		for _, want := range ids {
			if id == want {
				return id, frame, nil
			}
		}
		if time.Now().After(deadline) {
			return id, frame, fmt.Errorf("%w %v (on %s)", ErrTimeout, ids, id)
		}
		if err := sleep(ctx, 500*time.Millisecond); err != nil {
			return id, frame, err
		}
	}
}

// Tap taps a point and waits for the UI to settle.
func (b *Bot) Tap(ctx context.Context, p image.Point, what string) error {
	b.Log.Debug("tap", "what", what, "x", p.X, "y", p.Y)
	if err := b.D.Tap(ctx, p.X, p.Y); err != nil {
		return err
	}
	return sleep(ctx, b.Settle)
}

// TapTemplate taps a template that must be visible in frame.
func (b *Bot) TapTemplate(ctx context.Context, frame image.Image, name string) error {
	m := assets.MustGet(name).Find(frame, screens.Margin)
	if !m.Visible(screens.MinScore) {
		return fmt.Errorf("tap %s: not visible (score %.2f)", name, m.Score)
	}
	return b.Tap(ctx, m.Center(), name)
}

// Dismiss closes the modal identified as id. It reports false when it does
// not know how to close what is showing.
func (b *Bot) Dismiss(ctx context.Context, id screens.ID, frame image.Image) (bool, error) {
	switch id {
	case screens.Reward:
		return true, b.tapHint(ctx, frame)
	case screens.QuickIdleConfirm, screens.AutoSummonHint:
		return true, b.TapTemplate(ctx, frame, screens.TDialogCancel)
	case screens.Income:
		return true, b.TapTemplate(ctx, frame, screens.TIncomeClose)
	}
	if screens.Visible(frame, screens.TNavBack) {
		return true, b.TapTemplate(ctx, frame, screens.TNavBack)
	}
	if screens.Visible(frame, screens.TDialogCancel) {
		return true, b.TapTemplate(ctx, frame, screens.TDialogCancel)
	}
	if b.hintVisible(frame) {
		return true, b.tapHint(ctx, frame)
	}
	return false, nil
}

// hintArea covers every spot the "Tap empty area to close." hint has shown at.
var hintArea = image.Rect(180, 980, 540, 1240)

func (b *Bot) hintVisible(frame image.Image) bool {
	return assets.MustGet(screens.THintTapEmpty).FindIn(frame, hintArea).Visible(screens.MinScore)
}

// tapHint taps on the "Tap empty area to close." hint itself, which is never
// a button, or the bottom edge if the hint is not found.
func (b *Bot) tapHint(ctx context.Context, frame image.Image) error {
	m := assets.MustGet(screens.THintTapEmpty).FindIn(frame, hintArea)
	p := image.Pt(360, 1172)
	if m.Visible(screens.MinScore) {
		p = m.Center()
	}
	return b.Tap(ctx, p, "close popup")
}

// ToMain backs out of whatever is showing until the main screen is up.
func (b *Bot) ToMain(ctx context.Context) error {
	for attempt := 0; attempt < 8; attempt++ {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return err
		}
		if id == screens.Main {
			return nil
		}
		acted, err := b.Dismiss(ctx, id, frame)
		if err != nil {
			return err
		}
		if acted {
			continue
		}
		// Skill flashes can hide the main-screen anchors for a frame; look
		// again before pressing back, which on main would offer to quit.
		if attempt%2 == 0 {
			if err := sleep(ctx, b.Settle); err != nil {
				return err
			}
			continue
		}
		path := b.save(frame)
		b.Log.Warn("unknown screen, pressing back", "shot", path)
		if err := b.D.Back(ctx); err != nil {
			return err
		}
		if err := sleep(ctx, b.Settle); err != nil {
			return err
		}
	}
	return fmt.Errorf("could not reach main screen")
}

func (b *Bot) save(frame image.Image) string {
	if frame == nil {
		return ""
	}
	if err := os.MkdirAll(b.Shots, 0o755); err != nil {
		return ""
	}
	path := filepath.Join(b.Shots, time.Now().Format("20060102-150405.000")+".png")
	f, err := os.Create(path)
	if err != nil {
		return ""
	}
	defer f.Close()
	if png.Encode(f, frame) != nil {
		return ""
	}
	return path
}

func sleep(ctx context.Context, d time.Duration) error {
	t := time.NewTimer(d)
	defer t.Stop()
	select {
	case <-ctx.Done():
		return ctx.Err()
	case <-t.C:
		return nil
	}
}
