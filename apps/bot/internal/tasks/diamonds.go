package tasks

import (
	"context"
	"image"
	"image/color"
	"time"

	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

// Diamonds go to weapon draws, 5 each. Each Draw Level pays 200+ weapon
// coins back (Level 7 cost 717 draws and paid 200), and draw counts feed the
// weapon season pass and Growth Gift tasks. A paid Quick Idle (100 diamonds
// for one hour of income) and the Mall's diamond items were weighed against
// it; see issue #20.

// The draw-count dialog's slider: the knob's centre at the minimum (10
// draws) and at the maximum, which is the fewer of the draws left to the
// next Draw Level and the draws the diamonds pay for.
const (
	sliderY     = 640
	sliderMinX  = 212
	sliderMaxX  = 505
	drawCost    = 5
	minDraws    = 10
	minDiamonds = 100 // smallest surplus worth a batch
)

var gachaDrawButton = image.Pt(360, 836)

func isSliderKnob(c color.RGBA) bool { return c.R > 240 && c.G > 238 && c.B > 225 }

// sliderKnob finds the knob's centre: the longest near-white run on the
// slider row.
func sliderKnob(frame image.Image) (int, bool) {
	best, bestLen, start := 0, 0, -1
	for x := 190; x <= 530; x++ {
		on := isSliderKnob(color.RGBAModel.Convert(frame.At(x, sliderY)).(color.RGBA))
		if on && start < 0 {
			start = x
		}
		if (!on || x == 530) && start >= 0 {
			if n := x - start; n > bestLen {
				best, bestLen = (start+x)/2, n
			}
			start = -1
		}
	}
	return best, bestLen >= 15
}

// knobSlack is how far right of its target a dragged knob may land; the
// target is set that far short so even then no more than want are drawn.
const knobSlack = 6

// sliderTarget is where to put the knob to draw at most want of at most top
// draws.
func sliderTarget(want, top int) int {
	if top <= minDraws || want <= minDraws {
		return sliderMinX
	}
	f := float64(want-minDraws) / float64(top-minDraws)
	return max(sliderMinX, sliderMinX+int(f*float64(sliderMaxX-sliderMinX))-knobSlack)
}

// DiamondDraws spends diamonds above reserve on weapon draws and claims the
// Draw Level chests on the way. The slider is set from the balance, and the
// draw only goes ahead if the knob sits no further right than planned, so a
// misread or a missed drag can only spend less.
func DiamondDraws(ctx context.Context, b *bot.Bot, reserve int) (spent int, err error) {
	if _, err := openWeaponGacha(ctx, b); err != nil {
		return 0, err
	}
	start := -1
	balance := 0
	for round := 0; round < 6; round++ {
		if err := closePopups(ctx, b, screens.WeaponGacha); err != nil {
			return spent, err
		}
		_, frame, err := b.Look(ctx)
		if err != nil {
			return spent, err
		}
		if vision.Ratio(frame, gachaAchievementBadge, vision.IsBadgeRed) > 0.15 {
			if err := b.Tap(ctx, gachaAchievement, "draw level achievement"); err != nil {
				return spent, err
			}
			b.Log.Info("weapon gacha achievement claimed")
			continue
		}
		n, ok := screens.Diamonds(frame)
		if !ok {
			b.Log.Warn("could not read the diamond count", "shot", b.Save(frame))
			break
		}
		balance = n
		if start < 0 {
			start = n
		}
		surplus := n - reserve
		if surplus < minDiamonds {
			break
		}
		if err := b.TapTemplate(ctx, frame, screens.TGachaDrawMulti); err != nil {
			return spent, err
		}
		_, frame, err = b.Wait(ctx, 8*time.Second, screens.GachaCount)
		if err != nil {
			return spent, err
		}
		if screens.Visible(frame, screens.TGachaCostTicket) {
			// Weapon coins came in since the last chore; draw them first.
			if err := b.Tap(ctx, gachaDrawButton, "draw coins"); err != nil {
				return spent, err
			}
			if err := bot.Sleep(ctx, 3*time.Second); err != nil {
				return spent, err
			}
			continue
		}
		target := sliderTarget(surplus/drawCost, n/drawCost)
		if err := b.D.Swipe(ctx, sliderMaxX, sliderY, 120, sliderY, 400*time.Millisecond); err != nil {
			return spent, err
		}
		if target > sliderMinX+3 {
			if err := b.D.Swipe(ctx, sliderMinX, sliderY, target, sliderY, 800*time.Millisecond); err != nil {
				return spent, err
			}
		}
		if err := bot.Sleep(ctx, time.Second); err != nil {
			return spent, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return spent, err
		}
		knob, found := sliderKnob(frame)
		if !found || knob > target+knobSlack {
			b.Log.Warn("draw slider not where planned, cancelling", "knob", knob, "target", target, "shot", b.Save(frame))
			_, err := b.Dismiss(ctx, screens.GachaCount, frame)
			return spent, err
		}
		if err := b.Tap(ctx, gachaDrawButton, "draw with diamonds"); err != nil {
			return spent, err
		}
		if err := bot.Sleep(ctx, 4*time.Second); err != nil {
			return spent, err
		}
	}
	if err := closePopups(ctx, b, screens.WeaponGacha); err != nil {
		return spent, err
	}
	if _, frame, err := b.Look(ctx); err == nil {
		if n, ok := screens.Diamonds(frame); ok {
			balance = n
		}
	}
	if start >= 0 {
		spent = start - balance
	}
	b.Log.Info("diamond draws done", "spent", spent, "left", balance)
	return spent, b.ToMain(ctx)
}
