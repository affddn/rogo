package tasks

import (
	"image"
	"image/png"
	"os"
	"testing"

	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

func TestBagOver20(t *testing.T) {
	for file, want := range map[string]bool{"equip-now.png": true, "equip-empty.png": false} {
		f, err := os.Open("../../../../captures/" + file)
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
		f, err := os.Open("../../../../captures/" + file)
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
		f, err := os.Open("../../../../captures/" + file)
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
		f, err := os.Open("../../../../captures/" + file)
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
		f, err := os.Open("../../../../captures/" + file)
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

func TestLowestBadgedLevelsTheLowestSlot(t *testing.T) {
	f, err := os.Open("../../../../captures/enh-now.png") // all eight slots badged
	if err != nil {
		t.Skip("reference capture enh-now.png not present")
	}
	img, _ := png.Decode(f)
	f.Close()
	saved := enhanceLevels
	defer func() { enhanceLevels = saved }()

	// armor belt pants cape gloves boots | pendant ring
	enhanceLevels = [len(enhanceSlots)]int{91, 90, 90, 90, 90, 90, 60, 56}
	if i, ok := lowestBadged(img); !ok || i != 7 {
		t.Fatalf("picked slot %d %v, want the ring (7), the lowest slot", i, ok)
	}
	enhanceLevels = [len(enhanceSlots)]int{62, 58, 57, 56, 56, 55, 70, 70}
	if i, _ := lowestBadged(img); i != 5 {
		t.Fatalf("picked slot %d, want boots (5), the lowest slot", i)
	}
	enhanceLevels = [len(enhanceSlots)]int{90, 90, 90, 90, 90, 90, 90, 90}
	if i, _ := lowestBadged(img); i != 0 {
		t.Fatalf("picked slot %d, want a set item (0) on a tie", i)
	}
	enhanceLevels[5] = 0 // unread levels go first so they get read
	enhanceLevels[2] = 0
	if i, _ := lowestBadged(img); i != 2 {
		t.Fatalf("picked slot %d, want the first unread slot (2)", i)
	}
	enhanceLevels = [len(enhanceSlots)]int{62, 58, 57, 56, 56, unreadLevel, 70, 70}
	if i, _ := lowestBadged(img); i != 3 {
		t.Fatalf("picked slot %d, want cape (3, tied with gloves) before an unreadable slot", i)
	}
}

func TestEnhanceToNeedsAllLevelsAffordable(t *testing.T) {
	// 34 metal: one level (18 or 20) yes, the run to the next tier no.
	for _, name := range []string{"enh-ring.png", "enh-pendant.png"} {
		f := capture(t, name)
		if vision.Ratio(f, enhanceCost, vision.IsGreenText) < 0.05 {
			t.Errorf("%s: the single level reads unaffordable", name)
		}
		if vision.Ratio(f, enhanceToCost, vision.IsGreenText) >= 0.05 {
			t.Errorf("%s: Enhance to Level N reads affordable with 34 metal", name)
		}
	}
}

func TestBadgedCardOpenedOnce(t *testing.T) {
	// Termite's badge is for a star raise (3/3 copies), not an activation.
	f := capture(t, "card/star-badge.png")
	opened := map[image.Point]bool{}
	c, ok := nextBadgedCard(f, opened)
	if !ok || c != cardCorners[0] {
		t.Fatalf("first badged card %v (%v); want Termite's corner %v", c, ok, cardCorners[0])
	}
	opened[c] = true
	if c, ok := nextBadgedCard(f, opened); ok {
		t.Errorf("badged card %v offered again after Termite was opened", c)
	}
}
