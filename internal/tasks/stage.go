package tasks

import (
	"context"
	"errors"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// stageRun bounds one Stage Challenge session. Wins chain into the next stage
// automatically (40 s each), so a good run can clear several in a row.
const stageRun = 8 * time.Minute

// Stage starts Stage Challenge and waits for the chain of battles to end,
// which it always does with a defeat once the next stage is too strong.
// Retrying after growth pushes the main stage forward.
func Stage(ctx context.Context, b *bot.Bot) (lost bool, err error) {
	if err := b.ToMain(ctx); err != nil {
		return false, err
	}
	_, frame, err := b.Look(ctx)
	if err != nil {
		return false, err
	}
	if err := b.TapTemplate(ctx, frame, screens.TMainStageChallenge); err != nil {
		return false, err
	}
	start := time.Now()
	id, frame, err := b.Wait(ctx, stageRun, screens.StageDefeat, screens.Main)
	if err != nil && !errors.Is(err, bot.ErrTimeout) {
		return false, err
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
