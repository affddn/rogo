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
	questButton = image.Pt(670, 270) // right rail Quest
	questTabs   = []image.Point{{206, 246}, {508, 246}}
	// Activity chests sit at fixed spots along the progress bar; a badge
	// above one means it can be opened.
	questChests = []image.Point{{192, 345}, {286, 345}, {380, 345}, {474, 345}, {568, 345}}
	chestBadge  = image.Pt(28, -26) // from chest centre
	questList   = image.Rect(500, 430, 680, 1150)
)

// QuestPanel claims every completed daily and weekly quest (one Claim tap
// takes all finished ones) and opens every unlocked activity chest.
func QuestPanel(ctx context.Context, b *bot.Bot) (claimed int, err error) {
	if err := b.ToMain(ctx); err != nil {
		return 0, err
	}
	if err := b.Tap(ctx, questButton, "quest panel"); err != nil {
		return 0, err
	}
	if _, _, err := b.Wait(ctx, 8*time.Second, screens.QuestPanel); err != nil {
		return 0, err
	}
	claim := assets.MustGet(screens.TQuestClaim)
	for _, tab := range questTabs {
		if err := b.Tap(ctx, tab, "quest tab"); err != nil {
			return claimed, err
		}
		for i := 0; i < 8; i++ {
			_, frame, err := b.Look(ctx)
			if err != nil {
				return claimed, err
			}
			if m := claim.FindIn(frame, questList); m.Visible(screens.MinScore) {
				if err := b.Tap(ctx, m.Center(), "claim quest"); err != nil {
					return claimed, err
				}
				claimed++
			} else if p, ok := readyChest(frame); ok {
				if err := b.Tap(ctx, p, "activity chest"); err != nil {
					return claimed, err
				}
				claimed++
			} else {
				break
			}
			if err := closePopups(ctx, b, screens.QuestPanel); err != nil {
				return claimed, err
			}
		}
	}
	if claimed > 0 {
		b.Log.Info("quest panel claimed", "count", claimed)
	}
	return claimed, b.ToMain(ctx)
}

func readyChest(frame image.Image) (image.Point, bool) {
	for _, c := range questChests {
		p := c.Add(chestBadge)
		if vision.Ratio(frame, image.Rect(p.X-7, p.Y-7, p.X+7, p.Y+7), vision.IsBadgeRed) > 0.25 {
			return c, true
		}
	}
	return image.Point{}, false
}
