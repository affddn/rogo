package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

// attributeTab is the Attribute tab in the Character page's bottom bar.
var attributeTab = image.Pt(350, 1235)

// open goes from the main screen to a bottom-nav page.
func open(ctx context.Context, b *bot.Bot, nav string, want ...screens.ID) (image.Image, error) {
	if err := b.ToMain(ctx); err != nil {
		return nil, err
	}
	_, frame, err := b.Look(ctx)
	if err != nil {
		return nil, err
	}
	if err := b.TapTemplate(ctx, frame, nav); err != nil {
		return nil, err
	}
	_, frame, err = b.Wait(ctx, 10*time.Second, want...)
	return frame, err
}

// Attributes spends free attribute points with the game's Recommended
// Allocation, which follows the class's intended build.
func Attributes(ctx context.Context, b *bot.Bot) (bool, error) {
	frame, err := open(ctx, b, screens.TNavCharacter, screens.Attribute, screens.CharOverview)
	if err != nil {
		return false, err
	}
	if screens.Detect(frame) == screens.CharOverview {
		if err := b.Tap(ctx, attributeTab, "attribute tab"); err != nil {
			return false, err
		}
		if _, frame, err = b.Wait(ctx, 10*time.Second, screens.Attribute); err != nil {
			return false, err
		}
	}
	if err := b.TapTemplate(ctx, frame, screens.TAttrRecommended); err != nil {
		return false, err
	}
	_, frame, err = b.Look(ctx)
	if err != nil {
		return false, err
	}
	spent := screens.Visible(frame, screens.TAttrConfirm)
	if spent {
		if err := b.TapTemplate(ctx, frame, screens.TAttrConfirm); err != nil {
			return false, err
		}
		b.Log.Info("attribute points allocated")
	}
	return spent, b.ToMain(ctx)
}

// Enhance slots on the Enhance page: the item icon and its upgrade badge.
var enhanceSlots = []struct{ icon, badge image.Point }{
	{image.Pt(67, 163), image.Pt(118, 115)},  // armor
	{image.Pt(67, 275), image.Pt(118, 227)},  // belt
	{image.Pt(67, 387), image.Pt(118, 339)},  // pants
	{image.Pt(653, 163), image.Pt(704, 115)}, // cape
	{image.Pt(653, 275), image.Pt(704, 227)}, // gloves
	{image.Pt(653, 387), image.Pt(704, 339)}, // boots
	{image.Pt(67, 497), image.Pt(118, 449)},  // accessory left
	{image.Pt(653, 497), image.Pt(704, 449)}, // accessory right
}

// enhanceCost is the "have" count above the Enhance button; green when the
// next level is affordable.
var enhanceCost = image.Rect(160, 1054, 205, 1078)

func badged(frame image.Image, p image.Point) bool {
	return vision.Ratio(frame, image.Rectangle{Min: p.Sub(image.Pt(7, 7)), Max: p.Add(image.Pt(7, 7))}, vision.IsBadgeRed) > 0.25
}

// Equipment enhances gear one level at a time, round-robin over every slot
// that shows an upgrade badge, so levels stay even for the set resonance
// bonus. It stops when nothing is badged or the cost turns unaffordable.
func Equipment(ctx context.Context, b *bot.Bot) (levels int, err error) {
	frame, err := open(ctx, b, screens.TNavEquipment, screens.Equipment)
	if err != nil {
		return 0, err
	}
	if err := b.TapTemplate(ctx, frame, screens.TEquipUpgrade); err != nil {
		return 0, err
	}
	if _, _, err = b.Wait(ctx, 10*time.Second, screens.Enhance); err != nil {
		return 0, err
	}

	for round := 0; round < 30; round++ {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return levels, err
		}
		if id != screens.Enhance {
			b.Log.Warn("left enhance page", "screen", id)
			break
		}
		progressed := false
		for _, s := range enhanceSlots {
			if !badged(frame, s.badge) {
				continue
			}
			if err := b.Tap(ctx, s.icon, "enhance slot"); err != nil {
				return levels, err
			}
			_, sel, err := b.Look(ctx)
			if err != nil {
				return levels, err
			}
			if vision.Ratio(sel, enhanceCost, vision.IsGreenText) < 0.05 {
				b.Log.Info("enhance materials exhausted")
				return levels, b.ToMain(ctx)
			}
			if err := b.TapTemplate(ctx, sel, screens.TEnhanceButton); err != nil {
				return levels, err
			}
			levels++
			progressed = true
		}
		if !progressed {
			break
		}
	}
	b.Log.Info("equipment enhanced", "levels", levels)
	return levels, b.ToMain(ctx)
}
