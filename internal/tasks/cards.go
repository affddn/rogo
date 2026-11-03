package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

var (
	// Equipment page bottom tabs.
	equipmentTab = image.Pt(487, 1234)
	cardTab      = image.Pt(571, 1234)
	// Badge corners (top-right) of the first two rows of card tiles; a badge
	// there means the card can be activated. Card art is too red to scan
	// the whole grid.
	cardCorners = []image.Point{
		{228, 288}, {438, 288}, {648, 288},
		{228, 562}, {438, 562}, {648, 562},
	}
	cardTileFromCorner = image.Pt(-73, 112)
)

// cards activates every badged card on the Card page's album, then fills
// empty card slots on the Insert Card tab. Each activation adds
// to the album bonus (PATK/MATK/HP). Inserting cards into gear slots needs
// effect text reading and is tracked separately.
func cards(ctx context.Context, b *bot.Bot) (activated int, err error) {
	for tries := 0; tries < 12; tries++ {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return activated, err
		}
		if id != screens.CardPage {
			if _, err := b.Dismiss(ctx, id, frame); err != nil {
				return activated, err
			}
			continue
		}
		var tile image.Point
		found := false
		for _, c := range cardCorners {
			if badged(frame, c) {
				tile, found = c.Add(cardTileFromCorner), true
				break
			}
		}
		if !found {
			break
		}
		if err := b.Tap(ctx, tile, "card"); err != nil {
			return activated, err
		}
		_, frame, err = b.Wait(ctx, 8*time.Second, screens.CardDetails)
		if err != nil {
			return activated, err
		}
		if screens.Visible(frame, screens.TCardActivate) {
			if err := b.TapTemplate(ctx, frame, screens.TCardActivate); err != nil {
				return activated, err
			}
			activated++
			if err := bot.Sleep(ctx, 2*time.Second); err != nil {
				return activated, err
			}
		}
		if err := closePopups(ctx, b, screens.CardPage); err != nil {
			return activated, err
		}
	}
	if activated > 0 {
		b.Log.Info("cards activated", "count", activated)
	}
	n, err := insertCards(ctx, b)
	return activated + n, err
}
