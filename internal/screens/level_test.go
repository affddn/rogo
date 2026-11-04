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
