// Attribute points: what STR/AGI/VIT/INT/DEX/LUK do, and how to spend them.
// Sources (decompiled Cross.dll / GameLogic.dll and tables):
// - fight_attr_transfer: total derived bonus for each primary-stat value; linear except AGI -> Aspd.
// - Point cost: floor(already allocated / 5) + 1 (HeroPointCell, BASE_POINT_COST = 5).
// - Every spent point also adds +2 PATK, +2 MATK, +1 PDEF, +1 MDEF, +20 HP, +2 SP (AddL1 layers).
// - Aspd = min(193, 200 - (200 - (150 + AGI curve)) * (1 - Aspd%)); ATK Freq = min(7, 50 / (200 - Aspd)).
// - Crit chance = (CRIT - target CRIT RES) / 100; a crit deals x max(1, CRIT DMG - target resistance).
// - Miss chance = (FLEE - HIT) / (FLEE - HIT + 1000) when the target's FLEE is above your HIT.
import { hit as hitOn } from "./damage";
import type { Profile, Stats } from "./profile";
import type { Enemy, Stage } from "./types";

export const PRIMARY = ["str", "agi", "vit", "int", "dex", "luk"] as const;
export type Primary = (typeof PRIMARY)[number];
export type Six = Record<Primary, number>;

export const PRIMARY_LABEL: Record<Primary, string> = {
  str: "STR",
  agi: "AGI",
  vit: "VIT",
  int: "INT",
  dex: "DEX",
  luk: "LUK",
};

export interface AttrTransfer {
  rates: Record<string, Partial<Record<Primary, Record<string, number>>>>;
  aspdCurve: number[];
  pointsByLevel: Record<string, number>;
}

/** Cost units to put n points into one stat. */
export function pointCost(n: number): number {
  const q = Math.floor(n / 5);
  const r = n % 5;
  return (5 * q * (q + 1)) / 2 + r * (q + 1);
}

export const nextPointCost = (n: number) => Math.floor(n / 5) + 1;

export const spentCost = (alloc: Six) => PRIMARY.reduce((a, k) => a + pointCost(alloc[k]), 0);

export interface Derived {
  patkL2: number;
  patkL6: number;
  matkL2: number;
  matkL6: number;
  hpL2: number;
  aspdAdd: number;
  flee: number;
  hit: number;
  haste: number;
  crit: number;
  skillCrit: number;
  dmgRed: number;
}

/** Bonuses from primary-stat totals (base + allocated), for one spec. */
export function derive(t: AttrTransfer, spec: number, totals: Six): Derived {
  const r = t.rates[String(spec)] ?? {};
  const v = (stat: Primary, attr: number) =>
    (r[stat]?.[String(attr)] ?? 0) * Math.min(400, totals[stat]);
  return {
    patkL2: v("str", 1103) + v("dex", 1104),
    patkL6: v("str", 1109) + v("dex", 1110),
    matkL2: v("int", 1203),
    matkL6: v("int", 1208),
    hpL2: v("vit", 1503),
    aspdAdd: t.aspdCurve[Math.min(400, Math.max(0, Math.round(totals.agi)))] ?? 0,
    flee: v("agi", 10802),
    hit: v("dex", 10702),
    haste: v("dex", 10202),
    crit: v("luk", 10302),
    skillCrit: v("luk", 14102),
    dmgRed: v("vit", 11802),
  };
}

export interface Allocation {
  /** career base values: the "All" column minus "Total Allocated" on the Attribute page */
  base: Six;
  /** allocated points per stat */
  alloc: Six;
  /** unspent attribute points */
  free: number;
}

const add = (a: Six, b: Six): Six =>
  Object.fromEntries(PRIMARY.map((k) => [k, a[k] + b[k]])) as Six;

/** Stats after the primary-stat totals change from `from` to `to`, holding gear constant.
 * `spent` is the change in spent cost units, which carries the flat per-point bonus. */
export function applyTotals(
  t: AttrTransfer,
  profile: Profile,
  from: Six,
  to: Six,
  spent: number,
): Stats {
  const s = profile.stats;
  const d0 = derive(t, profile.spec, from);
  const d1 = derive(t, profile.spec, to);
  // the % pool STR/DEX/INT add to also holds the weapon and gear % lines
  const o = s.gearAtkPct ?? 0;
  const m2 = (1 + o + d1.patkL2) / (1 + o + d0.patkL2);
  const m6 = (1 + d1.patkL6) / (1 + d0.patkL6);
  const n2 = (1 + o + d1.matkL2) / (1 + o + d0.matkL2);
  const n6 = (1 + d1.matkL6) / (1 + d0.matkL6);
  // Aspd%: solved from the shown ATK Freq and the current AGI part
  const a0 = 150 + d0.aspdAdd;
  const aspd0 = 200 - 50 / Math.max(1e-6, s.atkFreq);
  const keep = Math.min(1, Math.max(0, (200 - aspd0) / Math.max(1e-6, 200 - a0)));
  const aspd1 = Math.min(193, 200 - (200 - (150 + d1.aspdAdd)) * keep);
  return {
    ...s,
    patk: s.patk * m2 * m6 + 2 * spent * (1 + o + d1.patkL2) * (1 + d1.patkL6),
    refinePatk: s.refinePatk * m2 * m6,
    matk: s.matk * n2 * n6 + 2 * spent * (1 + o + d1.matkL2) * (1 + d1.matkL6),
    refineMatk: s.refineMatk * n2 * n6,
    pdef: s.pdef + spent,
    mdef: s.mdef + spent,
    hp: (s.hp * (1 + d1.hpL2)) / (1 + d0.hpL2) + 20 * spent,
    atkFreq: Math.min(7, 50 / (200 - aspd1)),
    flee: s.flee + d1.flee - d0.flee,
    hit: s.hit + d1.hit - d0.hit,
    haste: Math.min(1, s.haste + d1.haste - d0.haste),
    crit: Math.min(100, Math.max(1, s.crit + d1.crit - d0.crit)),
    skillCrit: Math.min(100, Math.max(1, s.skillCrit + d1.skillCrit - d0.skillCrit)),
    dmgRed: s.dmgRed + d1.dmgRed - d0.dmgRed,
  };
}

export const totals = (a: Allocation, alloc: Six = a.alloc) => add(a.base, alloc);

/** Stats after moving from the current allocation to `next`. */
export function applyAllocation(
  t: AttrTransfer,
  profile: Profile,
  cur: Allocation,
  next: Six,
): Stats {
  return applyTotals(
    t,
    profile,
    totals(cur),
    totals(cur, next),
    spentCost(next) - spentCost(cur.alloc),
  );
}

/** Expected damage per second against one enemy, up to a constant: hit size x hits per second x crit x accuracy.
 * `normalShare` is the share of your damage that comes from normal attacks (the rest from skills). */
export function dpsOn(profile: Profile, e: Enemy, normalShare: number): number {
  const s = profile.stats;
  const h = hitOn(profile, e);
  const critN = 1 + Math.min(1, Math.max(0, s.crit / 100)) * Math.max(0, s.critDmg - 1);
  const critS = 1 + Math.min(1, Math.max(0, s.skillCrit / 100)) * Math.max(0, s.critDmg - 1);
  const gap = e.flee - s.hit;
  const accuracy = gap > 0 ? 1 - gap / (gap + 1000) : 1;
  return (
    accuracy *
    (normalShare * h.normal * s.atkFreq * critN +
      (1 - normalShare) * h.skill * (1 + s.haste) * critS)
  );
}

/** Seconds of fighting a stage takes, up to a constant. */
export function stageTime(profile: Profile, stage: Stage, normalShare: number): number {
  return stage.enemies.reduce((t, e) => t + (e.count * e.hp) / dpsOn(profile, e, normalShare), 0);
}

export interface Plan {
  alloc: Six;
  stats: Stats;
  gain: number;
}

/** Greedy best allocation for a stage: buy the point with the most time saved per cost unit, until the budget runs out.
 * VIT and INT only matter for survival or magic, so they are skipped unless the build deals magic damage. */
export function optimize(
  t: AttrTransfer,
  profile: Profile,
  cur: Allocation,
  stage: Stage,
  normalShare: number,
): Plan {
  const budget = spentCost(cur.alloc) + cur.free;
  const stats0 = applyAllocation(t, profile, cur, cur.alloc);
  const time0 = stageTime({ ...profile, stats: stats0 }, stage, normalShare);
  const pool: Primary[] =
    profile.damage === "magic" ? ["int", "agi", "dex", "luk"] : ["str", "agi", "dex", "luk"];
  const alloc: Six = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
  let left = budget;
  let time = stageTime(
    { ...profile, stats: applyAllocation(t, profile, cur, alloc) },
    stage,
    normalShare,
  );
  for (let guard = 0; guard < 2000; guard++) {
    let best: Primary | null = null;
    let bestValue = 0;
    let bestTime = time;
    for (const k of pool) {
      const cost = nextPointCost(alloc[k]);
      if (cost > left || cur.base[k] + alloc[k] >= 400) continue;
      // look a few points ahead so curves with flat spots (AGI) don't stall the search
      const step = 5;
      const trial = { ...alloc, [k]: alloc[k] + step };
      const tTime = stageTime(
        { ...profile, stats: applyAllocation(t, profile, cur, trial) },
        stage,
        normalShare,
      );
      const value = (time - tTime) / (pointCost(alloc[k] + step) - pointCost(alloc[k]));
      if (value > bestValue) {
        bestValue = value;
        best = k;
        const one = { ...alloc, [k]: alloc[k] + 1 };
        bestTime = stageTime(
          { ...profile, stats: applyAllocation(t, profile, cur, one) },
          stage,
          normalShare,
        );
      }
    }
    if (!best) break;
    left -= nextPointCost(alloc[best]);
    alloc[best] += 1;
    time = bestTime;
  }
  const stats = applyAllocation(t, profile, cur, alloc);
  return { alloc, stats, gain: time0 / stageTime({ ...profile, stats }, stage, normalShare) - 1 };
}

/** The game's Recommended Allocation: fill toward career_spec.recommendRefRatio. */
export function recommended(ratio: number[], budget: number): Six {
  const alloc: Six = { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 };
  const used = PRIMARY.map((k, i) => ({ k, r: ratio[i] })).filter((x) => x.r > 0);
  if (!used.length) return alloc;
  const baseStat = used.find((x) => x.r === 1) ?? used.reduce((a, b) => (b.r < a.r ? b : a));
  let left = budget;
  for (let guard = 0; guard < 5000; guard++) {
    const baseAlloc = Math.max(1, alloc[baseStat.k]);
    const pick = used
      .filter((x) => nextPointCost(alloc[x.k]) <= left)
      .map((x) => ({ ...x, deficit: x.r / baseStat.r - alloc[x.k] / baseAlloc }))
      .sort((a, b) => b.deficit - a.deficit)[0];
    if (!pick) break;
    left -= nextPointCost(alloc[pick.k]);
    alloc[pick.k] += 1;
  }
  return alloc;
}
