package tasks

import (
	"image"
	"image/png"
	"os"
	"testing"
)

func TestEmptySlots(t *testing.T) {
	cases := map[string]int{
		"cardslot-1.png":   2, // two badged weapon slots
		"cardslot-3.png":   0, // remaining weapon slot has no spare card
		"cardscroll-1.png": 1, // chestplate badged; cape empty without badge
		"cardscroll-2.png": 0,
	}
	for file, want := range cases {
		f, err := os.Open("../../../../captures/" + file)
		if err != nil {
			t.Skipf("reference capture %s not present", file)
		}
		img, _ := png.Decode(f)
		f.Close()
		got := emptySlots(img)
		if len(got) != want {
			t.Errorf("%s: %d badged empty slots %v, want %d", file, len(got), got, want)
		}
		for _, p := range got {
			if !p.In(image.Rect(0, 0, 720, 1280)) {
				t.Errorf("%s: slot %v off screen", file, p)
			}
		}
	}
}
