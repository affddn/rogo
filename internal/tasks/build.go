package tasks

import "math"

// The Assassin's stat build, from a damage model built on what the game
// shows (Attribute page with a free reset at Base 37, and the skill
// descriptions):
//
//   - a stat's next point costs 1 + allocated/5 attribute points, and every
//     point spent adds the same ~16 flat PATK whichever stat takes it
//   - STR: +132 PATK; AGI: ASPD along aspdCurve, attacks per second being
//     50 / (200 - ASPD); LUK: +0.3 CRIT and +0.3 Skill CRIT; DEX: +0.5%
//     Haste, half of it skill cooldown reduction; VIT, INT: no damage.
//     ASPD, CRIT, Skill CRIT and Haste all follow the stat's total (bonuses
//     included), checked against four Attribute page readings on 5-6 Nov.
//   - CRIT, Skill CRIT and Aspd also take gear, cards and job passives
//     (Katar Specialization: +6 Skill CRIT a level), so calibrate re-reads
//     their bases from the Attribute page before every plan.
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

// aspdCurve is the ASPD that total AGI adds to the bare 152.
var aspdCurve = []struct {
	agi  int
	aspd float64
}{{0, 0}, {1, 1}, {5, 5}, {10, 9.85}, {20, 16.1}, {30, 19.15}, {40, 22.15}, {49, 24.84}}

const (
	baseASPD = 152
	maxASPD  = 190
	// aspdPerAGI extends the curve past its last measurement; readings at
	// 47, 53 and 57 total AGI rise 0.25-0.29 a point.
	aspdPerAGI = 0.27

	// basePATK is PATK with no points allocated: 803K shown on 6 Nov less
	// what the points gave. Stats add only a few percent of it now, so the
	// plan barely moves with it (the same split from 250K up).
	basePATK     = 780000
	patkPerSpent = 16
	patkPerSTR   = 132
	critPerLUK   = 0.3
	critDamage   = 0.5 // extra over a normal hit
)

// Bases the Attribute page shows on top of what stats give, set by
// calibrate; the defaults are the 6 Nov reading (CRIT 29.4, Skill CRIT 50.4
// and Aspd 177.39 at 68 LUK and 53 AGI in total).
var (
	baseCRIT    = 9.0
	baseSkillCR = 30.0
	aspdBonus   = -0.5
)

const (

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

// attacksPerSecond is the ATK Freq the Attribute page shows for total AGI.
func attacksPerSecond(agi int) float64 {
	return 50 / (200 - min(baseASPD+aspdFromAGI(agi)+aspdBonus, maxASPD))
}

// calibrate sets the bases from the Attribute page's CRIT, Skill CRIT and
// Aspd, given the stat totals (allocated plus bonuses) they were shown at.
func calibrate(total [6]int, crit, skillCrit, aspd float64) {
	luk := critPerLUK * float64(total[statLUK])
	baseCRIT, baseSkillCR = crit-luk, skillCrit-luk
	if aspd < maxASPD { // a capped Aspd says nothing about the bonus
		aspdBonus = aspd - baseASPD - aspdFromAGI(total[statAGI])
	}
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
// Awakening (Character > Awakening, read 5 Nov). Each build has two
// abilities whose tiers switch on at stat thresholds (total stats, gear
// included).
//
// Killing Intent Rhythm, on STR: every skill cast adds a stack of final
// Skill DMG (10 s), 1% a stack up to 10; tiers raise the per-stack bonus
// (60: 1.5%, 180: 2.5%), the cap (95: 20 stacks, 2 per cast), add +20%
// final damage against normal monsters at full stacks (125), and add flat
// Skill DMG and PATK (40, 80, 110, 140, 160, 200).
//
// Shadow Assault, on Skill CRIT: every 7 crits (5 from 30) give a stack;
// 4 stacks cast 3 AoE hits of 300% (+100% at 30, +150% at 50; 5 hits from
// 90); flat tiers at 20, 40, 60, 75.
//
// statBonus is what pets, cards and gear add to each stat on top of the
// allocated points: the Attribute page's All column less Total Allocated,
// read by Attributes before it plans. The defaults are the 6 Nov reading.
var statBonus = [6]int{statSTR: 23, statAGI: 17, statVIT: 1, statINT: 12, statDEX: 3, statLUK: 17}

type flatTier struct {
	at   float64
	dmg  float64 // Skill DMG Boost
	patk float64
}

var (
	strTiers = []flatTier{{40, 0.05, 600}, {80, 0.05, 1400}, {110, 0.05, 3800}, {140, 0.05, 5000}, {160, 0.05, 6000}, {200, 0.05, 8000}}
	scTiers  = []flatTier{{20, 0.05, 300}, {40, 0.05, 600}, {60, 0.05, 900}, {75, 0.05, 1400}}
)

// rhythm is Killing Intent Rhythm's final Skill DMG multiplier at full
// stacks (casts come every few seconds, well inside the 10 s window).
func rhythm(str float64) float64 {
	per, stacks := 0.01, 10.0
	if str >= 60 {
		per = 0.015
	}
	if str >= 95 {
		stacks = 20
	}
	if str >= 180 {
		per = 0.025
	}
	return 1 + per*stacks
}

// Survival. VIT gives +0.5% Max HP and +0.2% damage reduction a point; the
// stage pushes the bot keeps losing (Maya at 5-12) are lost by dying with
// the boss timer running. Damage dealt in such a fight scales with time
// alive, so the objective weighs effective HP in at survivalWeight: half
// the fights that matter are survival-bound, idle farming is not.
const survivalWeight = 0.5

func effectiveHP(vit int) float64 {
	v := float64(vit)
	return (1 + 0.005*v) / (1 - 0.002*v)
}

// Skill hits per cast that can crit (each feeds Shadow Assault), in
// assassinSkills order.
var skillHits = []float64{2, 2, 8, 2}

func damage(alloc [6]int) float64 {
	spent := 0
	for _, n := range alloc {
		spent += spentOn(n)
	}
	patk := basePATK + patkPerSpent*float64(spent) + patkPerSTR*float64(alloc[statSTR])
	luk := float64(alloc[statLUK] + statBonus[statLUK])
	crit := min((baseCRIT+critPerLUK*luk)/100, 1)
	skillCritPct := baseSkillCR + critPerLUK*luk
	skillCrit := min(skillCritPct/100, 1)
	str := float64(alloc[statSTR] + statBonus[statSTR])

	skillDmg := 1.0
	for _, t := range strTiers {
		if str >= t.at {
			skillDmg += t.dmg
			patk += t.patk
		}
	}
	for _, t := range scTiers {
		if skillCritPct >= t.at {
			skillDmg += t.dmg
			patk += t.patk
		}
	}
	skillDmg *= rhythm(str)

	f := attacksPerSecond(alloc[statAGI] + statBonus[statAGI])
	cdr := 0.5 * float64(alloc[statDEX]+statBonus[statDEX]) / 200 // half of Haste
	perSecond := f * (1 + critDamage*crit)
	critTriggers := f * crit
	for i, s := range assassinSkills {
		period := castPeriod(s.cooldown, f, cdr)
		cast := s.hit*(1+critDamage*skillCrit) + skillCrit*s.critHit*(1+critDamage)
		perSecond += skillDmg * skillTargets * cast / 100 / period
		critTriggers += skillHits[i] * skillTargets * skillCrit / period
	}
	// Shadow Assault: casts per second from crit triggers, 3 AoE hits.
	perStack, coeff, hits := 7.0, 3.0, 3.0
	if skillCritPct >= 30 {
		perStack, coeff = 5, coeff+1
	}
	if skillCritPct >= 50 {
		coeff += 1.5
	}
	if skillCritPct >= 90 {
		hits = 5
	}
	perSecond += skillDmg * skillTargets * hits * coeff * critTriggers / (perStack * 4)

	// +20% final damage against normal monsters at full stacks, which is
	// most of what the bot fights.
	if str >= 125 {
		perSecond *= 1.15
	}
	return patk * perSecond * math.Pow(effectiveHP(alloc[statVIT]), survivalWeight)
}

// nextStat picks the stat whose next point adds the most damage per
// attribute point among those the points can still pay for. Damage moves in
// steps (attack timing), so each stat is judged over its next few points.
func nextStat(alloc [6]int, points int) (int, bool) {
	if s, ok := thresholdStat(alloc); ok && pointCost(alloc[s]) <= points {
		return s, true
	}
	return greedyStat(alloc, points)
}

// bestBuild is the split of total attribute points the model rates highest,
// for spending a whole pool after a reset (free on the Attribute page).
// Point by point the planner cannot get there: the best LUK is not steady
// as points grow (Skill CRIT 50 is worth chasing at ~600 points with the 6
// Nov bases, and AGI toward the ASPD cap beats it at ~850), and points
// once spent stay put. STR goes in single steps, since its Awakening tiers
// sit on exact totals; AGI, VIT and LUK in steps of 2 with DEX taking the
// rest, then single-point trades between stats polish the result.
func bestBuild(total int) [6]int {
	fill := func(a [6]int, s int) [6]int {
		left := total
		for _, n := range a {
			left -= spentOn(n)
		}
		for left >= pointCost(a[s]) {
			left -= pointCost(a[s])
			a[s]++
		}
		return a
	}
	var best [6]int
	bd := 0.0
	for st := 0; spentOn(st) <= total; st++ {
		for ag := 0; spentOn(st)+spentOn(ag) <= total; ag += 2 {
			for lu := 0; ; lu += 2 {
				c := spentOn(st) + spentOn(ag) + spentOn(lu)
				if c > total {
					break
				}
				for vi := 0; c+spentOn(vi) <= total; vi += 2 {
					a := fill([6]int{statSTR: st, statAGI: ag, statVIT: vi, statLUK: lu}, statDEX)
					if d := damage(a); d > bd {
						best, bd = a, d
					}
				}
			}
		}
	}
	for improved := true; improved; {
		improved = false
		for from := range best {
			for to := range best {
				for k := 1; k <= 3 && from != to && best[from] >= k; k++ {
					a := best
					a[from] -= k
					if a = fill(a, to); damage(a) > bd*(1+1e-9) {
						best, bd, improved = a, damage(a), true
					}
				}
			}
		}
	}
	return best
}

func strAt(v int) func([6]int) bool {
	return func(a [6]int) bool { return a[statSTR]+statBonus[statSTR] >= v }
}

func scAt(v float64) func([6]int) bool {
	return func(a [6]int) bool { return baseSkillCR+critPerLUK*float64(a[statLUK]+statBonus[statLUK]) >= v }
}

// planHorizon is how many attribute points ahead an Awakening threshold is
// planned for (about ten levels).
const planHorizon = 200

// thresholdStat returns the stat to pour points into when reaching an
// Awakening threshold within planHorizon points beats spending the same
// points greedily. Greedy steps cannot see a bonus 15 points away.
func thresholdStat(alloc [6]int) (int, bool) {
	greedy := damage(spendGreedy(alloc, planHorizon))
	best, bestDmg := -1, greedy
	for _, goal := range []struct {
		stat   int
		target func([6]int) bool
	}{
		{statSTR, strAt(40)}, {statSTR, strAt(60)}, {statSTR, strAt(80)}, {statSTR, strAt(95)},
		{statSTR, strAt(110)}, {statSTR, strAt(125)},
		{statLUK, scAt(40)}, {statLUK, scAt(50)}, {statLUK, scAt(60)}, {statLUK, scAt(75)},
	} {
		if goal.target(alloc) {
			continue
		}
		a, left := alloc, planHorizon
		for !goal.target(a) && pointCost(a[goal.stat]) <= left {
			left -= pointCost(a[goal.stat])
			a[goal.stat]++
		}
		if !goal.target(a) {
			continue
		}
		if d := damage(spendGreedy(a, left)); d > bestDmg*1.005 {
			best, bestDmg = goal.stat, d
		}
	}
	return best, best >= 0
}

func spendGreedy(alloc [6]int, points int) [6]int {
	for {
		s, ok := greedyStat(alloc, points)
		if !ok {
			return alloc
		}
		points -= pointCost(alloc[s])
		alloc[s]++
	}
}

// greedyStat picks the stat whose next few points add the most damage per
// attribute point.
func greedyStat(alloc [6]int, points int) (int, bool) {
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
