package tasks

import (
	"math"
	"testing"
)

// searchBest tries STR/AGI/VIT/LUK splits of total points (AGI, VIT and
// LUK in steps of 2), with the rest in DEX.
func searchBest(total int) [6]int {
	var best [6]int
	bd := 0.0
	for st := 0; st <= 80; st++ {
		for ag := 0; ag <= 90 && spentOn(st)+spentOn(ag) <= total; ag += 2 {
			for lu := 0; lu <= 90; lu += 2 {
				c := spentOn(st) + spentOn(ag) + spentOn(lu)
				if c > total {
					break
				}
				for vi := 0; vi <= 50 && c+spentOn(vi) <= total; vi += 2 {
					c2 := c + spentOn(vi)
					dx := 0
					for c2+spentOn(dx+1) <= total {
						dx++
					}
					if a := [6]int{st, ag, vi, 0, dx, lu}; assassin.damage(a) > bd {
						best, bd = a, assassin.damage(a)
					}
				}
			}
		}
	}
	return best
}

func TestBestBuildBeatsTheGrid(t *testing.T) {
	for _, total := range []int{324, 594, 854} {
		got, grid := bestBuild(assassin, total), searchBest(total)
		if r := assassin.damage(got) / assassin.damage(grid); r < 0.999 {
			t.Errorf("%d points -> %v, %.3f of the grid's %v", total, got, r, grid)
		}
		if left := total - spentOn(got[0]) - spentOn(got[1]) - spentOn(got[2]) - spentOn(got[3]) - spentOn(got[4]) - spentOn(got[5]); got[statINT] > 0 || left < 0 || left > 1 {
			t.Errorf("%d points -> %v (%d left)", total, got, left)
		}
		if got[statSTR]+statBonus[statSTR] < 40 {
			t.Errorf("%d points -> STR %d, want the STR 40 Awakening tier", total, got[statSTR]+statBonus[statSTR])
		}
	}
}

func TestRebuildBeats(t *testing.T) {
	// The build before the 6 Nov reset is ~10% behind a rebuild.
	if _, ok := rebuildBeats(assassin, [6]int{59, 36, 11, 0, 12, 51}, 3); !ok {
		t.Error("the pre-reset 6 Nov build does not call for a rebuild")
	}
	// A level's points on a fresh rebuild do not.
	if _, ok := rebuildBeats(assassin, bestBuild(assassin, 854), 15); ok {
		t.Error("15 points on a fresh rebuild call for another")
	}
}

func TestSparePointsSkipINT(t *testing.T) {
	// 6 Nov 23:30: 22 points on the rebuild went 3 to STR, then the 2 left
	// to INT, the only stat they could still pay for.
	if a, _ := spendPlanned(assassin, [6]int{37, 52, 17, 0, 21, 53}, 22); a[statINT] != 0 {
		t.Errorf("spare points went to INT: %v", a)
	}
}

func TestRhythmTiers(t *testing.T) {
	for str, want := range map[float64]float64{5: 1.10, 60: 1.15, 95: 1.30, 180: 1.50} {
		if got := rhythm(str); math.Abs(got-want) > 1e-9 {
			t.Errorf("STR %v: rhythm %.3f, want %.3f", str, got, want)
		}
	}
	if effectiveHP(0) != 1 || effectiveHP(20) <= 1.04 {
		t.Errorf("effective HP at VIT 20 is %.3f", effectiveHP(20))
	}
}

func TestBuildBeatsTheGameRecommendation(t *testing.T) {
	recommended := [6]int{22, 30, 0, 0, 0, 37} // the game's allocation at Base 37
	if r := assassin.damage(searchBest(324)) / assassin.damage(recommended); r < 1.01 {
		t.Errorf("searched build only %.3f of the recommended one", r)
	}
}

func TestRapidComboShortensCooldowns(t *testing.T) {
	// Potential Burst (25 s cooldown, 15 s buff) stays up at this build's
	// attack speed.
	if p := castPeriod(25, attacksPerSecond(40), 0); p > 15 {
		t.Errorf("25 s cooldown comes back every %.1f s at AGI 40", p)
	}
}
