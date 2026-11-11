package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

var (
	// The Lv.N arrow right of Summon Elite.
	summonUpgradeButton = image.Pt(458, 1040)
	// Crystal "have" count in the upgrade dialog; green while affordable.
	summonUpgradeCost = image.Rect(318, 898, 380, 922)
)

// SummonUpgrade spends summon crystals on the elite summon level, which
// raises the rarity of every armor drop from then on. Each level takes three
// growth stages, then a free 30-minute timed upgrade; it enhances while the
// cost stays affordable and starts the timer when offered.
func SummonUpgrade(ctx context.Context, b *bot.Bot) (stages int, err error) {
	if err := b.ToMain(ctx); err != nil {
		return 0, err
	}
	if err := b.Tap(ctx, summonUpgradeButton, "summon upgrade"); err != nil {
		return 0, err
	}
	_, frame, err := b.Wait(ctx, 8*time.Second, screens.SummonUpgrade)
	if err != nil {
		return 0, err
	}
	for stages < 15 {
		// After the third growth stage the level-up itself is a free timed
		// upgrade (30 min); start it. Accelerate is deny-listed.
		if screens.Visible(frame, screens.TSummonUpUpgrade) {
			if err := b.TapTemplate(ctx, frame, screens.TSummonUpUpgrade); err != nil {
				return stages, err
			}
			stages++
			b.Log.Info("summon level-up timer started")
			break
		}
		if vision.Ratio(frame, summonUpgradeCost, vision.IsGreenText) < 0.05 {
			break
		}
		if err := b.TapTemplate(ctx, frame, screens.TSummonUpEnhance); err != nil {
			return stages, err
		}
		stages++
		if err := closePopups(ctx, b, screens.SummonUpgrade); err != nil {
			return stages, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return stages, err
		}
	}
	b.Log.Info("summon upgraded", "stages", stages)
	return stages, b.ToMain(ctx)
}
