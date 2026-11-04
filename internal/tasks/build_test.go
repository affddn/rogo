package tasks

import "testing"

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

// searchBest tries every STR/AGI/LUK split of total points, with the rest
// in DEX.
func searchBest(total int) [6]int {
	var best [6]int
	bd := 0.0
	for st := 0; st <= 60; st++ {
		for ag := 0; ag <= 70 && spentOn(st)+spentOn(ag) <= total; ag++ {
			for lu := 0; lu <= 70; lu++ {
				c := spentOn(st) + spentOn(ag) + spentOn(lu)
				if c > total {
					break
				}
				dx := 0
				for c+spentOn(dx+1) <= total {
					dx++
				}
				if a := [6]int{st, ag, 0, 0, dx, lu}; damage(a) > bd {
					best, bd = a, damage(a)
				}
			}
		}
	}
	return best
}

func TestNextStatNearTheSearchedOptimum(t *testing.T) {
	for _, total := range []int{324, 400, 480} {
		best := searchBest(total)
		got, left := spend([6]int{}, total)
		if got[statINT] != 0 || left > 1 {
			t.Errorf("%d points -> %v (%d left)", total, got, left)
		}
		if r := damage(got) / damage(best); r < 0.99 {
			t.Errorf("%d points -> %v, %.3f of the searched best %v", total, got, r, best)
		}
		// Reaching STR 40 (Awakening) pays at every total here.
		if got[statSTR]+strFromGear < awakenSTR40 {
			t.Errorf("%d points -> STR %d, want the STR 40 Awakening tier", total, got[statSTR]+strFromGear)
		}
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
