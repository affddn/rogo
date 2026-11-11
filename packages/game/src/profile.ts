import type { Allocation } from "./attributes";

/** A character's stats as the game shows them (Overview > Attribute > ⓘ Attribute Details).
 * Percentages are stored as fractions: 17.1% -> 0.171. CRIT, HIT and FLEE are raw points. */
export interface Stats {
  patk: number;
  matk: number;
  pdef: number;
  mdef: number;
  hp: number;
  atkFreq: number;
  haste: number;
  crit: number;
  skillCrit: number;
  critDmg: number;
  critShield: number;
  hit: number;
  flee: number;
  pen: number;
  penRes: number;
  dmgBoost: number;
  dmgRed: number;
  normalAtkBoost: number;
  skillBoost: number;
  physBoost: number;
  magicBoost: number;
  minionUp: number;
  minionRed: number;
  bossUp: number;
  bossRed: number;
  finalDmgBoost: number;
  finalDmgRed: number;
  refinePatk: number;
  refinePdef: number;
  refineMatk: number;
  refineMdef: number;
  /** PATK/MATK % lines from gear (weapon, cards, Collection Gear): the rest of the additive % pool that
   * STR/DEX/INT add to. Not on the stat screen; 0 means unknown. Weapons alone give +14% to +6000%. */
  gearAtkPct: number;
}

/** Where a character is in the campaign. Either field calibrates the stage model; the fight is more precise. */
export interface Progress {
  /** furthest campaign stage cleared, "chapter-stage" like "6-9"; "" when not given */
  cleared: string;
  /** a stage you lost recently, and the share of its enemy HP you got through (1 = cleared just in time) */
  stuck: { stage: string; done: number } | null;
}

export interface Profile {
  id: string;
  name: string;
  /** career spec id (see classes.ts) */
  spec: number;
  /** base level; sets how many attribute points you have */
  level: number;
  power: number;
  /** "physical" uses PATK against PDEF, "magic" uses MATK against MDEF; follows the class */
  damage: "physical" | "magic";
  /** "entered": typed from Attribute Details. "estimated": the example's stats scaled to this power. */
  statsSource: "entered" | "estimated";
  stats: Stats;
  /** primary stats from the Attribute page: base = "All" minus "Total Allocated" */
  attributes: Allocation;
  /** share of your damage from normal attacks (the rest from skills); used by the stat-point planner */
  normalShare: number;
  progress: Progress;
  /** cards the player owns: card id -> star level (absent = not owned) */
  cards: Record<string, number>;
  /** learned skill levels: fight skill id -> level (absent = not learned) */
  skills: Record<string, number>;
}

export const STAT_FIELDS: {
  key: keyof Stats;
  label: string;
  unit: "flat" | "pct" | "pts" | "x";
  group: "basic" | "advanced" | "boost" | "final" | "refine" | "gear";
}[] = [
  { key: "patk", label: "PATK", unit: "flat", group: "basic" },
  { key: "matk", label: "MATK", unit: "flat", group: "basic" },
  { key: "pdef", label: "PDEF", unit: "flat", group: "basic" },
  { key: "mdef", label: "MDEF", unit: "flat", group: "basic" },
  { key: "hp", label: "Max HP", unit: "flat", group: "basic" },
  { key: "atkFreq", label: "ATK Freq", unit: "x", group: "advanced" },
  { key: "haste", label: "Haste", unit: "pct", group: "advanced" },
  { key: "crit", label: "CRIT", unit: "pts", group: "advanced" },
  { key: "skillCrit", label: "Skill CRIT", unit: "pts", group: "advanced" },
  { key: "critDmg", label: "CRIT DMG", unit: "pct", group: "advanced" },
  { key: "critShield", label: "CRIT DMG Resistance", unit: "pct", group: "advanced" },
  { key: "hit", label: "HIT", unit: "pts", group: "advanced" },
  { key: "flee", label: "FLEE", unit: "pts", group: "advanced" },
  { key: "pen", label: "PEN", unit: "pct", group: "advanced" },
  { key: "penRes", label: "PEN Resistance", unit: "pct", group: "advanced" },
  { key: "dmgBoost", label: "DMG Boost", unit: "pct", group: "boost" },
  { key: "dmgRed", label: "DMG RED", unit: "pct", group: "boost" },
  { key: "normalAtkBoost", label: "Normal Attack DMG Boost", unit: "pct", group: "boost" },
  { key: "skillBoost", label: "Skill DMG Boost", unit: "pct", group: "boost" },
  { key: "physBoost", label: "Physical DMG Boost", unit: "pct", group: "boost" },
  { key: "magicBoost", label: "Magic DMG Boost", unit: "pct", group: "boost" },
  { key: "minionUp", label: "Normal Monster DMG UP", unit: "pct", group: "boost" },
  { key: "minionRed", label: "Normal Monster DMG RED", unit: "pct", group: "boost" },
  { key: "bossUp", label: "Boss DMG UP", unit: "pct", group: "boost" },
  { key: "bossRed", label: "Boss DMG RED", unit: "pct", group: "boost" },
  { key: "finalDmgBoost", label: "Final DMG Boost", unit: "pct", group: "final" },
  { key: "finalDmgRed", label: "Final DMG Reduction", unit: "pct", group: "final" },
  { key: "refinePatk", label: "Refine PATK", unit: "flat", group: "refine" },
  { key: "refinePdef", label: "Refine PDEF", unit: "flat", group: "refine" },
  { key: "refineMatk", label: "Refine MATK", unit: "flat", group: "refine" },
  { key: "refineMdef", label: "Refine MDEF", unit: "flat", group: "refine" },
  { key: "gearAtkPct", label: "ATK % from weapon and gear", unit: "pct", group: "gear" },
];
