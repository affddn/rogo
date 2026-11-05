package tasks

import (
	"context"
	"image"
	"image/color"
	"time"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/bot"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

// Enchanting (Pool 1, unlocked per slot at Refine +3) rolls three random
// attribute lines onto a piece for one Star Powder, which comes from the
// Rune Arena Shop, the Mall and check-in rewards. A roll replaces the
// unlocked lines, so a good roll is never rolled again.
var (
	enchantTab = image.Pt(660, 1240)
	// The Star Powder count under the material icon ("0/1"): green when
	// there is enough.
	enchantMaterial = image.Rect(85, 1015, 125, 1040)
	// The quality dot at a slot tile's bottom-right, relative to the slot's
	// icon: absent until the piece is enchanted, then the colour of its best
	// line (grey Normal, green Fine, ...).
	enchantDot = image.Pt(38, 40)
	// The attribute lines' quality chips.
	enchantChips = image.Rect(30, 730, 145, 890)
)

// enchantHeldUntil skips the Enchantment tab after a pass: Star Powder only
// arrives a few at a time.
var enchantHeldUntil time.Time

type enchantQuality int

const (
	notEnchanted  enchantQuality = iota
	enchantNormal                // every line Normal, the lowest quality
	enchantBetter                // a Fine or better line
)

// enchantState reads a slot's quality dot. The panel is checked again before
// spending (see enchantable), so a misread here only costs a look.
func enchantState(frame image.Image, slot int) enchantQuality {
	p := enhanceSlots[slot].icon.Add(enchantDot)
	r := image.Rect(p.X-4, p.Y-4, p.X+4, p.Y+4)
	switch {
	case vision.Ratio(frame, r, isTileRed) > 0.5:
		return notEnchanted
	case vision.Ratio(frame, r, isDotGrey) > 0.5:
		return enchantNormal
	}
	return enchantBetter
}

// isTileRed is the slot tile's own colour where the dot would be.
func isTileRed(c color.RGBA) bool { return c.R > 190 && int(c.R)-int(c.G) > 60 }

// isDotGrey is the Normal dot, rgb(142,145,151).
func isDotGrey(c color.RGBA) bool {
	hi, lo := max(c.R, c.G, c.B), min(c.R, c.G, c.B)
	return hi-lo < 25 && c.R > 100 && c.R < 190
}

// enchantable confirms on the selected piece's panel what its dot said: no
// lines yet, or three Normal lines. Anything else is left alone.
func enchantable(frame image.Image, want enchantQuality) bool {
	switch want {
	case notEnchanted:
		return screens.Visible(frame, screens.TEnchantEmpty)
	case enchantNormal:
		return len(assets.MustGet(screens.TEnchantNormalChip).FindAll(frame, enchantChips, 0.9, 20)) == 3
	}
	return false
}

// enchantOrder lists the slots worth a Star Powder, fresh pieces first, then
// all-Normal ones: a Normal roll is the lowest quality, so a reroll cannot
// make it worse.
func enchantOrder(frame image.Image) []int {
	var fresh, normal []int
	for i := range enhanceSlots {
		switch enchantState(frame, i) {
		case notEnchanted:
			fresh = append(fresh, i)
		case enchantNormal:
			normal = append(normal, i)
		}
	}
	return append(fresh, normal...)
}

// enchantGear opens the Enchantment tab from the gear upgrade page (on from)
// and enchants while Star Powder lasts: pieces never enchanted, then pieces
// with only Normal lines. The screen after each roll is saved for a look.
func enchantGear(ctx context.Context, b *bot.Bot, from screens.ID) (rolls int, err error) {
	if time.Now().Before(enchantHeldUntil) {
		return 0, nil
	}
	enchantHeldUntil = time.Now().Add(3 * time.Hour)
	_, frame, err := b.TapWait(ctx, from, enchantTab, "enchant tab", 8*time.Second, screens.Enchant)
	if err != nil {
		return 0, err
	}
	for _, i := range enchantOrder(frame) {
		want := enchantState(frame, i)
		if err := b.Tap(ctx, enhanceSlots[i].icon, "enchant slot"); err != nil {
			return rolls, err
		}
		_, sel, err := b.Look(ctx)
		if err != nil {
			return rolls, err
		}
		if vision.Ratio(sel, enchantMaterial, vision.IsGreenText) < 0.03 {
			break // out of Star Powder
		}
		if !enchantable(sel, want) || !screens.Visible(sel, screens.TEnchantButton) {
			continue
		}
		if err := b.TapTemplate(ctx, sel, screens.TEnchantButton); err != nil {
			return rolls, err
		}
		rolls++
		if _, res, err := b.Look(ctx); err == nil {
			b.Log.Info("gear enchanted", "slot", i, "was", want, "shot", b.Save(res))
		}
		if err := closePopups(ctx, b, screens.Enchant); err != nil {
			return rolls, err
		}
		if _, frame, err = b.Look(ctx); err != nil {
			return rolls, err
		}
		if want == notEnchanted && enchantState(frame, i) == notEnchanted {
			// The roll did not take (a dialog we do not know yet): stop
			// rather than spend more blind. A Normal reroll can land on
			// Normal again, so only a fresh piece shows this.
			b.Log.Warn("enchant left the piece bare", "slot", i, "shot", b.Save(frame))
			break
		}
	}
	return rolls, nil
}
