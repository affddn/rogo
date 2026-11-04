package tasks

import (
	"context"
	"errors"
	"fmt"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

var (
	realmTile    = image.Pt(190, 440)
	baphTile     = image.Pt(540, 440)
	realmButtons = image.Rect(500, 250, 700, 1180) // Sweep/Challenge column
	// Realm bottom tabs, in the order their rewards matter for growth.
	RealmTabs = []struct {
		Name string
		At   image.Point
	}{
		{"exp", image.Pt(570, 1224)},
		{"weapon", image.Pt(464, 1224)},
		{"equipment", image.Pt(660, 1224)},
	}
	baphChallenge = image.Pt(360, 1144)
	dodgeButton   = image.Pt(360, 1000)
	// Rows holding the Dodge label and the result screen's Leave button:
	// about 0.5 s per capture, so a prompt is caught well inside its window.
	fightBand = [2]int{990, 1110}
)

func openGameMode(ctx context.Context, b *bot.Bot, tile image.Point, want screens.ID) (image.Image, error) {
	// Already there (the quest tracker or a guide arrow brought us).
	if id, frame, err := b.Look(ctx); err != nil {
		return nil, err
	} else if id == want {
		return frame, nil
	}
	if _, err := open(ctx, b, screens.TNavGameMode, screens.GameMode); err != nil {
		return nil, err
	}
	_, frame, err := b.TapWait(ctx, screens.GameMode, tile, string(want), 15*time.Second, want)
	return frame, err
}

func findIn(frame image.Image, name string, area image.Rectangle) (vision.Match, bool) {
	m := assets.MustGet(name).FindIn(frame, area)
	return m, m.Visible(screens.MinScore)
}

// RealmResult reports what one realm tab run did.
type RealmResult struct {
	Challenged bool
	Sweeps     int
}

// RealmTab works one Resource Secret Realm tab: if challenge is true and a
// Challenge row exists, fight it (wins chain into higher difficulties until a
// defeat), then sweep the highest cleared difficulty while entries remain.
// Sweeps only happen while the entry count reads green, so an empty counter
// never reaches a refill prompt.
func RealmTab(ctx context.Context, b *bot.Bot, tab image.Point, challenge bool) (RealmResult, error) {
	var res RealmResult
	if err := b.Tap(ctx, tab, "realm tab"); err != nil {
		return res, err
	}
	_, frame, err := b.Wait(ctx, 10*time.Second, screens.Realm)
	if err != nil {
		return res, err
	}
	if m, ok := findIn(frame, screens.TRealmChallenge, realmButtons); challenge && ok {
		if err := b.Tap(ctx, m.Center(), "realm challenge"); err != nil {
			return res, err
		}
		// Out of tickets the game only toasts and the page stays; entries
		// are shared with sweeps, so there is nothing more to do here.
		if id, _, err := b.Look(ctx); err != nil {
			return res, err
		} else if id == screens.Realm {
			return res, nil
		}
		res.Challenged = true
		id, f, err := b.Wait(ctx, 8*time.Minute, screens.StageDefeat, screens.Realm)
		if err != nil && !errors.Is(err, bot.ErrTimeout) {
			return res, err
		}
		if id == screens.StageDefeat {
			if _, err := b.Dismiss(ctx, id, f); err != nil {
				return res, err
			}
		}
		if _, frame, err = b.Wait(ctx, 30*time.Second, screens.Realm); err != nil {
			return res, err
		}
	}
	for res.Sweeps < 12 {
		m, ok := findIn(frame, screens.TRealmSweep, realmButtons)
		if !ok {
			break
		}
		count := image.Rectangle{Min: m.At.Add(image.Pt(60, -40)), Max: m.At.Add(image.Pt(84, -16))}
		if vision.Ratio(frame, count, vision.IsGreenText) < 0.03 {
			break
		}
		if err := b.Tap(ctx, m.Center(), "realm sweep"); err != nil {
			return res, err
		}
		res.Sweeps++
		if err := closePopups(ctx, b, screens.Realm); err != nil {
			return res, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return res, err
		}
	}
	return res, nil
}

// Realm runs every realm tab. done tells it which tabs already challenged
// today; the returned map lists tabs it challenged now.
func Realm(ctx context.Context, b *bot.Bot, challenged map[string]bool) (sweeps int, nowChallenged []string, err error) {
	if _, err := openGameMode(ctx, b, realmTile, screens.Realm); err != nil {
		return 0, nil, err
	}
	for _, t := range RealmTabs {
		r, err := RealmTab(ctx, b, t.At, !challenged[t.Name])
		sweeps += r.Sweeps
		if r.Challenged {
			nowChallenged = append(nowChallenged, t.Name)
		}
		if err != nil {
			return sweeps, nowChallenged, err
		}
	}
	b.Log.Info("resource realm done", "sweeps", sweeps, "challenged", nowChallenged)
	return sweeps, nowChallenged, b.ToMain(ctx)
}

// Baphomet fights the Baphomet Challenge once. While the fight runs it
// watches the prompt rows with fast band captures and taps Dodge whenever it
// shows; each dodge grants a Final DMG Boost for the rest of the fight.
func Baphomet(ctx context.Context, b *bot.Bot) (dodges int, err error) {
	if _, err := openGameMode(ctx, b, baphTile, screens.Baphomet); err != nil {
		return 0, err
	}
	// The page animates in and ignores taps meanwhile; confirm the fight
	// actually started before watching for prompts.
	started := false
	for try := 0; try < 3 && !started; try++ {
		if err := bot.Sleep(ctx, 1500*time.Millisecond); err != nil {
			return 0, err
		}
		if err := b.Tap(ctx, baphChallenge, "baphomet challenge"); err != nil {
			return 0, err
		}
		id, _, err := b.Look(ctx)
		if err != nil {
			return 0, err
		}
		started = id != screens.Baphomet
	}
	if !started {
		return 0, fmt.Errorf("baphomet fight did not start")
	}
	dodge := assets.MustGet(screens.TBaphDodge)
	leave := assets.MustGet(screens.TCombatLeave)
	deadline := time.Now().Add(90 * time.Second) // fights run 50 s
	for time.Now().Before(deadline) {
		band, err := b.D.Rows(ctx, 720, fightBand[0], fightBand[1])
		if err != nil {
			return dodges, err
		}
		if dodge.Find(band, 30).Visible(screens.MinScore) {
			if err := b.D.Tap(ctx, dodgeButton.X, dodgeButton.Y); err != nil {
				return dodges, err
			}
			dodges++
			b.Log.Info("boss skill dodged", "count", dodges)
			// The prompt fades out over ~1 s; don't tap it twice.
			if err := bot.Sleep(ctx, 1500*time.Millisecond); err != nil {
				return dodges, err
			}
			continue
		}
		if leave.Find(band, 30).Visible(screens.MinScore) {
			break
		}
	}
	b.Log.Info("baphomet fight over", "dodges", dodges)
	if err := b.ToMain(ctx); err != nil {
		return dodges, err
	}
	return dodges, nil
}
