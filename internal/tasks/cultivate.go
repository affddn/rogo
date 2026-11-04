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

	// The Equipment button left of it is badged while a better weapon than
	// the equipped one is owned; that weapon's tile carries a badge too.
	weaponEquip      = image.Pt(183, 1121)
	weaponEquipBadge = image.Pt(282, 1103)
	// Weapon grid: tile centres, and a tile's badge from its centre.
	weaponTile0     = image.Pt(88, 680)
	weaponTilePitch = image.Pt(108, 135)
	weaponTileBadge = image.Pt(39, -33)
	weaponGridArea  = image.Rect(30, 610, 690, 1050)
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
	if badged(frame, weaponEquipBadge) {
		ok, err := equipBestWeapon(ctx, b, frame)
		if err != nil {
			return steps, err
		}
		if ok {
			steps++
		}
	}
	b.Log.Info("weapons cultivated", "steps", steps)
	return steps, b.ToMain(ctx)
}

// equipBestWeapon equips the weapon the game marks as better than the one
// in hand: it selects the badged tile, scrolling the grid once if it is
// below the fold, and taps Equipment.
func equipBestWeapon(ctx context.Context, b *bot.Bot, frame image.Image) (bool, error) {
	for scroll := 0; scroll < 2; scroll++ {
		if tile, ok := badgedWeaponTile(frame); ok {
			if err := b.Tap(ctx, tile, "better weapon"); err != nil {
				return false, err
			}
			if err := b.Tap(ctx, weaponEquip, "equip weapon"); err != nil {
				return false, err
			}
			if err := closePopups(ctx, b, screens.WeaponCultivate); err != nil {
				return false, err
			}
			b.Log.Info("better weapon equipped")
			return true, nil
		}
		x := (weaponGridArea.Min.X + weaponGridArea.Max.X) / 2
		if err := b.D.Swipe(ctx, x, weaponGridArea.Max.Y-60, x, weaponGridArea.Min.Y+60, 600*time.Millisecond); err != nil {
			return false, err
		}
		_, f, err := b.Look(ctx)
		if err != nil {
			return false, err
		}
		frame = f
	}
	b.Log.Warn("equipment badge but no badged weapon found", "shot", b.Save(frame))
	return false, nil
}

func badgedWeaponTile(frame image.Image) (image.Point, bool) {
	for row := 0; row < 4; row++ {
		for col := 0; col < 6; col++ {
			c := weaponTile0.Add(image.Pt(col*weaponTilePitch.X, row*weaponTilePitch.Y))
			if c.In(weaponGridArea) && badged(frame, c.Add(weaponTileBadge)) {
				return c, true
			}
		}
	}
	return image.Point{}, false
}
