// Cards: what an inserted card does to your stats and to a stage fight.
// Data: card_info + card_upgrade (equipedAttr per star = inserted bonus, inventoryAttr = owned bonus,
// EquipedBrand = proc effects), exported by scripts/export_cards.py.
import {
  applyTotals,
  derive,
  stageTime,
  totals,
  type Allocation,
  type AttrTransfer,
  type Primary,
} from "./attributes";
import { computePower, solveSkillPower } from "./power";
import type { Profile, Stats } from "./profile";
import type { BattleRateRow, Stage } from "./types";

export interface CardStar {
  star: number;
  dupCost: number;
  /** "<attr id>:<KeyEn>" -> value, while inserted */
  equip: Record<string, number>;
  brand: { id: number; text: string } | null;
  /** owned bonus, counts once the card is activated */
  inv: Record<string, number>;
}

export interface Card {
  id: number;
  name: string;
  quality: number;
  slot: number;
  slotName: string;
  mvp: number;
  maxStar: number;
  stars: CardStar[];
}

/** How each attribute id a card can carry is shown, and which stat it moves. */
export const CARD_ATTRS: Record<
  number,
  { label: string; pct: boolean; stat?: keyof Stats; primary?: Primary }
> = {
  1011: { label: "STR", pct: false, primary: "str" },
  1021: { label: "AGI", pct: false, primary: "agi" },
  1031: { label: "VIT", pct: false, primary: "vit" },
  1041: { label: "INT", pct: false, primary: "int" },
  1051: { label: "DEX", pct: false, primary: "dex" },
  1061: { label: "LUK", pct: false, primary: "luk" },
  1101: { label: "PATK", pct: false },
  1102: { label: "PATK", pct: true },
  1201: { label: "MATK", pct: false },
  1202: { label: "MATK", pct: true },
  1301: { label: "PDEF", pct: false, stat: "pdef" },
  1302: { label: "PDEF", pct: true },
  1401: { label: "MDEF", pct: false, stat: "mdef" },
  1402: { label: "MDEF", pct: true },
  1501: { label: "Max HP", pct: false, stat: "hp" },
  1502: { label: "Max HP", pct: true },
  10102: { label: "Aspd", pct: true },
  10201: { label: "Haste", pct: true, stat: "haste" },
  10301: { label: "CRIT", pct: false, stat: "crit" },
  10401: { label: "CRIT DMG", pct: true, stat: "critDmg" },
  10701: { label: "HIT", pct: false, stat: "hit" },
  10801: { label: "FLEE", pct: false, stat: "flee" },
  11000: { label: "CRIT DMG Resistance", pct: true, stat: "critShield" },
  11300: { label: "PvP DMG Boost", pct: true },
  11400: { label: "PvP DMG RED", pct: true },
  11501: { label: "Normal Attack DMG Boost", pct: true, stat: "normalAtkBoost" },
  11601: { label: "Skill DMG Boost", pct: true, stat: "skillBoost" },
  11611: { label: "Physical DMG Boost", pct: true, stat: "physBoost" },
  11621: { label: "Magic DMG Boost", pct: true, stat: "magicBoost" },
  11701: { label: "DMG Boost", pct: true, stat: "dmgBoost" },
  11801: { label: "DMG RED", pct: true, stat: "dmgRed" },
  14101: { label: "Skill CRIT", pct: false, stat: "skillCrit" },
  14400: { label: "Normal Monster DMG UP", pct: true, stat: "minionUp" },
  14500: { label: "Normal Monster DMG RED", pct: true, stat: "minionRed" },
  14600: { label: "Boss DMG UP", pct: true, stat: "bossUp" },
  14700: { label: "Boss DMG RED", pct: true, stat: "bossRed" },
  14710: { label: "Normal Attack DMG RED", pct: true },
  14720: { label: "Skill DMG RED", pct: true },
  81000: { label: "Power from skills", pct: false },
};

export const attrId = (key: string) => Number(key.split(":")[0]);

export function describe(attrs: Record<string, number>): string[] {
  return Object.entries(attrs)
    .filter(([k]) => attrId(k) !== 81000)
    .map(([k, v]) => {
      const a = CARD_ATTRS[attrId(k)];
      const label = a?.label ?? k.split(":")[1] ?? k;
      return a?.pct ? `${label} +${+(v * 100).toFixed(2)}%` : `${label} +${+v.toFixed(2)}`;
    });
}

/** Stats with a set of card attributes added, holding everything else constant. */
export function withAttrs(
  t: AttrTransfer,
  profile: Profile,
  cur: Allocation,
  attrs: Record<string, number>,
): Stats {
  // +N STR/AGI/... from a card adds to the stat total without spending points
  const from = totals(cur);
  const to = { ...from };
  for (const [k, v] of Object.entries(attrs)) {
    const p = CARD_ATTRS[attrId(k)]?.primary;
    if (p) to[p] += v;
  }
  const s = applyTotals(t, profile, from, to, 0);
  const d = derive(t, profile.spec, to);
  const o = profile.stats.gearAtkPct ?? 0;
  const patkMul = (1 + o + d.patkL2) * (1 + d.patkL6);
  const matkMul = (1 + o + d.matkL2) * (1 + d.matkL6);
  for (const [k, v] of Object.entries(attrs)) {
    const id = attrId(k);
    const a = CARD_ATTRS[id];
    if (id === 1101) s.patk += v * patkMul;
    else if (id === 1201) s.matk += v * matkMul;
    else if (id === 1102) {
      // a PATK % card joins the same layer as the STR/DEX bonus, and also scales refine PATK
      const r = (1 + o + d.patkL2 + v) / (1 + o + d.patkL2);
      s.patk *= r;
      s.refinePatk *= r;
    } else if (id === 1202) {
      const r = (1 + o + d.matkL2 + v) / (1 + o + d.matkL2);
      s.matk *= r;
      s.refineMatk *= r;
    } else if (id === 1502) s.hp *= (1 + d.hpL2 + v) / (1 + d.hpL2);
    else if (id === 1302) s.pdef *= 1 + v;
    else if (id === 1402) s.mdef *= 1 + v;
    else if (id === 10102) {
      // Aspd% closes part of the gap to 200: solve the current gap and shrink it
      const aspd = 200 - 50 / s.atkFreq;
      const a0 = 150 + d.aspdAdd;
      const keep = (200 - aspd) / Math.max(1e-6, 200 - a0);
      const next = Math.min(193, 200 - (200 - a0) * Math.max(0, keep - v));
      s.atkFreq = Math.min(7, 50 / (200 - next));
    } else if (a?.stat) s[a.stat] += v;
  }
  return s;
}

export interface CardResult {
  card: Card;
  star: CardStar;
  damageGain: number;
  powerGain: number;
}

export function rankCards(
  t: AttrTransfer,
  rows: BattleRateRow[],
  profile: Profile,
  stage: Stage,
  cards: Card[],
  pickStar: (c: Card) => number,
): CardResult[] {
  const cur = profile.attributes;
  const time0 = stageTime(profile, stage, profile.normalShare);
  const skillPower = solveSkillPower(rows, profile.spec, profile.stats, profile.power);
  const p0 = computePower(rows, profile.spec, profile.stats, skillPower).power;
  return cards
    .map((card) => {
      const star = card.stars.find((s) => s.star === pickStar(card)) ?? card.stars[0];
      const stats = withAttrs(t, profile, cur, star.equip);
      const time = stageTime({ ...profile, stats }, stage, profile.normalShare);
      const extraSkill = Object.entries(star.equip).reduce(
        (a, [k, v]) => (attrId(k) === 81000 ? a + v : a),
        0,
      );
      const p1 = computePower(rows, profile.spec, stats, skillPower + extraSkill).power;
      return { card, star, damageGain: time0 / time - 1, powerGain: p0 ? p1 / p0 - 1 : 0 };
    })
    .sort((a, b) => b.damageGain - a.damageGain || b.powerGain - a.powerGain);
}
