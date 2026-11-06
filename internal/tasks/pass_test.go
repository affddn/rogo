package tasks

import (
	"image"
	"testing"
)

func TestSeasonPassTabBadge(t *testing.T) {
	// Four passes: the badged Equipment tab sits right of Pet, where the
	// old fixed tab spots no longer matched.
	frame := capture(t, "badges/pass-equipment-tab.png")
	dot, ok := nextBadgeIn(frame, passTabBadges, nil)
	if !ok {
		t.Fatal("Equipment pass tab badge missed")
	}
	if tab := dot.Add(passTabFromDot); tab.X < 440 || tab.X > 580 {
		t.Errorf("tab tap %v is not on the Equipment tab (440-580)", tab)
	}
	if _, ok := nextBadgeIn(frame, passTabBadges, func(p image.Point) bool { return p.X/40 == dot.X/40 }); ok {
		t.Error("a second tab badge found where there is one")
	}
	if !badged(frame, passClaimBadge) {
		t.Error("Claim All badge missed")
	}
}
