package tasks

import (
	"image"
	"image/png"
	"os"
	"testing"

	"github.com/affddn/rogo/internal/screens"
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

func TestDungeonZeroAttempts(t *testing.T) {
	for file, want := range map[string]bool{"dungeon.png": false, "dungeon-now.png": false, "dungeon-after.png": true} {
		f, err := os.Open("../../captures/" + file)
		if err != nil {
			t.Skipf("reference capture %s not present", file)
		}
		img, _ := png.Decode(f)
		f.Close()
		if got := screens.Visible(img, screens.TDungeonZeroLeft); got != want {
			t.Errorf("%s: zero attempts = %v, want %v", file, got, want)
		}
	}
}

func TestReadyChest(t *testing.T) {
	cases := map[string]struct {
		ok bool
		at image.Point
	}{
		"qpanel-daily-chest.png": {true, image.Pt(519, 345)}, // 80
		"qpanel-weekly.png":      {true, image.Pt(303, 345)}, // 40 (60 too)
		"questpanel.png":         {false, image.Point{}},
		"questweekly.png":        {false, image.Point{}},
	}
	for file, want := range cases {
		f, err := os.Open("../../captures/" + file)
		if err != nil {
			t.Skipf("reference capture %s not present", file)
		}
		img, _ := png.Decode(f)
		f.Close()
		if at, ok := readyChest(img); ok != want.ok || at != want.at {
			t.Errorf("%s: readyChest = %v %v, want %v %v", file, at, ok, want.at, want.ok)
		}
	}
}

func TestReplaceButtonOnlyOnComparePopup(t *testing.T) {
	for file, want := range map[string]bool{"item-replace.png": true, "eq-after-replace.png": false} {
		f, err := os.Open("../../captures/" + file)
		if err != nil {
			t.Skipf("reference capture %s not present", file)
		}
		img, _ := png.Decode(f)
		f.Close()
		if got := screens.Visible(img, screens.TItemReplace); got != want {
			t.Errorf("%s: Replace visible = %v, want %v", file, got, want)
		}
	}
}
