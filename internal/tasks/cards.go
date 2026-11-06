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
	cardTabBadge = image.Pt(596, 1194)
	// Badge corners (top-right) of the first two rows of card tiles; a badge
	// there means the card can be activated. Card art is too red to scan
	// the whole grid.
	cardCorners = []image.Point{
		{228, 288}, {438, 288}, {648, 288},
		{228, 562}, {438, 562}, {648, 562},
	}
	cardTileFromCorner = image.Pt(-73, 112)
	// One-Click Raise Star Level: spends duplicate cards on star levels,
	// each raising the album bonus. Badged while a level is affordable.
	raiseStar      = image.Pt(360, 1046)
	raiseStarBadge = image.Pt(458, 1027)
)

// cards activates every badged card on the Card page's album, then fills
// empty card slots on the Insert Card tab. Each activation adds
// to the album bonus (PATK/MATK/HP). Inserting cards into gear slots needs
// effect text reading and is tracked separately.
func cards(ctx context.Context, b *bot.Bot) (activated int, err error) {
	// A badge also marks a card whose star level can be raised; its details
	// have no Activate button and the badge stays until One-Click Raise Star
	// Level below, so each badged card is opened once.
	opened := map[image.Point]bool{}
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
		corner, found := nextBadgedCard(frame, opened)
		if !found {
			break
		}
		opened[corner] = true
		if err := b.Tap(ctx, corner.Add(cardTileFromCorner), "card"); err != nil {
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
	for i := 0; i < 5; i++ {
		_, frame, err := b.Look(ctx)
		if err != nil {
			return activated, err
		}
		if !badged(frame, raiseStarBadge) {
			break
		}
		if err := b.Tap(ctx, raiseStar, "raise card star level"); err != nil {
			return activated, err
		}
		activated++
		b.Log.Info("card star level raised")
		if err := closePopups(ctx, b, screens.CardPage); err != nil {
			return activated, err
		}
	}
	n, err := insertCards(ctx, b)
	return activated + n, err
}

// nextBadgedCard returns the badge corner of the first badged card not
// opened yet.
func nextBadgedCard(frame image.Image, opened map[image.Point]bool) (image.Point, bool) {
	for _, c := range cardCorners {
		if !opened[c] && badged(frame, c) {
			return c, true
		}
	}
	return image.Point{}, false
}
