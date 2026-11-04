package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

var (
	mvpTile        = image.Pt(540, 810)
	mvpChallenge   = image.Rect(104, 1124, 254, 1166)
	mvpSweep       = image.Rect(424, 1124, 634, 1166)
	mvpSweepOK     = image.Pt(497, 830)
	mvpFightLimit  = 3 * time.Minute
	mvpDailySweeps = 3
)

// mvpButtonLive reports whether a button on the MVP page is orange; it
// greys out once there is nothing to challenge or no attempts are left,
// and only colour tells the two apart.
func mvpButtonLive(frame image.Image, r image.Rectangle) bool {
	red, _, blue := meanRGB(frame, r)
	return red-blue > 40
}

// MVP fights the MVP boss and sweeps it. Challenge is free: it fights up
// through every difficulty it can clear, taking each one's first-clear
// reward (diamonds, EXP, cards), and ends in a defeat at the first it
// cannot. Sweeps spend the daily attempts on the highest cleared difficulty
// for random cards. done reports that no attempts are left today.
func MVP(ctx context.Context, b *bot.Bot) (challenged bool, sweeps int, done bool, err error) {
	frame, err := openGameMode(ctx, b, mvpTile, screens.MVP)
	if err != nil {
		return false, 0, false, err
	}
	if mvpButtonLive(frame, mvpChallenge) {
		if err := b.Tap(ctx, centre(mvpChallenge), "mvp challenge"); err != nil {
			return false, 0, false, err
		}
		challenged = true
		if frame, err = awaitMVPPage(ctx, b); err != nil {
			return challenged, 0, false, err
		}
		b.Log.Info("mvp challenge over")
	}
	for sweeps < mvpDailySweeps && mvpButtonLive(frame, mvpSweep) {
		if _, _, err := b.TapWait(ctx, screens.MVP, centre(mvpSweep), "mvp sweep", 8*time.Second, screens.MVPSweep); err != nil {
			return challenged, sweeps, false, err
		}
		if err := b.Tap(ctx, mvpSweepOK, "confirm sweep"); err != nil {
			return challenged, sweeps, false, err
		}
		sweeps++
		if frame, err = awaitMVPPage(ctx, b); err != nil {
			return challenged, sweeps, false, err
		}
	}
	done = !mvpButtonLive(frame, mvpSweep)
	b.Log.Info("mvp done", "challenged", challenged, "sweeps", sweeps)
	return challenged, sweeps, done, b.ToMain(ctx)
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
		case screens.InCombat, screens.Unknown:
			// Mid-fight frames and transitions: wait, never press back.
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
