// Power (battle rating), as the game computes it.
// Source: Cross.dll, Cross.Fight.HeroBattleRateCounter.Calculate with the fight_battle_rate table:
// power = layer1 * (1 + layer2) * (1 + layer3); each layer sums (attr - base) * weight for the class spec.
import type { BattleRateRow } from "./types";
import type { Stats } from "./profile";

/** fight_battle_rate attribute id -> the stat on the Attribute Details screen. */
export const POWER_ATTRS: Record<number, { stat: keyof Stats | "skillPower"; label: string }> = {
  1100: { stat: "patk", label: "PATK" },
  1200: { stat: "matk", label: "MATK" },
  1300: { stat: "pdef", label: "PDEF" },
  1400: { stat: "mdef", label: "MDEF" },
  1500: { stat: "hp", label: "Max HP" },
  12200: { stat: "refinePatk", label: "Refine PATK" },
  12300: { stat: "refinePdef", label: "Refine PDEF" },
  12400: { stat: "refineMatk", label: "Refine MATK" },
  12500: { stat: "refineMdef", label: "Refine MDEF" },
  10110: { stat: "atkFreq", label: "ATK Freq" },
  10200: { stat: "haste", label: "Haste" },
  10300: { stat: "crit", label: "CRIT" },
  14100: { stat: "skillCrit", label: "Skill CRIT" },
  10400: { stat: "critDmg", label: "CRIT DMG" },
  10600: { stat: "pen", label: "PEN" },
  10601: { stat: "penRes", label: "PEN Resistance" },
  10700: { stat: "hit", label: "HIT" },
  10800: { stat: "flee", label: "FLEE" },
  11000: { stat: "critShield", label: "CRIT DMG Resistance" },
  11500: { stat: "normalAtkBoost", label: "Normal Attack DMG Boost" },
  11600: { stat: "skillBoost", label: "Skill DMG Boost" },
  11610: { stat: "physBoost", label: "Physical DMG Boost" },
  11620: { stat: "magicBoost", label: "Magic DMG Boost" },
  11700: { stat: "dmgBoost", label: "DMG Boost" },
  11800: { stat: "dmgRed", label: "DMG RED" },
  11900: { stat: "finalDmgBoost", label: "Final DMG Boost" },
  12000: { stat: "finalDmgRed", label: "Final DMG Reduction" },
  14400: { stat: "minionUp", label: "Normal Monster DMG UP" },
  14500: { stat: "minionRed", label: "Normal Monster DMG RED" },
  14600: { stat: "bossUp", label: "Boss DMG UP" },
  14700: { stat: "bossRed", label: "Boss DMG RED" },
  81000: { stat: "skillPower", label: "Skill levels" },
};

export interface PowerTerm {
  attr: number;
  label: string;
  layer: number;
  value: number;
  weight: number;
  contribution: number;
}

export interface PowerResult {
  layers: Record<number, number>;
  terms: PowerTerm[];
  power: number;
}

/** Power from stats. `skillPower` is the hidden skill-level term (attribute 81000, SkillBRNum). */
export function computePower(
  rows: BattleRateRow[],
  spec: number,
  stats: Stats,
  skillPower = 0,
): PowerResult {
  const layers: Record<number, number> = {};
  const terms: PowerTerm[] = [];
  for (const r of rows) {
    if (r.layer <= 0) continue;
    const m = POWER_ATTRS[r.attr];
    const value = m ? (m.stat === "skillPower" ? skillPower : stats[m.stat]) : 0;
    const weight = r.weights[String(spec)] ?? 0;
    const contribution = (value - r.base) * weight;
    layers[r.layer] = (layers[r.layer] ?? 0) + contribution;
    terms.push({
      attr: r.attr,
      label: m?.label ?? String(r.attr),
      layer: r.layer,
      value,
      weight,
      contribution,
    });
  }
  let power = layers[1] ?? 0;
  for (const l of Object.keys(layers)
    .map(Number)
    .sort((a, b) => a - b)) {
    if (l > 1) power *= 1 + layers[l];
  }
  return { layers, terms, power };
}

/** The skill-level term that makes computePower match the power shown in game. */
export function solveSkillPower(
  rows: BattleRateRow[],
  spec: number,
  stats: Stats,
  shown: number,
): number {
  const w = rows.find((r) => r.attr === 81000)?.weights[String(spec)] ?? 0;
  if (!w || !shown) return 0;
  const without = computePower(rows, spec, stats, 0);
  const l1 = without.layers[1] ?? 0;
  const l3 = 1 + (without.layers[3] ?? 0);
  if (!l1) return 0;
  // shown = l1 * (1 + l2 + w * s) * l3
  const l2 = without.layers[2] ?? 0;
  return Math.max(0, (shown / (l1 * l3) - 1 - l2) / w);
}
