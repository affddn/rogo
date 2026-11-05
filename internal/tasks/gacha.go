package tasks

import (
	"context"
	"image"
	"image/color"
	"slices"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

var (
	// Draw Multiple's "have/10" ticket count; green while a 10-draw is affordable.
	gachaMultiCost = image.Rect(470, 960, 525, 984)
	// Skip Animation checkbox; teal when ticked.
	gachaSkip    = image.Rect(496, 868, 516, 888)
	gachaSkipTap = image.Pt(506, 877)
	// Draw Level achievement chest and its badge.
	gachaAchievement      = image.Pt(592, 180)
	gachaAchievementBadge = image.Rect(612, 124, 632, 144)
	weaponGachaTab        = image.Pt(660, 1235)
)

func isTeal(c color.RGBA) bool { return c.G > 140 && c.R < 90 }

// WeaponGacha spends weapon gacha tickets in the largest batch the game
// offers and claims the Draw Level achievement chests (100 tickets each).
// It only confirms a draw whose cost icon is the ticket, never diamonds.
func WeaponGacha(ctx context.Context, b *bot.Bot) (batches int, err error) {
	frame, err := openWeaponGacha(ctx, b)
	if err != nil {
		return 0, err
	}
	if err := adDraw(ctx, b, frame); err != nil {
		return 0, err
	}

	for batches < 10 {
		if err := closePopups(ctx, b, screens.WeaponGacha); err != nil {
			return batches, err
		}
		_, frame, err := b.Look(ctx)
		if err != nil {
			return batches, err
		}
		if vision.Ratio(frame, gachaAchievementBadge, vision.IsBadgeRed) > 0.15 {
			if err := b.Tap(ctx, gachaAchievement, "draw level achievement"); err != nil {
				return batches, err
			}
			b.Log.Info("weapon gacha achievement claimed")
			continue
		}
		if vision.Ratio(frame, gachaMultiCost, vision.IsGreenText) < 0.03 {
			break
		}
		if err := b.TapTemplate(ctx, frame, screens.TGachaDrawMulti); err != nil {
			return batches, err
		}
		_, frame, err = b.Wait(ctx, 8*time.Second, screens.GachaCount)
		if err != nil {
			return batches, err
		}
		if !screens.Visible(frame, screens.TGachaCostTicket) {
			b.Log.Warn("gacha draw not priced in tickets, backing out")
			_, err := b.Dismiss(ctx, screens.GachaCount, frame)
			return batches, err
		}
		if err := b.TapTemplate(ctx, frame, screens.TGachaDrawButton); err != nil {
			return batches, err
		}
		batches++
		if err := bot.Sleep(ctx, 3*time.Second); err != nil {
			return batches, err
		}
	}
	b.Log.Info("weapon gacha done", "batches", batches)
	return batches, b.ToMain(ctx)
}

// The ad button left of Draw 1 Time: a free 10-draw a day, ad-free with
// the Kafra Lifetime Card. Its badge shows while it is unused.
var (
	gachaAdButton = image.Pt(132, 1033)
	gachaAdBadge  = image.Pt(153, 1012)
)

// adDraw takes the day's free draw from the ad button if it is due.
func adDraw(ctx context.Context, b *bot.Bot, frame image.Image) error {
	if !badged(frame, gachaAdBadge) {
		return nil
	}
	if err := b.Tap(ctx, gachaAdButton, "free ad draw"); err != nil {
		return err
	}
	b.Log.Info("free ad draw taken")
	if err := bot.Sleep(ctx, 3*time.Second); err != nil {
		return err
	}
	return closePopups(ctx, b, screens.WeaponGacha)
}

// openWeaponGacha opens the Weapon Gacha tab with Skip Animation ticked.
func openWeaponGacha(ctx context.Context, b *bot.Bot) (image.Image, error) {
	// Weapon opens on whichever tab is badged.
	frame, err := open(ctx, b, screens.TNavWeapon, screens.WeaponGacha, screens.WeaponCultivate)
	if err != nil {
		return nil, err
	}
	if id := screens.Detect(frame); id != screens.WeaponGacha {
		if _, frame, err = b.TapWait(ctx, id, weaponGachaTab, "weapon gacha tab", 8*time.Second, screens.WeaponGacha); err != nil {
			return nil, err
		}
	}
	if vision.Ratio(frame, gachaSkip, isTeal) < 0.2 {
		if err := b.Tap(ctx, gachaSkipTap, "skip animation"); err != nil {
			return nil, err
		}
	}
	return frame, nil
}

// closePopups taps away level-up and result popups until want shows again.
func closePopups(ctx context.Context, b *bot.Bot, want ...screens.ID) error {
	for i := 0; i < 6; i++ {
		id, frame, err := b.Look(ctx)
		if err != nil {
			return err
		}
		if slices.Contains(want, id) {
			return nil
		}
		acted, err := b.Dismiss(ctx, id, frame)
		if err != nil {
			return err
		}
		if !acted {
			if err := bot.Sleep(ctx, 2*time.Second); err != nil {
				return err
			}
		}
	}
	return nil
}
