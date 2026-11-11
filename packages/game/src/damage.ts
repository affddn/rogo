// Damage per hit, as the game computes it.
// Source: Cross.dll, Cross.Fight.FightFormulaTemplate (BaseHurt, EDHurt, CondDmgMod) wired up by the
// fight_formula table (F1 BasePHurt, F3 NormalPHurt, F5 SkillPHurt, F8/F10 inner modifier, F14 final modifier).
import type { Enemy } from "./types";
import type { Profile } from "./profile";

/** CondDmgMod(a, b, c; increases, reductions): one damage layer where our boosts meet their reductions.
 * d = inc - red; past inc + red = b the effect fades with exp(-c * excess), down to a share a.
 * d >= 0 multiplies by 1 + f, d < 0 divides by 1 - f. */
export function condDmgMod(a: number, b: number, c: number, inc: number, red: number): number {
  const d = inc - red;
  const s = inc + red;
  const f = d * (a + (1 - a) * Math.exp(-c * Math.max(0, s - b)));
  return d >= 0 ? 1 + f : 1 / (1 - f);
}

/** BaseHurt: ATK * ATK / (ATK + 2 * DEF * (1 - pen)) + (refine ATK - refine DEF), at least 1. */
export function baseHurt(
  atk: number,
  def: number,
  pen: number,
  refineAtk: number,
  refineDef: number,
): number {
  const p = Math.min(1, Math.max(0, pen));
  return Math.max(1, (atk * atk) / (atk + 2 * def * (1 - p)) + (refineAtk - refineDef));
}

export interface HitBreakdown {
  base: number;
  innerNormal: number;
  innerSkill: number;
  final: number;
  normal: number;
  skill: number;
  incNormal: number;
  incSkill: number;
  red: number;
}

/** One hit on an enemy, before crit and skill multipliers. `scale` multiplies flat ATK and refine ATK. */
export function hit(profile: Profile, enemy: Enemy, scale = 1): HitBreakdown {
  const s = profile.stats;
  const phys = profile.damage === "physical";
  const atk = (phys ? s.patk : s.matk) * scale;
  const ratk = (phys ? s.refinePatk : s.refineMatk) * scale;
  const def = phys ? enemy.pdef : enemy.mdef;
  const base = baseHurt(atk, def, s.pen, ratk, 0);
  // InnerCommonIncreased (F12): DMG Boost + boss or minion DMG UP; the element boost is per damage type.
  const common = s.dmgBoost + (enemy.boss ? s.bossUp : s.minionUp);
  const typed = phys ? s.physBoost : s.magicBoost;
  const incNormal = s.normalAtkBoost + common + typed;
  const incSkill = s.skillBoost + common + typed;
  const red = enemy.dmgRed;
  const innerNormal = condDmgMod(0.2, 3.0, 0.15, incNormal, red);
  const innerSkill = condDmgMod(0.2, 3.0, 0.15, incSkill, red);
  const final = condDmgMod(0.4, 1.0, 0.15, s.finalDmgBoost, enemy.finalRed);
  return {
    base,
    innerNormal,
    innerSkill,
    final,
    normal: base * innerNormal * final,
    skill: base * innerSkill * final,
    incNormal,
    incSkill,
    red,
  };
}

/** Average hit used for the clear model: half normal attacks, half skills. */
export function meanHit(profile: Profile, enemy: Enemy, scale = 1): number {
  const h = hit(profile, enemy, scale);
  return (h.normal + h.skill) / 2;
}
