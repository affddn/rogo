package tasks

import (
	"math"
	"testing"
)

// lkBonus is the Lord Knight's stat bonuses on 7 Nov: the Attribute page's
// All column less Total Allocated.
var lkBonus = [6]int{statSTR: 19, statAGI: 26, statVIT: 5, statINT: 11, statDEX: 9, statLUK: 4}

// lkApplied is the build applied after the 7 Nov reset (990 points), and
// lkRecommended the game's Recommended Allocation it replaced, with 10
// points it could not place.
var (
	lkApplied     = [6]int{statSTR: 61, statAGI: 71, statDEX: 1, statLUK: 19}
	lkRecommended = [6]int{statSTR: 68, statAGI: 67}
)

func withBonus(t *testing.T, bonus [6]int) {
	saved := statBonus
	statBonus = bonus
	t.Cleanup(func() { statBonus = saved })
}

func TestLordKnightAspd(t *testing.T) {
	// The Attribute page's previews on 7 Nov, by total AGI.
	for agi, want := range map[int]float64{26: 175.79, 66: 184.70, 76: 185.74, 86: 186.44, 93: 186.89, 97: 187.14, 100: 187.33} {
		if got := lkAspd(agi); math.Abs(got-want) > 0.05 {
			t.Errorf("AGI %d: Aspd %.2f, want %.2f", agi, got, want)
		}
	}
}

func TestLordKnightBuild(t *testing.T) {
	withBonus(t, lkBonus)
	best := bestBuild(lordKnight, 990)
	if str := best[statSTR] + lkBonus[statSTR]; str != 80 {
		t.Errorf("best build %v has STR %d, want exactly the STR 80 tier", best, str)
	}
	if r := lordKnight.damage(best) / lordKnight.damage(lkApplied); r > 1.005 {
		t.Errorf("best build %v is %.3f of the applied one", best, r)
	}
	if r := lordKnight.damage(lkApplied) / lordKnight.damage(lkRecommended); r < 1.025 || r > 1.04 {
		t.Errorf("applied build %.3f of the game's, the page said ~1.033", r)
	}
	if _, ok := rebuildBeats(lordKnight, lkRecommended, 10); !ok {
		t.Error("the game's split does not call for a rebuild")
	}
	if _, ok := rebuildBeats(lordKnight, lkApplied, 15); ok {
		t.Error("a level's points on the 7 Nov rebuild call for another")
	}
}

func TestLordKnightSparePoints(t *testing.T) {
	withBonus(t, lkBonus)
	a, _ := spendPlanned(lordKnight, lkApplied, 60)
	if a[statVIT] != 0 || a[statINT] != 0 || a[statDEX] != 1 {
		t.Errorf("spare points went to an idle stat: %v", a)
	}
	// Below STR 80 the plan climbs back to it before anything else.
	low := lkApplied
	low[statSTR] = 55
	if a, _ := spendPlanned(lordKnight, low, 80); a[statSTR]+lkBonus[statSTR] < 80 {
		t.Errorf("80 points from STR %d stopped at %v", low[statSTR]+lkBonus[statSTR], a)
	}
}
