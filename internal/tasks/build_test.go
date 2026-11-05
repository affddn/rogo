package tasks

import (
	"math"
	"testing"
)

func spend(alloc [6]int, points int) ([6]int, int) {
	for {
		s, ok := nextStat(alloc, points)
		if !ok {
			return alloc, points
		}
		points -= pointCost(alloc[s])
		alloc[s]++
	}
}

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
					if a := [6]int{st, ag, vi, 0, dx, lu}; damage(a) > bd {
						best, bd = a, damage(a)
					}
				}
			}
		}
	}
	return best
}

func TestNextStatNearTheSearchedOptimum(t *testing.T) {
	// The planner trades up to ~1.5% now for reaching an Awakening tier a
	// few levels on (Skill CRIT 50 around 600 points).
	for _, total := range []int{324, 444, 594, 844} {
		best := searchBest(total)
		got, left := spend([6]int{}, total)
		if got[statINT] > 1 || left > 1 {
			t.Errorf("%d points -> %v (%d left)", total, got, left)
		}
		if r := damage(got) / damage(best); r < 0.985 {
			t.Errorf("%d points -> %v, %.3f of the searched best %v", total, got, r, best)
		}
		if got[statSTR]+statBonus[statSTR] < 40 {
			t.Errorf("%d points -> STR %d, want the STR 40 Awakening tier", total, got[statSTR]+statBonus[statSTR])
		}
	}
}

func TestRhythmTiers(t *testing.T) {
	for str, want := range map[float64]float64{5: 1.10, 60: 1.15, 95: 1.30, 180: 1.50} {
		if got := rhythm(str); math.Abs(got-want) > 1e-9 {
			t.Errorf("STR %v: rhythm %.3f, want %.3f", str, got, want)
		}
	}
	if effectiveHP(0) != 1 || effectiveHP(20) <= 1.1 {
		t.Errorf("effective HP at VIT 20 is %.3f", effectiveHP(20))
	}
}

func TestBuildBeatsTheGameRecommendation(t *testing.T) {
	recommended := [6]int{22, 30, 0, 0, 0, 37} // the game's allocation at Base 37
	if r := damage(searchBest(324)) / damage(recommended); r < 1.01 {
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
