package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// The Ranking page (System > Ranking): each tab shows its top three, and a
// like on each pays 20 diamonds once a day while its thumb is badged.
var (
	rankingEntry = image.Pt(290, 275)
	// Tabs along the bottom, and where a tab's badge sits.
	rankingTabs     = []int{152, 255, 358, 462, 565, 668}
	rankingTabY     = 1235
	rankingTabBadge = image.Pt(38, -43)
	// The top three's like buttons and their badges.
	rankingLikes = []struct{ tap, badge image.Point }{
		{image.Pt(455, 400), image.Pt(470, 384)},
		{image.Pt(213, 348), image.Pt(228, 332)},
		{image.Pt(690, 348), image.Pt(703, 332)},
	}
)

// RankingLikes likes every badged top-three player on every badged tab.
func RankingLikes(ctx context.Context, b *bot.Bot) (likes int, err error) {
	_, frame, err := openSystemEntry(ctx, b, rankingEntry, "ranking", screens.Ranking)
	if err != nil {
		return 0, err
	}
	for _, x := range rankingTabs {
		tab := image.Pt(x, rankingTabY)
		if !badged(frame, tab.Add(rankingTabBadge)) {
			continue
		}
		if err := b.Tap(ctx, tab, "ranking tab"); err != nil {
			return likes, err
		}
		if _, frame, err = b.Wait(ctx, 8*time.Second, screens.Ranking); err != nil {
			return likes, err
		}
		for _, l := range rankingLikes {
			if !badged(frame, l.badge) {
				continue
			}
			if err := b.Tap(ctx, l.tap, "like"); err != nil {
				return likes, err
			}
			likes++
			if err := closePopups(ctx, b, screens.Ranking); err != nil {
				return likes, err
			}
			if _, frame, err = b.Look(ctx); err != nil {
				return likes, err
			}
		}
	}
	if likes > 0 {
		b.Log.Info("ranking likes", "count", likes)
	}
	return likes, b.ToMain(ctx)
}
