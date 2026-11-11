package tasks

// The Lord Knight's stat build (Agi Sword, the game's recommended skill
// path), from the Attribute page's previews after a free reset at Base 67 on
// 7 Nov (990 points):
//
//   - every point spent adds ~61 PATK whichever stat takes it, and a STR
//     point 1830 more: 774.4K with nothing allocated, 946.3K at STR 61 with
//     all 990 spent
//   - AGI: Aspd along the Assassin's aspdCurve scaled by 0.784, from 175.79
//     at 26 AGI to 187.33 at 100 (seven readings, all within 0.02); ATK
//     Freq is 50 / (200 - Aspd), as for the Assassin
//   - LUK: +0.3 CRIT; DEX: +0.5% Haste, which leaves ATK Freq alone; VIT
//     and INT: nothing for damage
//
// The damage is normal attacks. Raging Fighting Spirit (on STR) stacks
// Battle Will on each one, and Flame Sword Energy (on Aspd) turns their area
// hit into flying swords. Both Awakenings top out at STR 80 and Aspd 183, so
// past those each point trades STR (PATK) against AGI (ATK Freq, steeper
// toward the 190 cap) and LUK (crits). At 990 points the best is STR 61 (80
// in total), AGI 71, LUK 19. By the model that is 3% over the game's
// Recommended Allocation (STR 68, AGI 67), and the page agreed once it was
// applied: PATK -1.4%, ATK Freq 3.81 to 3.89, CRIT 18.7 to 24.4.
const (
	lkBasePATK     = 774400
	lkPATKPerSTR   = 1830
	lkPATKPerSpent = 61
	lkAspdScale    = 0.784
	// awakenPATK is what one PATK listed on a Lord Knight Awakening tier
	// adds to the Attribute page's PATK: activating the four PATK tiers
	// (2900 listed) raised it from 946.3K to 1025.4K on 7 Nov.
	awakenPATK = 27.3
)

// Bases the Attribute page shows on top of what stats give, set by
// calibrateLordKnight; the defaults are the 7 Nov reading (Aspd 175.79 at
// 26 AGI, CRIT 18.7 at 4 LUK).
var (
	lkBaseASPD = 162.27
	lkBaseCRIT = 17.5
)

// The Awakening tiers that add Normal Attack DMG Boost and PATK, at total
// STR (Raging Fighting Spirit) and Aspd (Flame Sword Energy). The Aspd 150
// and 178 tiers (Berserk, then Berserk for good) sit below the Aspd a Lord
// Knight has with no AGI allocated, so they never weigh on a plan.
var (
	lkSTRTiers  = []flatTier{{40, 0.05, 600}, {80, 0.05, 1400}}
	lkAspdTiers = []flatTier{{170, 0.05, 300}, {183, 0.05, 600}}
)

func lkAspd(agi int) float64 {
	return min(lkBaseASPD+lkAspdScale*aspdFromAGI(agi), maxASPD)
}

func lordKnightDamage(alloc [6]int) float64 {
	spent := 0
	for _, n := range alloc {
		spent += spentOn(n)
	}
	str := float64(alloc[statSTR] + statBonus[statSTR])
	aspd := lkAspd(alloc[statAGI] + statBonus[statAGI])
	patk := lkBasePATK + lkPATKPerSTR*float64(alloc[statSTR]) + lkPATKPerSpent*float64(spent)
	boost, listed := 1.0, 0.0
	for _, t := range lkSTRTiers {
		if str >= t.at {
			boost += t.dmg
			listed += t.patk
		}
	}
	for _, t := range lkAspdTiers {
		if aspd >= t.at {
			boost += t.dmg
			listed += t.patk
		}
	}
	patk += awakenPATK * listed
	// Battle Will: 30 stacks at a normal attack each (10 s), 0.5% a stack
	// from STR 5 and 0.7% from STR 60.
	will := 1.0
	switch {
	case str >= 60:
		will = 1.21
	case str >= 5:
		will = 1.15
	}
	luk := float64(alloc[statLUK] + statBonus[statLUK])
	crit := min((lkBaseCRIT+critPerLUK*luk)/100, 1)
	return patk * 50 / (200 - aspd) * (1 + critDamage*crit) * boost * will
}

func calibrateLordKnight(total [6]int, crit, _, aspd float64) {
	lkBaseCRIT = crit - critPerLUK*float64(total[statLUK])
	if aspd < maxASPD { // a capped Aspd says nothing about the base
		lkBaseASPD = aspd - lkAspdScale*aspdFromAGI(total[statAGI])
	}
}

func lkAspdAt(v float64) func([6]int) bool {
	return func(a [6]int) bool { return lkAspd(a[statAGI]+statBonus[statAGI]) >= v }
}

var lordKnight = &model{
	damage:    lordKnightDamage,
	calibrate: calibrateLordKnight,
	bases:     func() []any { return []any{"crit", lkBaseCRIT, "aspd", lkBaseASPD} },
	goals: []goal{
		{statSTR, strAt(40)}, {statSTR, strAt(60)}, {statSTR, strAt(80)},
		{statAGI, lkAspdAt(170)}, {statAGI, lkAspdAt(183)},
	},
	idle: []int{statVIT, statINT, statDEX},
}
