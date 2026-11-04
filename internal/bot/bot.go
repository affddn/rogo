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
	// KickedAt is when the game last signed out because the account signed
	// in on another device.
	KickedAt time.Time

	last image.Image // most recent frame, for the deny-list guard
}

// IncomeClose is the Adventure Income dialog's X. It sits over the map and
// dims on dark ones, so it is tapped by position.
var IncomeClose = image.Pt(663, 217)

// ErrDenied is returned for a tap that would land on a deny-listed button.
var ErrDenied = errors.New("tap refused: deny-listed button")

// ErrKicked means the account signed in on another device and the game
// signed out; someone may be playing by hand.
var ErrKicked = errors.New("account signed in on another device")

func New(d *device.Device, log *slog.Logger) *Bot {
	return &Bot{D: d, Log: log, Shots: "captures/unknown", Settle: 1200 * time.Millisecond}
}

// Look takes a full screenshot and classifies it. A screenshot normally takes
// about 4.5 s over the tunnel; one that stalls past the device timeout is
// retried once rather than failing the action.
func (b *Bot) Look(ctx context.Context) (screens.ID, image.Image, error) {
	frame, err := b.D.Screenshot(ctx)
	if err != nil && ctx.Err() == nil {
		b.Log.Warn("screenshot failed, retrying", "err", err)
		frame, err = b.D.Screenshot(ctx)
	}
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
			return id, frame, fmt.Errorf("%w %v (on %s, shot %s)", ErrTimeout, ids, id, b.Save(frame))
		}
		if err := sleep(ctx, 500*time.Millisecond); err != nil {
			return id, frame, err
		}
	}
}

// TapWait taps p and waits for one of ids. The game drops a tap now and then
// (during an elite's spawn effect, say), so when the screen is still from
// after timeout it taps once more. A slow transition leaves from and is not
// tapped twice.
func (b *Bot) TapWait(ctx context.Context, from screens.ID, p image.Point, what string, timeout time.Duration, ids ...screens.ID) (screens.ID, image.Image, error) {
	if err := b.Tap(ctx, p, what); err != nil {
		return screens.Unknown, nil, err
	}
	id, frame, err := b.Wait(ctx, timeout, ids...)
	if !errors.Is(err, ErrTimeout) || id != from {
		return id, frame, err
	}
	b.Log.Warn("tap had no effect, tapping again", "what", what)
	if err := b.Tap(ctx, p, what); err != nil {
		return id, frame, err
	}
	return b.Wait(ctx, timeout, ids...)
}

// Tap taps a point and waits for the UI to settle. Taps on a deny-listed
// button visible in the latest frame are refused.
func (b *Bot) Tap(ctx context.Context, p image.Point, what string) error {
	if name := b.denied(p); name != "" {
		b.Log.Error("refused tap on deny-listed button", "what", what, "button", name, "shot", b.Save(b.last))
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
	for _, r := range screens.DenyAreas[screens.Detect(b.last)] {
		if p.In(r) {
			return "deny-area"
		}
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
		return fmt.Errorf("tap %s: not visible (score %.2f, bright %.2f, shot %s)", name, m.Score, m.Bright, b.Save(frame))
	}
	return b.Tap(ctx, m.Center(), name)
}

// Dismiss closes the modal identified as id. It reports false when it does
// not know how to close what is showing.
func (b *Bot) Dismiss(ctx context.Context, id screens.ID, frame image.Image) (bool, error) {
	switch id {
	case screens.Kicked:
		if err := b.TapTemplate(ctx, frame, screens.TKickedConfirm); err != nil {
			return true, err
		}
		b.KickedAt = time.Now()
		return true, ErrKicked
	case screens.Reward:
		return true, b.tapHint(ctx, frame)
	case screens.GachaCount:
		return true, b.tapHint(ctx, frame)
	case screens.OneClickUpgrade:
		return true, b.TapTemplate(ctx, frame, screens.TDialogCancel)
	case screens.QuickIdleConfirm, screens.AutoSummonHint:
		return true, b.TapTemplate(ctx, frame, screens.TDialogCancel)
	case screens.Income:
		return true, b.Tap(ctx, IncomeClose, "close income")
	case screens.IdleRewards:
		return true, b.TapTemplate(ctx, frame, screens.TIdleClaim)
	case screens.Resonate:
		return true, b.TapTemplate(ctx, frame, screens.TResonateClose)
	case screens.ValuePack:
		b.Log.Info("closing paid Value Pack offer")
		return true, b.TapTemplate(ctx, frame, screens.TValuePackClose)
	case screens.SeasonPass:
		return true, b.Tap(ctx, image.Pt(40, 1225), "back")
	case screens.PowerSave:
		// The game dims into an auto-adventure lock screen after a few idle
		// minutes; unlock by sliding the slime to the right.
		b.Log.Info("unlocking power saving mode")
		if err := b.D.Swipe(ctx, 130, 1145, 660, 1145, 600*time.Millisecond); err != nil {
			return true, err
		}
		return true, sleep(ctx, b.Settle)
	case screens.DismantleConfirm:
		return true, b.Tap(ctx, image.Pt(196, 946), "cancel dismantle")
	case screens.Mail:
		return true, b.TapTemplate(ctx, frame, screens.TMailClose)
	case screens.PetCount:
		return true, b.tapHint(ctx, frame)
	case screens.QuestPanel:
		return true, b.TapTemplate(ctx, frame, screens.TQuestClose)
	case screens.InsertCard:
		return true, b.TapTemplate(ctx, frame, screens.TInsertCardClose)
	case screens.CardDetails:
		return true, b.TapTemplate(ctx, frame, screens.TCardDetailsClose)
	case screens.SummonUpgrade:
		return true, b.TapTemplate(ctx, frame, screens.TSummonUpClose)
	case screens.DungeonMatch:
		// A queued auto-match popped while the bot was elsewhere; joining
		// costs one of the free daily attempts, which the dungeon chore
		// would spend anyway.
		return true, b.TapTemplate(ctx, frame, screens.TDungeonAccept)
	case screens.Dungeon, screens.Baphomet:
		// Its back arrow is drawn differently from other pages'.
		return true, b.Tap(ctx, image.Pt(40, 1225), "back")
	case screens.CombatEnded:
		return true, b.TapTemplate(ctx, frame, screens.TCombatLeave)
	case screens.StageDefeat:
		return true, b.TapTemplate(ctx, frame, screens.TStageLeave)
	case screens.GuestBind:
		return true, b.TapTemplate(ctx, frame, screens.TGuestBindCancel)
	}
	// Guide arrows point at the control the game wants pressed next
	// (tutorial steps, quest guidance); following them completes those.
	if a, ok := screens.FindGuideArrow(frame); ok {
		b.Log.Info("following guide arrow", "x", a.Target.X, "y", a.Target.Y, "shot", b.Save(frame))
		return true, b.Tap(ctx, a.Target, "guide arrow")
	}
	// Tutorials without an arrow on this frame: skip them; the chores cover
	// every feature.
	if m := assets.MustGet(screens.TTutSkip).Find(frame, screens.Margin); m.Visible(screens.MinScore) {
		b.Log.Info("skipping tutorial", "shot", b.Save(frame))
		return true, b.Tap(ctx, m.Center(), "skip tutorial")
	}
	// The back arrow sits over page art (lava on Baphomet), so match its shape
	// only; on a modal, tapping it lands outside the modal and closes it.
	if m := assets.MustGet(screens.TNavBack).Find(frame, screens.Margin); m.Score >= screens.MinScore {
		return true, b.Tap(ctx, m.Center(), "back")
	}
	if screens.Visible(frame, screens.TDialogCancel) {
		return true, b.TapTemplate(ctx, frame, screens.TDialogCancel)
	}
	if b.hintVisible(frame) {
		return true, b.tapHint(ctx, frame)
	}
	// Tutorials and new-feature popups: a pointer hand or a lone confirm.
	// Follow whatever they point at; they never lead to purchases, and the
	// deny list still guards every tap.
	for _, name := range []string{screens.TDialogOK, screens.THintOK} {
		if screens.Visible(frame, name) {
			b.Log.Info("following popup", "button", name, "shot", b.Save(frame))
			return true, b.TapTemplate(ctx, frame, name)
		}
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
		switch id {
		case screens.Main:
			return nil
		case screens.Title, screens.Login, screens.AccountChooser:
			// Signed out (after a kick) or back at the title: log in again.
			return b.WaitBoot(ctx, 4*time.Minute)
		case screens.InCombat:
			// A fight already under way (a realm run, a stage battle) plays
			// out by itself and ignores back; wait for it.
			if err := b.waitFight(ctx, 10*time.Minute); err != nil {
				return err
			}
			continue
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
		path := b.Save(frame)
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

// waitFight waits until the fight on screen is over or timeout passes.
func (b *Bot) waitFight(ctx context.Context, timeout time.Duration) error {
	b.Log.Info("waiting for a fight to finish")
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		id, _, err := b.Look(ctx)
		if err != nil || id != screens.InCombat {
			return err
		}
		if err := sleep(ctx, 5*time.Second); err != nil {
			return err
		}
	}
	return nil
}

// titleStart is the Start Game text on the title screen; it glows, so it is
// tapped by position once the screen is recognised.
var titleStart = image.Pt(360, 1112)

// firstAccount is the top account row in Android's Google account picker.
var firstAccount = image.Pt(360, 660)

// WaitBoot takes a freshly launched game from the title screen to the main
// screen: Start Game, Google Login when signed out, then the offline Idle
// Rewards popup. Loading screens are waited out.
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
		case screens.Login:
			b.Log.Info("signed out, logging in with Google")
			if err := b.TapTemplate(ctx, frame, screens.TLoginGoogle); err != nil {
				return err
			}
		case screens.AccountChooser:
			if err := b.Tap(ctx, firstAccount, "google account"); err != nil {
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

// Save writes frame under Shots and returns its path, or "" if it cannot.
func (b *Bot) Save(frame image.Image) string {
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
