package screens

import (
	"math"
	"testing"
)

func TestEnhanceLevel(t *testing.T) {
	cases := map[string][2]int{ // current, next
		"lv/pants.png": {57, 58}, "lv/armor.png": {62, 63}, "lv/belt.png": {58, 59},
		"lv/cape.png": {56, 57}, "lv/boots.png": {55, 56}, "lv/pendant.png": {11, 12},
		"lv/belt-59.png": {59, 60}, "lv/armor-63.png": {63, 64},
		"lv/armor-70.png": {70, 71}, // touching digits
		"lv/slot4.png":    {71, 72}, "lv/slot5.png": {71, 72},
		"lv/slot0-80.png": {80, 81},
	}
	for file, want := range cases {
		t.Run(file, func(t *testing.T) {
			img := load(t, file)
			if got, ok := EnhanceLevel(img); !ok || got != want[0] {
				t.Errorf("current level %d %v, want %d", got, ok, want[0])
			}
			if got, ok := readNumber(img, enhLevelNext); !ok || got != want[1] {
				t.Errorf("next level %d %v, want %d", got, ok, want[1])
			}
		})
	}
	if _, ok := EnhanceLevel(load(t, "main3.png")); ok {
		t.Error("read a level off the main screen")
	}
}

func TestAttributeAllocation(t *testing.T) {
	cases := map[string]struct {
		alloc  [6]int
		points int
	}{
		"attr-old.png":   {[6]int{22, 30, 0, 0, 0, 37}, 3},
		"attr-new.png":   {[6]int{18, 49, 0, 0, 2, 10}, 0},
		"attr-reset.png": {[6]int{0, 0, 0, 0, 0, 0}, 324},    // "!" badge on the counter
		"attr-int0.png":  {[6]int{28, 37, 25, 0, 10, 49}, 8}, // STR "28" after a rebuild
	}
	for file, want := range cases {
		t.Run(file, func(t *testing.T) {
			img := load(t, file)
			if got, ok := AttributeAllocation(img); !ok || got != want.alloc {
				t.Errorf("allocation %v %v, want %v", got, ok, want.alloc)
			}
			if got, ok := AttributePoints(img); !ok || got != want.points {
				t.Errorf("points %d %v, want %d", got, ok, want.points)
			}
		})
	}
}

func TestDiamonds(t *testing.T) {
	cases := map[string]int{
		"dia/p-6879.png": 6879, "dia/p-6819.png": 6819, "dia/p-6744.png": 6744,
		"dia/p-6644.png": 6644, "dia/p-3294.png": 3294, "dia/p-3295.png": 3295,
		"main-after-qi.png": 6802, "build/05-attr.png": 6772, "skills/job15.png": 6803,
		"shop/12-weapon-gacha-draw.png": 6699, "shop/25-growth-after.png": 6760,
		"dia/p-1788.png": 1788,
	}
	for file, want := range cases {
		t.Run(file, func(t *testing.T) {
			if got, ok := Diamonds(load(t, file)); !ok || got != want {
				t.Errorf("read %d %v, want %d", got, ok, want)
			}
		})
	}
	// Under a modal the bar dims and must not be misread.
	if n, ok := Diamonds(load(t, "qi-confirm-free.png")); ok {
		t.Errorf("read %d through a dimmed bar", n)
	}
}

func TestPower(t *testing.T) {
	cases := map[string]int{
		"main3.png": 474600, "unknown/20261103-182537.076.png": 534600, "shop/00-main.png": 1814100,
		"idle-now.png": 1876500, "main-after-qi.png": 1966500, "daily/after-buy.png": 2085600,
		"auto-done.png": 2085600, "value-pack.png": 0, // dimmed under a modal
		"power/9839.4K.png": 9839400, "power/10M.png": 10_000_000,
		"power/11.8M.png": 11_800_000, "power/11.8M-b.png": 11_800_000,
	}
	for file, want := range cases {
		t.Run(file, func(t *testing.T) {
			got, ok := Power(load(t, file))
			if want == 0 {
				if ok {
					t.Errorf("read %d through a dimmed screen", got)
				}
				return
			}
			if !ok || got != want {
				t.Errorf("read %d %v, want %d", got, ok, want)
			}
		})
	}
}

func TestAttributeRates(t *testing.T) {
	cases := map[string][3]float64{
		"attr/after-reset.png": {8.8, 25.81, 160},
		"attr/rebuilt.png":     {23.5, 40.51, 175.65},
		"attr/5nov.png":        {20.8, 37.81, 178.4},
		"attr/6nov.png":        {29.4, 50.4, 177.39},
	}
	for file, want := range cases {
		t.Run(file, func(t *testing.T) {
			crit, sc, aspd, ok := AttributeRates(load(t, file))
			got := [3]float64{crit, sc, aspd}
			for i := range got {
				if !ok || math.Abs(got[i]-want[i]) > 0.001 {
					t.Fatalf("read %v %v, want %v", got, ok, want)
				}
			}
		})
	}
}
