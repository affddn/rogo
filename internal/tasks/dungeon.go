package tasks

import (
	"context"
	"errors"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

var (
	// dungeonTile is the Dungeon tile on the Game Mode page.
	dungeonTile = image.Pt(190, 790)
	// The match popup's Accept button and the rows it sits in. The popup
	// only lasts ~10 s, so these rows are polled with fast band captures.
	dungeonAccept   = image.Pt(510, 872)
	dungeonAcceptRY = [2]int{830, 915}
)

// Dungeon spends up to n free dungeon attempts: Auto Match (the button turns
// into Cancel Match with a timer), Accept as soon as the party popup shows,
// then wait for the run to finish and the page to come back.
func Dungeon(ctx context.Context, b *bot.Bot, n int) (runs int, err error) {
	frame, err := openGameMode(ctx, b, dungeonTile, screens.Dungeon)
	if err != nil {
		return 0, err
	}
	for runs < n {
		if screens.Visible(frame, screens.TDungeonZeroLeft) {
			b.Log.Info("dungeon attempts used up")
			return runs, ErrNoAttempts
		}
		if err := startMatch(ctx, b, frame); err != nil {
			if errors.Is(err, ErrNoAttempts) {
				b.Log.Info("dungeon attempts used up")
				return runs, ErrNoAttempts
			}
			return runs, err
		}
		if !awaitAccept(ctx, b, 4*time.Minute) {
			b.Log.Warn("no dungeon match found")
			cancelMatch(ctx, b)
			break
		}
		if !awaitRun(ctx, b) {
			b.Log.Warn("dungeon run did not return to the dungeon page")
			break
		}
		runs++
		b.Log.Info("dungeon run done", "runs", runs)
		if _, frame, err = b.Look(ctx); err != nil {
			return runs, err
		}
	}
	return runs, b.ToMain(ctx)
}

// ErrNoAttempts means "Challenge Attempts: 0/3": today's attempts are used.
// The Auto Match button stays live at 0 (runs then give no rewards).
const ErrNoAttempts = matchErr("no dungeon attempts left")

// startMatch taps Auto Match until the button shows Cancel Match.
func startMatch(ctx context.Context, b *bot.Bot, frame image.Image) error {
	for try := 0; try < 3; try++ {
		if screens.Visible(frame, screens.TDungeonCancelMatch) {
			return nil
		}
		m := assets.MustGet(screens.TDungeonAutoMatch).Find(frame, screens.Margin)
		if m.Score >= screens.MinScore && m.Bright < 0.8 {
			// A popup or transition is dimming the page; look again.
			if err := bot.Sleep(ctx, 1500*time.Millisecond); err != nil {
				return err
			}
			id, f, err := b.Look(ctx)
			if err != nil {
				return err
			}
			if id != screens.Dungeon {
				if _, err := b.Dismiss(ctx, id, f); err != nil {
					return err
				}
				if _, f, err = b.Look(ctx); err != nil {
					return err
				}
			}
			frame = f
			continue
		}
		if err := b.TapTemplate(ctx, frame, screens.TDungeonAutoMatch); err != nil {
			return err
		}
		_, f, err := b.Look(ctx)
		if err != nil {
			return err
		}
		frame = f
	}
	if screens.Visible(frame, screens.TDungeonCancelMatch) {
		return nil
	}
	return errNoMatchStart
}

type matchErr string

func (e matchErr) Error() string { return string(e) }

const errNoMatchStart = matchErr("auto match did not start")

// awaitAccept polls the popup rows and taps Accept the moment it shows.
// maxBadBands is how many failed band captures in a row end a polling loop.
const maxBadBands = 5

// If matching stops without a popup (timer ran out), it is restarted.
func awaitAccept(ctx context.Context, b *bot.Bot, limit time.Duration) bool {
	accept := assets.MustGet(screens.TDungeonAccept)
	deadline := time.Now().Add(limit)
	checked := time.Now()
	bad := 0
	for time.Now().Before(deadline) {
		band, err := b.D.Rows(ctx, 720, dungeonAcceptRY[0], dungeonAcceptRY[1])
		if err != nil {
			if bad++; bad >= maxBadBands || ctx.Err() != nil {
				return false
			}
			b.Log.Warn("match capture failed", "err", err)
			continue
		}
		bad = 0
		if accept.Find(band, 20).Score >= screens.MinScore {
			if err := b.D.Tap(ctx, dungeonAccept.X, dungeonAccept.Y); err != nil {
				return false
			}
			b.Log.Info("dungeon match accepted")
			return true
		}
		// Every ~20 s make sure matching is still running.
		if time.Since(checked) > 20*time.Second {
			checked = time.Now()
			id, f, err := b.Look(ctx)
			if err != nil {
				return false
			}
			if id == screens.DungeonMatch {
				continue
			}
			if id == screens.Dungeon && !screens.Visible(f, screens.TDungeonCancelMatch) {
				if err := startMatch(ctx, b, f); err != nil {
					return false
				}
			}
		}
	}
	return false
}

// awaitRun waits for the party run to end back on the Dungeon page,
// accepting again if a re-match popup shows (someone declined).
func awaitRun(ctx context.Context, b *bot.Bot) bool {
	deadline := time.Now().Add(6 * time.Minute)
	sawBattle := false
	for time.Now().Before(deadline) {
		id, f, err := b.Look(ctx)
		if err != nil {
			return false
		}
		switch {
		case id == screens.DungeonMatch:
			_ = b.D.Tap(ctx, dungeonAccept.X, dungeonAccept.Y)
		case id == screens.Dungeon && screens.Visible(f, screens.TDungeonCancelMatch):
			// Someone declined: back in the queue; wait for the next popup.
			if !awaitAccept(ctx, b, 3*time.Minute) {
				return false
			}
		case id == screens.Dungeon:
			return sawBattle
		case id == screens.Unknown, id == screens.InCombat:
			sawBattle = true
		default:
			_, _ = b.Dismiss(ctx, id, f)
		}
		if err := bot.Sleep(ctx, 2*time.Second); err != nil {
			return false
		}
	}
	return false
}

func cancelMatch(ctx context.Context, b *bot.Bot) {
	if _, f, err := b.Look(ctx); err == nil && screens.Visible(f, screens.TDungeonCancelMatch) {
		_ = b.TapTemplate(ctx, f, screens.TDungeonCancelMatch)
	}
}
