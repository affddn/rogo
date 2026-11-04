package tasks

// The Assassin's stat build, from a damage model built on what the game
// shows (Attribute page with a free reset at Base 37, and the skill
// descriptions):
//
//   - a stat's next point costs 1 + allocated/5 attribute points, and every
//     point spent adds the same ~16 flat PATK whichever stat takes it
//   - STR: +132 PATK; AGI: ASPD along aspdCurve, attacks per second being
//     50 / (200 - ASPD); LUK: +0.3 CRIT and +0.3 Skill CRIT; DEX: +0.5%
//     Haste, half of it skill cooldown reduction; VIT, INT: no damage
//   - crits do 150%; each skill adds a follow-up hit on a Skill CRIT
//   - Rapid Combo: every normal attack cuts all current skill cooldowns by
//     6%, so attack speed also speeds up every skill
//
// Skills make about two thirds of the damage, so the best split balances AGI
// (more attacks and more casts) with LUK (more crit follow-ups). At 324
// points the best is about STR 20, AGI 40, LUK 26, DEX 9, within 0.2% of
// the optimum whether skills hit one target or two and before or after Katar
// Mastery's Skill CRIT.

// Stats in Attribute page order.
const (
	statSTR = iota
	statAGI
	statVIT
	statINT
	statDEX
	statLUK
)

// aspdCurve is the ASPD that allocated AGI adds to the bare 152.
var aspdCurve = []struct {
	agi  int
	aspd float64
}{{0, 0}, {1, 1}, {5, 5}, {10, 9.85}, {20, 16.1}, {30, 19.15}, {40, 22.15}, {49, 24.84}}

const (
	baseASPD = 152
	maxASPD  = 190
	// aspdPerAGI extends the curve past its last measurement.
	aspdPerAGI = 0.27

	basePATK     = 40300 // with no points allocated
	patkPerSpent = 16
	patkPerSTR   = 132
	baseCRIT     = 6.2
	baseSkillCR  = 15.7
	critPerLUK   = 0.3
	critDamage   = 0.5 // extra over a normal hit

	// rapidCombo is the share of every current cooldown a normal attack
	// removes.
	rapidCombo = 0.06
	// skillTargets is how many enemies a skill hits on average while
	// farming; it sits between the one and two the build was checked for.
	skillTargets = 1.5
)

// assassinSkills are the equipped damage skills at 5/5: their damage (%),
// the follow-up a Skill CRIT adds (%) and cooldown (s). Blade Strike
// includes Dual Blade Combo; Shadowless Fang assumes stealth half the time.
var assassinSkills = []struct{ hit, critHit, cooldown float64 }{
	{590, 800, 8},  // Blade Strike
	{460, 460, 9},  // Stealth Strike
	{592, 600, 12}, // Sonic Throw
	{450, 450, 10}, // Shadowless Fang
}

func aspdFromAGI(n int) float64 {
	for i := 1; i < len(aspdCurve); i++ {
		a, b := aspdCurve[i-1], aspdCurve[i]
		if n <= b.agi {
			return a.aspd + (b.aspd-a.aspd)*float64(n-a.agi)/float64(b.agi-a.agi)
		}
	}
	last := aspdCurve[len(aspdCurve)-1]
	return last.aspd + aspdPerAGI*float64(n-last.agi)
}

func attacksPerSecond(agi int) float64 {
	return 50 / (200 - min(baseASPD+aspdFromAGI(agi), maxASPD))
}

// castPeriod is how often a skill with cooldown c comes back when normal
// attacks land every 1/f seconds, each cutting what is left by rapidCombo.
func castPeriod(c, f, cdr float64) float64 {
	left, t, dt := c*(1-cdr), 0.0, 1/f
	for left > 0 {
		step := min(dt, left)
		left -= step
		t += step
		if left > 0 {
			left *= 1 - rapidCombo
		}
	}
	return max(t, 0.5)
}

// pointCost is what the next point in a stat with n allocated costs.
func pointCost(n int) int { return 1 + n/5 }

func spentOn(n int) int {
	s := 0
	for k := 0; k < n; k++ {
		s += pointCost(k)
	}
	return s
}

// damage is the model's damage per second, up to a constant factor.
func damage(alloc [6]int) float64 {
	spent := 0
	for _, n := range alloc {
		spent += spentOn(n)
	}
	patk := basePATK + patkPerSpent*float64(spent) + patkPerSTR*float64(alloc[statSTR])
	crit := min((baseCRIT+critPerLUK*float64(alloc[statLUK]))/100, 1)
	skillCrit := min((baseSkillCR+critPerLUK*float64(alloc[statLUK]))/100, 1)
	f := attacksPerSecond(alloc[statAGI])
	cdr := (0.5 + 0.5*float64(alloc[statDEX])) / 200
	perSecond := f * (1 + critDamage*crit)
	for _, s := range assassinSkills {
		cast := s.hit*(1+critDamage*skillCrit) + skillCrit*s.critHit*(1+critDamage)
		perSecond += skillTargets * cast / 100 / castPeriod(s.cooldown, f, cdr)
	}
	return patk * perSecond
}

// nextStat picks the stat whose next point adds the most damage per
// attribute point among those the points can still pay for. Damage moves in
// steps (attack timing), so each stat is judged over its next few points.
func nextStat(alloc [6]int, points int) (int, bool) {
	const lookahead = 3
	now := damage(alloc)
	best, bestValue := -1, 0.0
	for s := range alloc {
		if pointCost(alloc[s]) > points {
			continue
		}
		next := alloc
		next[s] += lookahead
		cost := spentOn(next[s]) - spentOn(alloc[s])
		if v := (damage(next) - now) / float64(cost); v > bestValue {
			best, bestValue = s, v
		}
	}
	return best, best >= 0
}
