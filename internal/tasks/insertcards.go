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
	insertCardTab = image.Pt(370, 1138)
	// Card slots sit in four fixed columns; scanning narrow strips keeps
	// the "+" search fast.
	slotColumns = []int{127, 282, 437, 592}
	slotRows    = [2]int{200, 1100}
	// The availability badge sits at the slot's top-right corner, relative
	// to the "+" glyph's centre.
	slotBadge = image.Pt(61, -88)
)

// emptySlots returns the "+" centres of empty card slots that carry a badge,
// i.e. a spare card fits them.
func emptySlots(frame image.Image) []image.Point {
	plus := assets.MustGet(screens.TCardSlotPlus)
	var out []image.Point
	for _, cx := range slotColumns {
		strip := image.Rect(cx-36, slotRows[0], cx+36, slotRows[1])
		for _, m := range plus.FindAll(frame, strip, 0.85, 60) {
			c := m.Center()
			if vision.Ratio(frame, image.Rectangle{Min: c.Add(slotBadge).Sub(image.Pt(7, 7)), Max: c.Add(slotBadge).Add(image.Pt(7, 7))}, vision.IsBadgeRed) > 0.25 {
				out = append(out, c)
			}
		}
	}
	return out
}

// insertCards fills every badged empty card slot on the Insert Card tab,
// scrolling through all equipment sections. The dialog preselects a card
// that is not inserted anywhere; choosing between several by effect (ASPD >
// CRIT > ATK for the katar build) is tracked in #18.
func insertCards(ctx context.Context, b *bot.Bot) (inserted int, err error) {
	if err := b.Tap(ctx, insertCardTab, "insert card tab"); err != nil {
		return 0, err
	}
	var last string
	for page := 0; page < 6; page++ {
		_, frame, err := b.Look(ctx)
		if err != nil {
			return inserted, err
		}
		slots := emptySlots(frame)
		if len(slots) > 0 {
			if err := b.Tap(ctx, slots[0], "empty card slot"); err != nil {
				return inserted, err
			}
			_, f, err := b.Wait(ctx, 8*time.Second, screens.InsertCard)
			if err != nil {
				return inserted, err
			}
			if err := b.TapTemplate(ctx, f, screens.TInsertCardButton); err != nil {
				return inserted, err
			}
			inserted++
			b.Log.Info("card inserted")
			if err := closePopups(ctx, b, screens.CardPage); err != nil {
				return inserted, err
			}
			page-- // look at the same page again
			continue
		}
		// Stop at the bottom: a scroll that changes nothing.
		fp := screens.Fingerprint(frame, image.Rect(60, 260, 660, 1080))
		if fp == last {
			break
		}
		last = fp
		if err := b.D.Swipe(ctx, 360, 950, 360, 350, 600*time.Millisecond); err != nil {
			return inserted, err
		}
		if err := bot.Sleep(ctx, 1200*time.Millisecond); err != nil {
			return inserted, err
		}
	}
	return inserted, nil
}
