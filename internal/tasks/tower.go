package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// Endless Tower (Game Mode): a free Daily Sweep of the best floor reached
// (Collection Wish tickets, Oridecon), and five daily Challenge attempts
// that climb floor by floor, solo, until a defeat.
var (
	towerTile       = image.Pt(540, 1090) // Game Mode, third row right
	towerSweep      = image.Pt(277, 1228)
	towerSweepBadge = image.Pt(380, 1201)
	towerChallenge  = image.Pt(541, 1228)
	towerLeave      = image.Pt(360, 1072)
	// Tapping below the Daily Sweep dialog closes it.
	towerSweepClose = image.Pt(360, 1000)
)

// TowerResult reports one Endless Tower run.
type TowerResult struct {
	Swept      bool
	Challenged bool
	Climbed    bool // the challenge cleared at least one floor
	Spent      bool // Remaining Attempts read 0/5; no challenge was tried
}

// EndlessTower takes the free sweep while badged and, if challenge, fights
// one Challenge attempt (watching for Dodge). The Challenge button stays
// orange at 0/5 attempts, so the counter is read first.
func EndlessTower(ctx context.Context, b *bot.Bot, challenge bool) (res TowerResult, err error) {
	frame, err := openGameMode(ctx, b, towerTile, screens.EndlessTower)
	if err != nil {
		return res, err
	}
	if badged(frame, towerSweepBadge) {
		_, dlg, err := b.TapWait(ctx, screens.EndlessTower, towerSweep, "tower sweep", 8*time.Second, screens.DailySweep)
		if err != nil {
			return res, err
		}
		if screens.Visible(dlg, screens.TTowerSweepFree) {
			if err := b.TapTemplate(ctx, dlg, screens.TTowerSweepFree); err != nil {
				return res, err
			}
			res.Swept = true
			b.Log.Info("tower swept")
		} else if err := b.Tap(ctx, towerSweepClose, "close sweep"); err != nil {
			return res, err
		}
		if err := closePopups(ctx, b, screens.EndlessTower); err != nil {
			return res, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return res, err
		}
	}
	if challenge && screens.Visible(frame, screens.TTowerAttemptsZero) {
		res.Spent = true
		b.Log.Info("tower attempts used up")
	} else if challenge {
		res.Challenged = true
		if res.Climbed, err = towerFight(ctx, b); err != nil {
			return res, err
		}
		b.Log.Info("tower challenged", "climbed", res.Climbed)
	}
	return res, b.ToMain(ctx)
}

// towerFight starts a Challenge and follows it to its result (Dodge on the
// way), then leaves. Climbed is false when the result reads "Cleared Floor 0
// this time".
func towerFight(ctx context.Context, b *bot.Bot) (climbed bool, err error) {
	if err := b.Tap(ctx, towerChallenge, "tower challenge"); err != nil {
		return false, err
	}
	dodge := assets.MustGet(screens.TBaphDodge)
	leave := assets.MustGet(screens.TStageLeave)
	deadline := time.Now().Add(4 * time.Minute)
	for time.Now().Before(deadline) {
		band, err := b.D.Rows(ctx, 720, fightBand[0], fightBand[1])
		if ctx.Err() != nil {
			return false, ctx.Err()
		}
		if err != nil {
			continue
		}
		if dodge.Find(band, 30).Visible(screens.MinScore) {
			if err := b.D.Tap(ctx, dodgeButton.X, dodgeButton.Y); err != nil {
				return false, err
			}
			b.Log.Info("boss skill dodged")
			if err := bot.Sleep(ctx, 1500*time.Millisecond); err != nil {
				return false, err
			}
			continue
		}
		if !leave.Find(band, 30).Visible(screens.MinScore) {
			continue
		}
		_, frame, err := b.Look(ctx)
		if err != nil {
			return false, err
		}
		climbed = assets.MustGet(screens.TTowerClearedNone).Find(frame, screens.Margin).Score < 0.8
		if _, _, err := b.TapWait(ctx, screens.Unknown, towerLeave, "leave tower fight", 10*time.Second, screens.EndlessTower); err != nil {
			return climbed, err
		}
		return climbed, nil
	}
	b.Log.Warn("tower fight did not end in time")
	return false, nil
}
