package tasks

import (
	"image/png"
	"os"
	"testing"
)

func TestBagOver20(t *testing.T) {
	for file, want := range map[string]bool{"equip-now.png": true, "equip-empty.png": false} {
		f, err := os.Open("../../captures/" + file)
		if err != nil {
			t.Skipf("reference capture %s not present", file)
		}
		img, _ := png.Decode(f)
		f.Close()
		if got := BagOver20(img); got != want {
			t.Errorf("%s: BagOver20 = %v, want %v", file, got, want)
		}
	}
}

func TestUpgradeTile(t *testing.T) {
	for file, want := range map[string]bool{"bag-arrows.png": true, "equip-now.png": false, "equip-empty.png": false, "ring-2.png": false} {
		f, err := os.Open("../../captures/" + file)
		if err != nil {
			t.Skipf("reference capture %s not present", file)
		}
		img, _ := png.Decode(f)
		f.Close()
		p, got := upgradeTile(img)
		if got != want {
			t.Errorf("%s: upgrade arrow = %v, want %v", file, got, want)
		}
		if got && (p.X < 600 || p.Y > 760) {
			t.Errorf("%s: arrow tile at %v, want the ring at row 0 col 5", file, p)
		}
	}
}
