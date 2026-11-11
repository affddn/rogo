package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// stageRun bounds one Stage Challenge session. Wins chain into the next stage
// automatically (40 s each), so a good run can clear several in a row.
const stageRun = 8 * time.Minute

var stageChallenge = image.Pt(662, 1030)

// Stage starts Stage Challenge and waits for the chain of battles to end,
// which it always does with a defeat once the next stage is too strong.
// Retrying after growth pushes the main stage forward.
func Stage(ctx context.Context, b *bot.Bot) (lost bool, err error) {
	if err := b.ToMain(ctx); err != nil {
		return false, err
	}
	// By position: battle effects and the stage counter often cover the label.
	if err := b.Tap(ctx, stageChallenge, "stage challenge"); err != nil {
		return false, err
	}
	return WaitStage(ctx, b)
}

// WaitStage waits out a running stage challenge chain, leaves the defeat
// screen and returns to main. Boss stages prompt Dodge before their big
// skills (dodging also gives Final DMG Boost); the bottom band is watched
// for it between full looks. A new character's tutorial dialogues pop up
// between stages and pause the chain until skipped.
func WaitStage(ctx context.Context, b *bot.Bot) (lost bool, err error) {
	start := time.Now()
	var id screens.ID
	var frame image.Image
	dodge := assets.MustGet(screens.TBaphDodge)
	leave := assets.MustGet(screens.TStageLeave)
	dodges := 0
	// A full screenshot takes seconds on the cloud link, a band well under
	// one, and the Dodge prompt is brief: watch the band, and look at the
	// whole screen only when the defeat's Leave shows there or every 10 s
	// (main after a won chain, tutorials).
	looked := time.Now()
	for time.Since(start) < stageRun {
		band, err := b.D.Rows(ctx, 720, fightBand[0], fightBand[1])
		if ctx.Err() != nil {
			return false, ctx.Err()
		}
		if err == nil && dodge.Find(band, 30).Visible(screens.MinScore) {
			if err := b.D.Tap(ctx, dodgeButton.X, dodgeButton.Y); err != nil {
				return false, err
			}
			dodges++
			b.Log.Info("boss skill dodged", "count", dodges)
			// The prompt fades out over ~1 s; don't tap it twice.
			if err := bot.Sleep(ctx, 1500*time.Millisecond); err != nil {
				return false, err
			}
			continue
		}
		ended := err == nil && leave.Find(band, 30).Visible(screens.MinScore)
		if !ended && time.Since(looked) < 10*time.Second {
			continue
		}
		looked = time.Now()
		if id, frame, err = b.Look(ctx); err != nil {
			return false, err
		}
		if id == screens.StageDefeat || id == screens.Main {
			break
		}
		if id != screens.InCombat && id != screens.Unknown && id != screens.Loading {
			break // some other page: not a stage fight; ToMain takes over
		}
		if screens.Visible(frame, screens.TTutSkip) {
			b.Log.Info("skipping tutorial between stages")
			if err := b.TapTemplate(ctx, frame, screens.TTutSkip); err != nil {
				return false, err
			}
			continue
		}
	}
	lost = id == screens.StageDefeat
	if lost {
		if _, err := b.Dismiss(ctx, id, frame); err != nil {
			return lost, err
		}
	}
	b.Log.Info("stage challenge over", "lost", lost, "dodges", dodges, "took", time.Since(start).Round(time.Second))
	return lost, b.ToMain(ctx)
}
