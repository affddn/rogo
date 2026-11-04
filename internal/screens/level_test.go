package screens

import "testing"

func TestEnhanceLevel(t *testing.T) {
	cases := map[string][2]int{ // current, next
		"lv/pants.png": {57, 58}, "lv/armor.png": {62, 63}, "lv/belt.png": {58, 59},
		"lv/cape.png": {56, 57}, "lv/boots.png": {55, 56}, "lv/pendant.png": {11, 12},
		"lv/belt-59.png": {59, 60}, "lv/armor-63.png": {63, 64},
		"lv/armor-70.png": {70, 71}, // touching digits
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
		"attr-reset.png": {[6]int{0, 0, 0, 0, 0, 0}, 324}, // "!" badge on the counter
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
