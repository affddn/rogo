package screens

import "testing"

func TestEnhanceLevel(t *testing.T) {
	cases := map[string][2]int{ // current, next
		"lv/pants.png": {57, 58}, "lv/armor.png": {62, 63}, "lv/belt.png": {58, 59},
		"lv/cape.png": {56, 57}, "lv/boots.png": {55, 56}, "lv/pendant.png": {11, 12},
		"lv/belt-59.png": {59, 60}, "lv/armor-63.png": {63, 64},
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
