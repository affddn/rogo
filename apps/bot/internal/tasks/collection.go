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

// Collection Wish (right rail) draws Collection Equipment shards and
// Oridecon with its own tickets, which the Endless Tower sweep and floors
// give. A Wish is only tapped while its price shows the ticket icon and a
// green count; the free ad wish is taken while its button is badged.
var (
	rightRailIconDY = -48
	wishAd          = image.Pt(80, 1117)
	wishAdBadge     = image.Pt(107, 1088)
	wishSkipBox     = image.Rect(516, 797, 544, 825)
	wishButtons     = []struct {
		tap        image.Point
		cost, icon image.Rectangle
	}{
		{image.Pt(591, 1117), image.Rect(586, 1124, 640, 1148), image.Rect(536, 1108, 596, 1158)}, // Wish 10x
		{image.Pt(296, 1117), image.Rect(292, 1124, 345, 1148), image.Rect(246, 1108, 306, 1158)}, // Wish 1x
	}
	// Milestone chests at 30, 60, 90, 120 and 200 wishes; a claimable one
	// is badged at its top-right.
	wishMilestones = []int{200, 311, 421, 531, 642}
	wishMilestoneY = 970
)

// CollectionWish takes the ad wish, wishes while tickets last and claims
// reached milestone chests.
func CollectionWish(ctx context.Context, b *bot.Bot) (wishes int, err error) {
	frame, err := openRightRail(ctx, b, screens.TRailCollectionWish, screens.CollectionWish)
	if err != nil || frame == nil {
		return 0, err
	}
	if vision.Ratio(frame, wishSkipBox, isCheckGreen) < 0.1 {
		if err := b.Tap(ctx, centre(wishSkipBox), "skip animation"); err != nil {
			return 0, err
		}
	}
	draw := func(p image.Point, what string, n int) error {
		if _, _, err := b.TapWait(ctx, screens.CollectionWish, p, what, 10*time.Second, screens.WishResult); err != nil {
			return err
		}
		wishes += n
		_, res, err := b.Look(ctx)
		if err != nil {
			return err
		}
		if err := b.TapTemplate(ctx, res, screens.TColWishOK); err != nil {
			return err
		}
		_, frame, err = b.Wait(ctx, 10*time.Second, screens.CollectionWish)
		return err
	}
	if badged(frame, wishAdBadge) {
		if err := draw(wishAd, "ad wish", 1); err != nil {
			return wishes, err
		}
	}
	for range 30 {
		drew := false
		for i, w := range wishButtons {
			if !wishAffordable(frame, w.cost, w.icon) {
				continue
			}
			if err := draw(w.tap, "wish", []int{10, 1}[i]); err != nil {
				return wishes, err
			}
			drew = true
			break
		}
		if !drew {
			break
		}
	}
	for _, x := range wishMilestones {
		if !badged(frame, image.Pt(x+27, wishMilestoneY-26)) {
			continue
		}
		if err := b.Tap(ctx, image.Pt(x, wishMilestoneY), "wish milestone"); err != nil {
			return wishes, err
		}
		if err := closePopups(ctx, b, screens.CollectionWish); err != nil {
			return wishes, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return wishes, err
		}
	}
	if wishes > 0 {
		b.Log.Info("collection wishes", "count", wishes)
	}
	return wishes, b.ToMain(ctx)
}

// wishAffordable: the price shows a ticket (never diamonds) and its count
// is green.
func wishAffordable(frame image.Image, cost, icon image.Rectangle) bool {
	return assets.MustGet(screens.TColWishTicket).FindIn(frame, icon).Visible(screens.MinScore) &&
		vision.Ratio(frame, cost, vision.IsGreenText) > 0.03
}

func isCheckGreen(c color.RGBA) bool {
	return c.G > 150 && int(c.G)-int(c.R) > 60 && int(c.G)-int(c.B) > 40
}

// openRightRail opens a main-screen right-rail feature by its label; nil
// when the label is not there.
func openRightRail(ctx context.Context, b *bot.Bot, label string, want ...screens.ID) (image.Image, error) {
	if err := b.ToMain(ctx); err != nil {
		return nil, err
	}
	_, frame, err := b.Look(ctx)
	if err != nil {
		return nil, err
	}
	m := assets.MustGet(label).FindIn(frame, screens.RightRail)
	if m.Score < 0.7 {
		return nil, nil
	}
	_, frame, err = b.TapWait(ctx, screens.Main, m.Center().Add(image.Pt(0, rightRailIconDY)), label, 10*time.Second, want...)
	return frame, err
}

// Collection Gear (Equipment page, third tab): shards activate items in an
// album whose attributes count for every job, like cards.
var (
	colGearTab      = image.Pt(660, 1240)
	colGearTabBadge = image.Pt(698, 1192)
	colGearGrid     = image.Rect(0, 200, 720, 1000)
	colGearClose    = image.Pt(665, 120)
	// Sub-tabs: Archive (activate items) and Equip (wear them, and enhance
	// what is worn with Oridecon, 30 a level).
	colGearArchive      = image.Pt(141, 1139)
	colGearEquip        = image.Pt(359, 1139)
	colGearEquipBadge   = image.Pt(455, 1117)
	colGearEnhance      = image.Pt(359, 1031)
	colGearEnhanceBadge = image.Pt(460, 1012)
)

// collectionGear enhances the worn Collection Gear while One-Tap Enhance is
// badged, activates every item marked Can Activate, from the Equipment page
// (on from), and returns to the Equipment tab. The page opens on whichever
// sub-tab was used last.
func collectionGear(ctx context.Context, b *bot.Bot, from screens.ID) (activated int, err error) {
	frame, err := lookOrTap(ctx, b, from, colGearTab, "collection gear tab")
	if err != nil {
		return 0, err
	}
	if badged(frame, colGearEquipBadge) {
		if _, frame, err = b.TapWait(ctx, screens.CollectionGear, colGearEquip, "collection equip tab", 8*time.Second, screens.CollectionGear); err != nil {
			return 0, err
		}
		if err := bot.Sleep(ctx, time.Second); err != nil {
			return 0, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return 0, err
		}
	}
	if badged(frame, colGearEnhanceBadge) {
		if err := b.Tap(ctx, colGearEnhance, "collection one-tap enhance"); err != nil {
			return 0, err
		}
		activated++
		b.Log.Info("collection gear enhanced")
		if err := closePopups(ctx, b, screens.CollectionGear); err != nil {
			return activated, err
		}
	}
	if _, frame, err = b.TapWait(ctx, screens.CollectionGear, colGearArchive, "collection archive tab", 8*time.Second, screens.CollectionGear); err != nil {
		return activated, err
	}
	if err := bot.Sleep(ctx, time.Second); err != nil {
		return activated, err
	}
	if _, frame, err = b.Look(ctx); err != nil {
		return activated, err
	}
	canActivate := assets.MustGet(screens.TColGearCanActivate)
	for range 12 {
		var next image.Point
		found := false
		for _, m := range canActivate.FindAll(frame, colGearGrid, 0.85, 60) {
			if m.Visible(0.85) {
				next, found = m.Center(), true
				break
			}
		}
		if !found {
			break
		}
		if err := b.Tap(ctx, next, "collection item"); err != nil {
			return activated, err
		}
		if err := bot.Sleep(ctx, 1500*time.Millisecond); err != nil {
			return activated, err
		}
		_, details, err := b.Look(ctx)
		if err != nil {
			return activated, err
		}
		if !screens.Visible(details, screens.TColGearActivate) {
			b.Log.Warn("collection item shows no Activate", "shot", b.Save(details))
			_ = b.Tap(ctx, colGearClose, "close details")
			break
		}
		if err := b.TapTemplate(ctx, details, screens.TColGearActivate); err != nil {
			return activated, err
		}
		activated++
		if err := bot.Sleep(ctx, 1500*time.Millisecond); err != nil {
			return activated, err
		}
		if _, frame, err = b.TapWait(ctx, screens.CardDetails, colGearClose, "close details", 8*time.Second, screens.CollectionGear); err != nil {
			return activated, err
		}
	}
	if activated > 0 {
		b.Log.Info("collection gear done", "steps", activated)
	}
	_, _, err = b.TapWait(ctx, screens.CollectionGear, equipmentTab, "equipment tab", 8*time.Second, screens.Equipment)
	return activated, err
}

// lookOrTap returns the Collection Gear page: as it is when from is that
// page already, else after tapping its tab on page from.
func lookOrTap(ctx context.Context, b *bot.Bot, from screens.ID, tab image.Point, what string) (image.Image, error) {
	if from == screens.CollectionGear {
		_, frame, err := b.Look(ctx)
		return frame, err
	}
	_, frame, err := b.TapWait(ctx, from, tab, what, 8*time.Second, screens.CollectionGear)
	return frame, err
}
