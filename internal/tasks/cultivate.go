package tasks

import (
	"context"
	"image"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
)

var (
	// Weapon page bottom tabs.
	cultivationTab = image.Pt(556, 1235)
	// The Activate All / One-Click Upgrade button shares one spot; its badge
	// means there are new weapons to activate or duplicates to level with.
	cultButton      = image.Pt(534, 1120)
	cultButtonBadge = image.Pt(632, 1104)
)

// WeaponCultivate turns gacha duplicates into weapon levels: Activate All
// registers new weapons, One-Click Upgrade spends copies on every weapon's
// level (each adds to the collection's passive PATK).
func WeaponCultivate(ctx context.Context, b *bot.Bot) (steps int, err error) {
	frame, err := open(ctx, b, screens.TNavWeapon, screens.WeaponGacha, screens.WeaponCultivate)
	if err != nil {
		return 0, err
	}
	if screens.Detect(frame) != screens.WeaponCultivate {
		if err := b.Tap(ctx, cultivationTab, "cultivation tab"); err != nil {
			return 0, err
		}
		if _, frame, err = b.Wait(ctx, 8*time.Second, screens.WeaponCultivate); err != nil {
			return 0, err
		}
	}
	for steps < 6 && badged(frame, cultButtonBadge) {
		if err := b.Tap(ctx, cultButton, "cultivate"); err != nil {
			return steps, err
		}
		id, f, err := b.Look(ctx)
		if err != nil {
			return steps, err
		}
		if id == screens.OneClickUpgrade {
			if err := b.TapTemplate(ctx, f, screens.TOneClickOK); err != nil {
				return steps, err
			}
		}
		steps++
		if err := closePopups(ctx, b, screens.WeaponCultivate); err != nil {
			return steps, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return steps, err
		}
	}
	b.Log.Info("weapons cultivated", "steps", steps)
	return steps, b.ToMain(ctx)
}
