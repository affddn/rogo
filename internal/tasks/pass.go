package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

var (
	seasonPassIcon = image.Pt(48, 410) // left rail
	passTabs       = []image.Point{{340, 1225}, {470, 1225}, {600, 1225}}
	passClaimAll   = image.Pt(188, 1129)
	passClaimBadge = image.Pt(285, 1105)
)

// SeasonPass claims the free track of every pass tab (weapon gacha, pet
// gacha, elite summon). The paid unlock is guarded by a deny area.
func SeasonPass(ctx context.Context, b *bot.Bot) (claimed int, err error) {
	if err := b.ToMain(ctx); err != nil {
		return 0, err
	}
	if err := b.Tap(ctx, seasonPassIcon, "season pass"); err != nil {
		return 0, err
	}
	if _, _, err := b.Wait(ctx, 10*time.Second, screens.SeasonPass); err != nil {
		return 0, err
	}
	for _, tab := range passTabs {
		if err := b.Tap(ctx, tab, "pass tab"); err != nil {
			return claimed, err
		}
		_, frame, err := b.Wait(ctx, 8*time.Second, screens.SeasonPass)
		if err != nil {
			return claimed, err
		}
		if !badged(frame, passClaimBadge) {
			continue
		}
		if err := b.Tap(ctx, passClaimAll, "pass claim all"); err != nil {
			return claimed, err
		}
		claimed++
		if err := closePopups(ctx, b, screens.SeasonPass); err != nil {
			return claimed, err
		}
	}
	if claimed > 0 {
		b.Log.Info("season pass claimed", "tabs", claimed)
	}
	return claimed, b.ToMain(ctx)
}
