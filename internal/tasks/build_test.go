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

func TestNextStatNearTheSearchedOptimum(t *testing.T) {
	// The exhaustive search's best split for 324 points.
	best := [6]int{20, 40, 0, 0, 9, 26}
	got, left := spend([6]int{}, 324)
	if got[statVIT]+got[statINT] != 0 {
		t.Errorf("points went to VIT or INT: %v", got)
	}
	if r := damage(got) / damage(best); r < 0.99 || left > 1 {
		t.Errorf("324 points -> %v (%d left), %.3f of the searched best", got, left, r)
	}
	t.Logf("324 points -> STR %d AGI %d DEX %d LUK %d", got[statSTR], got[statAGI], got[statDEX], got[statLUK])
}

func TestBuildBeatsTheGameRecommendation(t *testing.T) {
	recommended := [6]int{22, 30, 0, 0, 0, 37} // the game's allocation at Base 37
	if r := damage([6]int{20, 40, 0, 0, 9, 26}) / damage(recommended); r < 1.01 {
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
