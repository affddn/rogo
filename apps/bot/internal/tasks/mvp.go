package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

var (
	mvpTile        = image.Pt(540, 810)
	mvpChallenge   = image.Rect(104, 1124, 254, 1166)
	mvpSweep       = image.Rect(424, 1124, 634, 1166)
	mvpSweepOK     = image.Pt(497, 830)
	mvpFightLimit  = 3 * time.Minute
	mvpDailySweeps = 5 // a cap; the Sweep button greys out when attempts run out

	// mvpBosses are the boss tabs' name labels, newest (best rewards) first,
	// in case attempts are shared. The tab strip scrolls to centre the picked
	// boss, so tabs are found by label; a locked boss's tab is dim and has no
	// badge.
	mvpBosses    = []string{screens.TMVPTabGTB, screens.TMVPTabAngeling}
	mvpTabStrip  = image.Rect(0, 80, 720, 185)
	mvpTabBadgeY = 93
)

// mvpButtonLive reports whether a button on the MVP page is orange; it
// greys out once there is nothing to challenge or no attempts are left,
// and only colour tells the two apart.
func mvpButtonLive(frame image.Image, r image.Rectangle) bool {
	red, _, blue := meanRGB(frame, r)
	return red-blue > 40
}

// MVP works every unlocked MVP boss whose tab is badged (see mvpBoss).
// done reports that no boss tab is badged any more. For a quest ("Challenge
// or Sweep MVP Challenge"), with nothing badged it challenges the first boss
// whose Challenge button is still live: the tab loses its badge once the
// sweeps are spent although the next difficulty can still be tried.
func MVP(ctx context.Context, b *bot.Bot, quest bool) (challenged bool, sweeps int, done bool, err error) {
	frame, err := openGameMode(ctx, b, mvpTile, screens.MVP)
	if err != nil {
		return false, 0, false, err
	}
	for _, boss := range mvpBosses {
		m, ok := mvpTab(frame, boss)
		if !ok {
			continue
		}
		if err := b.Tap(ctx, m.Center(), "mvp boss"); err != nil {
			return challenged, sweeps, false, err
		}
		if err := bot.Sleep(ctx, 2*time.Second); err != nil {
			return challenged, sweeps, false, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return challenged, sweeps, false, err
		}
		c, n, f, err := mvpBoss(ctx, b, frame)
		challenged, sweeps = challenged || c, sweeps+n
		if err != nil {
			return challenged, sweeps, false, err
		}
		frame = f
	}
	if quest && !challenged && sweeps == 0 {
		if challenged, frame, err = mvpQuestChallenge(ctx, b, frame); err != nil {
			return challenged, sweeps, false, err
		}
	}
	done = true
	for _, boss := range mvpBosses {
		if _, ok := mvpTab(frame, boss); ok {
			done = false
		}
	}
	b.Log.Info("mvp done", "challenged", challenged, "sweeps", sweeps)
	return challenged, sweeps, done, b.ToMain(ctx)
}

// mvpQuestChallenge challenges the first unlocked boss whose Challenge
// button is live, badged or not.
func mvpQuestChallenge(ctx context.Context, b *bot.Bot, frame image.Image) (bool, image.Image, error) {
	for _, boss := range mvpBosses {
		m := assets.MustGet(boss).FindIn(frame, mvpTabStrip)
		if m.Score < 0.7 {
			continue
		}
		if err := b.Tap(ctx, m.Center(), "mvp boss"); err != nil {
			return false, frame, err
		}
		if err := bot.Sleep(ctx, 2*time.Second); err != nil {
			return false, frame, err
		}
		_, f, err := b.Look(ctx)
		if err != nil {
			return false, frame, err
		}
		frame = f
		if !mvpButtonLive(frame, mvpChallenge) {
			continue
		}
		if err := b.Tap(ctx, centre(mvpChallenge), "mvp challenge"); err != nil {
			return false, frame, err
		}
		if frame, err = awaitMVPPage(ctx, b); err != nil {
			return true, frame, err
		}
		b.Log.Info("mvp challenge over", "for", "quest")
		return true, frame, nil
	}
	return false, frame, nil
}

// mvpTab finds a boss's tab if it is unlocked and badged.
func mvpTab(frame image.Image, boss string) (vision.Match, bool) {
	m := assets.MustGet(boss).FindIn(frame, mvpTabStrip)
	return m, m.Score >= 0.7 && badged(frame, image.Pt(m.At.X+m.Size.X-2, mvpTabBadgeY))
}

// mvpBoss fights the selected boss and sweeps it. Challenge is free: it
// fights up through every difficulty it can clear, taking each one's
// first-clear reward (diamonds, EXP, cards), and ends in a defeat at the
// first it cannot. Sweeps spend the daily attempts on the highest cleared
// difficulty for random cards.
func mvpBoss(ctx context.Context, b *bot.Bot, frame image.Image) (challenged bool, sweeps int, _ image.Image, err error) {
	if mvpButtonLive(frame, mvpChallenge) {
		if err := b.Tap(ctx, centre(mvpChallenge), "mvp challenge"); err != nil {
			return false, 0, frame, err
		}
		challenged = true
		if frame, err = awaitMVPPage(ctx, b); err != nil {
			return challenged, 0, frame, err
		}
		b.Log.Info("mvp challenge over")
	}
	for sweeps < mvpDailySweeps && mvpButtonLive(frame, mvpSweep) {
		if _, _, err := b.TapWait(ctx, screens.MVP, centre(mvpSweep), "mvp sweep", 8*time.Second, screens.MVPSweep); err != nil {
			return challenged, sweeps, frame, err
		}
		if err := b.Tap(ctx, mvpSweepOK, "confirm sweep"); err != nil {
			return challenged, sweeps, frame, err
		}
		sweeps++
		if frame, err = awaitMVPPage(ctx, b); err != nil {
			return challenged, sweeps, frame, err
		}
	}
	return challenged, sweeps, frame, nil
}

// awaitMVPPage waits out a fight or sweep and closes its result screens
// until the MVP page is back.
func awaitMVPPage(ctx context.Context, b *bot.Bot) (image.Image, error) {
	deadline := time.Now().Add(mvpFightLimit)
	for time.Now().Before(deadline) {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return nil, err
		}
		switch id {
		case screens.MVP:
			return frame, nil
		case screens.InCombat:
			// Watch for the boss's Dodge prompt until the result screen.
			if _, err := watchFight(ctx, b, time.Until(deadline)); err != nil {
				return nil, err
			}
			continue
		case screens.Unknown:
			// Transitions and result screens: wait, never press back.
		default:
			if _, err := b.Dismiss(ctx, id, frame); err != nil {
				return nil, err
			}
			continue
		}
		if err := bot.Sleep(ctx, 2*time.Second); err != nil {
			return nil, err
		}
	}
	_, frame, err := b.Look(ctx)
	return frame, err
}

func centre(r image.Rectangle) image.Point {
	return image.Pt((r.Min.X+r.Max.X)/2, (r.Min.Y+r.Max.Y)/2)
}
