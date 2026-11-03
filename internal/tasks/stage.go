package tasks

import (
	"context"
	"image"
	"time"

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
// screen and returns to main. A new character's tutorial dialogues pop up
// between stages and pause the chain until skipped.
func WaitStage(ctx context.Context, b *bot.Bot) (lost bool, err error) {
	start := time.Now()
	var id screens.ID
	var frame image.Image
	for time.Since(start) < stageRun {
		if id, frame, err = b.Look(ctx); err != nil {
			return false, err
		}
		if id == screens.StageDefeat || id == screens.Main {
			break
		}
		if screens.Visible(frame, screens.TTutSkip) {
			b.Log.Info("skipping tutorial between stages")
			if err := b.TapTemplate(ctx, frame, screens.TTutSkip); err != nil {
				return false, err
			}
			continue
		}
		if err := bot.Sleep(ctx, 500*time.Millisecond); err != nil {
			return false, err
		}
	}
	lost = id == screens.StageDefeat
	if lost {
		if _, err := b.Dismiss(ctx, id, frame); err != nil {
			return lost, err
		}
	}
	b.Log.Info("stage challenge over", "lost", lost, "took", time.Since(start).Round(time.Second))
	return lost, b.ToMain(ctx)
}
