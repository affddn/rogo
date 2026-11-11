package tasks

import (
	"image/color"
	"slices"
	"testing"

	"github.com/affddn/rogo/internal/vision"
)

func TestEnchantOrderFreshThenNormal(t *testing.T) {
	// Coat enchanted once (all Normal, grey dot), pendant and ring Fine
	// (green dots), the other five bare.
	got := enchantOrder(capture(t, "enchant/fresh.png"))
	if want := []int{1, 2, 3, 4, 5, 0}; !slices.Equal(got, want) {
		t.Errorf("enchant order %v; want %v", got, want)
	}
}

func TestEnchantableOnlyBareOrAllNormal(t *testing.T) {
	cases := []struct {
		file string
		want enchantQuality
		ok   bool
	}{
		{"enchant/fresh.png", notEnchanted, true},   // cape, no lines yet
		{"enchant/normal.png", enchantNormal, true}, // coat: Normal x3
		{"enchant/fine.png", enchantNormal, false},  // ring: Fine, Normal, Fine
		{"enchant/fine.png", notEnchanted, false},
		{"enchant/page.png", notEnchanted, false}, // pool locked below Refine +3
	}
	for _, c := range cases {
		if got := enchantable(capture(t, c.file), c.want); got != c.ok {
			t.Errorf("%s as %v: enchantable %v; want %v", c.file, c.want, got, c.ok)
		}
	}
}

func TestStarPowderShortIsNotGreen(t *testing.T) {
	for _, f := range []string{"enchant/fresh.png", "enchant/normal.png", "enchant/fine.png"} {
		img := capture(t, f)
		if r := vision.Ratio(img, enchantMaterial, vision.IsGreenText); r >= 0.03 {
			t.Errorf("%s: Star Powder 0/1 reads green (%.3f)", f, r)
		}
		// The rect is on the count: its red "0" is there.
		red := func(c color.RGBA) bool { return c.R > 180 && c.G < 100 && c.B < 100 }
		if r := vision.Ratio(img, enchantMaterial, red); r < 0.03 {
			t.Errorf("%s: no red count in the Star Powder rect (%.3f)", f, r)
		}
	}
}
