package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

var (
	jobChangeButton = image.Pt(670, 385) // right rail
	jobStageTabs    = []image.Point{{98, 595}, {268, 595}, {438, 595}}
	jobTaskList     = image.Rect(500, 640, 700, 1090)
)

// JobChange claims every finished job-change stage task (50 diamonds each,
// and the stage bonus once all are done). It reuses the quest panel's Claim
// button, which this page shares; anything else on the page is left to the
// guide-arrow follower, which handles the job change itself.
func JobChange(ctx context.Context, b *bot.Bot) (claimed int, err error) {
	if err := b.ToMain(ctx); err != nil {
		return 0, err
	}
	if err := b.Tap(ctx, jobChangeButton, "job change"); err != nil {
		return 0, err
	}
	if _, _, err := b.Wait(ctx, 10*time.Second, screens.JobChange); err != nil {
		return 0, err
	}
	claim := assets.MustGet(screens.TQuestClaim)
	for _, tab := range jobStageTabs {
		if err := b.Tap(ctx, tab, "job stage tab"); err != nil {
			return claimed, err
		}
		for i := 0; i < 6; i++ {
			_, frame, err := b.Look(ctx)
			if err != nil {
				return claimed, err
			}
			m := claim.FindIn(frame, jobTaskList)
			if !m.Visible(screens.MinScore) {
				break
			}
			if err := b.Tap(ctx, m.Center(), "claim job task"); err != nil {
				return claimed, err
			}
			claimed++
			if err := closePopups(ctx, b, screens.JobChange); err != nil {
				return claimed, err
			}
		}
	}
	if claimed > 0 {
		b.Log.Info("job change tasks claimed", "count", claimed)
	}
	return claimed, b.ToMain(ctx)
}
