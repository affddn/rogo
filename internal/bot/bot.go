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

	last image.Image // most recent frame, for the deny-list guard
}

// ErrDenied is returned for a tap that would land on a deny-listed button.
var ErrDenied = errors.New("tap refused: deny-listed button")

func New(d *device.Device, log *slog.Logger) *Bot {
	return &Bot{D: d, Log: log, Shots: "captures/unknown", Settle: 1200 * time.Millisecond}
}

// Look takes a full screenshot and classifies it.
func (b *Bot) Look(ctx context.Context) (screens.ID, image.Image, error) {
	frame, err := b.D.Screenshot(ctx)
	if err != nil {
		return screens.Unknown, nil, err
	}
	b.last = frame
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

// Tap taps a point and waits for the UI to settle. Taps on a deny-listed
// button visible in the latest frame are refused.
func (b *Bot) Tap(ctx context.Context, p image.Point, what string) error {
	if name := b.denied(p); name != "" {
		b.Log.Error("refused tap on deny-listed button", "what", what, "button", name, "shot", b.save(b.last))
		return fmt.Errorf("%w: %s", ErrDenied, name)
	}
	b.Log.Debug("tap", "what", what, "x", p.X, "y", p.Y)
	if err := b.D.Tap(ctx, p.X, p.Y); err != nil {
		return err
	}
	return sleep(ctx, b.Settle)
}

func (b *Bot) denied(p image.Point) string {
	if b.last == nil {
		return ""
	}
	for _, name := range screens.Deny {
		m := assets.MustGet(name).Find(b.last, screens.Margin)
		if m.Visible(screens.MinScore) && p.In(image.Rectangle{Min: m.At, Max: m.At.Add(m.Size)}.Inset(-8)) {
			return name
		}
	}
	return ""
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
	case screens.GachaCount:
		return true, b.tapHint(ctx, frame)
	case screens.QuickIdleConfirm, screens.AutoSummonHint:
		return true, b.TapTemplate(ctx, frame, screens.TDialogCancel)
	case screens.Income:
		return true, b.TapTemplate(ctx, frame, screens.TIncomeClose)
	case screens.IdleRewards:
		return true, b.TapTemplate(ctx, frame, screens.TIdleClaim)
	case screens.StageDefeat:
		return true, b.TapTemplate(ctx, frame, screens.TStageLeave)
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

// The hint is white text over whatever the popup covers, so its brightness
// varies; shape alone is reliable for it.
func (b *Bot) hintVisible(frame image.Image) bool {
	return assets.MustGet(screens.THintTapEmpty).FindIn(frame, hintArea).Score >= screens.MinScore
}

// tapHint taps on the "Tap empty area to close." hint itself, which is never
// a button, or the bottom edge if the hint is not found.
func (b *Bot) tapHint(ctx context.Context, frame image.Image) error {
	m := assets.MustGet(screens.THintTapEmpty).FindIn(frame, hintArea)
	p := image.Pt(360, 1172)
	if m.Score >= screens.MinScore {
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

// titleStart is the Start Game text on the title screen; it glows, so it is
// tapped by position once the screen is recognised.
var titleStart = image.Pt(360, 1112)

// WaitBoot takes a freshly launched game from the title screen to the main
// screen: Start Game, then the offline Idle Rewards popup. Loading screens are
// waited out.
func (b *Bot) WaitBoot(ctx context.Context, timeout time.Duration) error {
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return err
		}
		switch id {
		case screens.Main:
			b.Log.Info("game ready")
			return nil
		case screens.Title:
			if !screens.Visible(frame, screens.TTitleAgreeChecked) {
				return fmt.Errorf("title screen: user agreement not ticked; tick it once by hand")
			}
			if err := b.Tap(ctx, titleStart, "start game"); err != nil {
				return err
			}
		default:
			if _, err := b.Dismiss(ctx, id, frame); err != nil {
				return err
			}
		}
		if err := sleep(ctx, 3*time.Second); err != nil {
			return err
		}
	}
	return fmt.Errorf("game not on main screen after %v", timeout)
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

// Sleep waits for d or until ctx is done.
func Sleep(ctx context.Context, d time.Duration) error { return sleep(ctx, d) }

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
