package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

// The Backpack (System > Backpack) badges items that can be opened, such as
// Magic Card Album chests. Their popup's Use defaults to every one owned.
var (
	backpackEntry = image.Pt(290, 165)
	backpackClose = image.Pt(665, 297)
	backpackCols  = []int{96, 202, 308, 413, 518, 624}
	backpackRows  = []int{403, 509, 614, 720, 825, 931}
	// A cell's badge sits at its top-right corner.
	backpackBadge = image.Pt(37, -36)
	// The item popup grows with its description; Use sits low in it.
	backpackUseArea = image.Rect(150, 600, 570, 1150)
)

// Backpack uses every badged item once.
func Backpack(ctx context.Context, b *bot.Bot) (used int, err error) {
	if err := b.ToMain(ctx); err != nil {
		return 0, err
	}
	if err := b.Tap(ctx, systemMenuBtn, "system menu"); err != nil {
		return 0, err
	}
	_, frame, err := b.TapWait(ctx, screens.Main, backpackEntry, "backpack", 8*time.Second, screens.Backpack)
	if err != nil {
		return 0, err
	}
	tried := map[image.Point]bool{}
	for range 8 {
		cell, ok := nextBadgedCell(frame, tried)
		if !ok {
			break
		}
		tried[cell] = true
		if err := b.Tap(ctx, cell, "backpack item"); err != nil {
			return used, err
		}
		_, item, err := b.Look(ctx)
		if err != nil {
			return used, err
		}
		use := assets.MustGet(screens.TBackpackUse).FindIn(item, backpackUseArea)
		if use.Visible(screens.MinScore) {
			if err := b.Tap(ctx, use.Center(), "use item"); err != nil {
				return used, err
			}
			used++
		} else if err := b.D.Back(ctx); err != nil { // not one to open here
			return used, err
		}
		if err := closePopups(ctx, b, screens.Backpack); err != nil {
			return used, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return used, err
		}
	}
	if used > 0 {
		b.Log.Info("backpack items used", "count", used)
	}
	return used, b.ToMain(ctx)
}

func nextBadgedCell(frame image.Image, tried map[image.Point]bool) (image.Point, bool) {
	for _, y := range backpackRows {
		for _, x := range backpackCols {
			c := image.Pt(x, y)
			if !tried[c] && badged(frame, c.Add(backpackBadge)) {
				return c, true
			}
		}
	}
	return image.Point{}, false
}
