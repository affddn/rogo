package tasks

import (
	"image"
	"testing"

	"github.com/affddn/rogo/assets"
	"github.com/affddn/rogo/internal/screens"
	"github.com/affddn/rogo/internal/vision"
)

func TestNewModeScreens(t *testing.T) {
	for file, want := range map[string]screens.ID{
		"newmodes/wish.png":              screens.CollectionWish,
		"newmodes/wish-10x.png":          screens.WishResult,
		"newmodes/colgear.png":           screens.CollectionGear,
		"newmodes/colgear-activated.png": screens.CardDetails,
		"newmodes/tower.png":             screens.EndlessTower,
		"newmodes/tower-sweep.png":       screens.DailySweep,
		"newmodes/tower-after-sweep.png": screens.EndlessTower,
	} {
		if got := screens.Detect(capture(t, file)); got != want {
			t.Errorf("%s: detected %s, want %s", file, got, want)
		}
	}
}

func TestCollectionWishReads(t *testing.T) {
	main := capture(t, "newmodes/tut1.png")
	m := assets.MustGet(screens.TRailCollectionWish).FindIn(main, screens.RightRail)
	if icon := m.Center().Add(image.Pt(0, rightRailIconDY)); m.Score < 0.7 || icon.Sub(image.Pt(668, 462)).X > 12 || abs(icon.Y-462) > 15 {
		t.Errorf("Collection Wish icon at %v (%.2f), want near (668,462)", icon, m.Score)
	}
	full, empty := capture(t, "newmodes/wish.png"), capture(t, "newmodes/wish-after.png")
	for i, w := range wishButtons {
		if !wishAffordable(full, w.cost, w.icon) {
			t.Errorf("wish %d: 20 tickets read as short", i)
		}
		if wishAffordable(empty, w.cost, w.icon) {
			t.Errorf("wish %d: 0 tickets read as enough", i)
		}
	}
	if !badged(full, wishAdBadge) {
		t.Error("ad wish badge missed")
	}
	if vision.Ratio(full, wishSkipBox, isCheckGreen) >= 0.1 {
		t.Error("Skip Animation read as ticked before it was")
	}
	if vision.Ratio(capture(t, "newmodes/wish-skip.png"), wishSkipBox, isCheckGreen) < 0.1 {
		t.Error("Skip Animation read as unticked after ticking")
	}
}

func TestCollectionGearReads(t *testing.T) {
	gear := capture(t, "newmodes/colgear.png")
	n := 0
	for _, m := range assets.MustGet(screens.TColGearCanActivate).FindAll(gear, colGearGrid, 0.85, 60) {
		if m.Visible(0.85) {
			n++
		}
	}
	if n != 4 {
		t.Errorf("%d Can Activate items, want 4", n)
	}
	if !badged(capture(t, "newmodes/equip-page.png"), colGearTabBadge) {
		t.Error("Collection Gear tab badge missed")
	}
}

func TestEndlessTowerReads(t *testing.T) {
	tower := capture(t, "newmodes/tower.png")
	if !badged(tower, towerSweepBadge) {
		t.Error("sweep badge missed")
	}
	if badged(capture(t, "newmodes/tower-after-sweep.png"), towerSweepBadge) {
		t.Error("sweep badged after sweeping")
	}
	if !screens.Visible(capture(t, "newmodes/tower-sweep.png"), screens.TTowerSweepFree) {
		t.Error("Free sweep not seen")
	}
	// Remaining Attempts 0/5 against 5/5 (the button is orange in both).
	if !screens.Visible(capture(t, "newmodes/tower-no-attempts.png"), screens.TTowerAttemptsZero) {
		t.Error("0/5 attempts missed")
	}
	if screens.Visible(tower, screens.TTowerAttemptsZero) {
		t.Error("5/5 attempts read as 0/5")
	}
	res := capture(t, "newmodes/tower-ch-2.png")
	if s := assets.MustGet(screens.TTowerClearedNone).Find(res, screens.Margin).Score; s < 0.8 {
		t.Errorf("'Cleared Floor 0' missed (%.2f)", s)
	}
	if !assets.MustGet(screens.TStageLeave).Find(res.(interface {
		SubImage(image.Rectangle) image.Image
	}).SubImage(image.Rect(0, fightBand[0], 720, fightBand[1])), 30).Visible(screens.MinScore) {
		t.Error("tower Leave not seen in the fight band")
	}
}
