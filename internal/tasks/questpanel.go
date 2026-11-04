package tasks

import (
	"context"
	"image"
	"image/color"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

var (
	questButton = image.Pt(670, 270) // right rail Quest
	questTabs   = []image.Point{{206, 246}, {508, 246}}
	// Activity chests (20..100 points) sit at fixed spots along the progress
	// bar; one that can be opened glows and carries a badge.
	questChests = []image.Point{{195, 345}, {303, 345}, {411, 345}, {519, 345}, {628, 345}}
	chestBadge  = image.Pt(27, -26) // from chest centre
	questList   = image.Rect(500, 430, 680, 1150)
)

// QuestPanel claims every completed daily and weekly quest (one Claim tap
// takes all finished ones) and opens every unlocked activity chest.
func QuestPanel(ctx context.Context, b *bot.Bot) (claimed int, err error) {
	if err := b.ToMain(ctx); err != nil {
		return 0, err
	}
	if _, _, err := b.TapWait(ctx, screens.Main, questButton, "quest panel", 8*time.Second, screens.QuestPanel); err != nil {
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

// readyChest returns the first activity chest that can be opened: badged or
// glowing (either shows alone now and then). Glowing chests have a fifth of
// their surroundings near-white; locked and opened ones under 1%.
func readyChest(frame image.Image) (image.Point, bool) {
	for _, c := range questChests {
		p := c.Add(chestBadge)
		badged := vision.Ratio(frame, image.Rect(p.X-7, p.Y-7, p.X+7, p.Y+7), vision.IsBadgeRed) > 0.25
		glow := vision.Ratio(frame, image.Rect(c.X-50, c.Y-53, c.X+50, c.Y+27), chestGlow) > 0.08
		if badged || glow {
			return c, true
		}
	}
	return image.Point{}, false
}

func chestGlow(c color.RGBA) bool { return c.R >= 250 && c.G >= 238 && c.B >= 150 }
