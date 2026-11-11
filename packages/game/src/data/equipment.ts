// Equipment: items, enhance, refine, resonance, enchant, Elite Summon (equipment summon) and dungeon accessory drops.
// Data: public/data/equipment.json, written by scripts/export_equipment.py from the SEA 0.0.163 client tables.
//
// Evidence tags used below:
//   [code]     read in the decompiled client (GameLogic.dll / Cross.dll); file named where it matters
//   [data]     read from table rows or in-game text
//   [inferred] my conclusion; the server code that does it is not in the client
//
// What a worn piece gives, per slot (part 1..8). Enhance, refine and enchant belong to the SLOT, not the item:
// they stay when you swap items [code] EquipSlotInfoData, [data] rule text "enhancement level is inherited".
//
//   item (bound to the item; scales with item level L and the slot's refine R):
//     base_i   = (n_i + roll_i) * levelNum^L * (1 + refine[R].base)        roll_i in [-r_i, +r_i]
//     random_j = v_j * (1 + refine[R].random)                               no level scaling
//     cond_k   = tier value of refine condition k at R (see refineCondValue)
//   slot:
//     enhance[E] flats (row values are totals)  +  refine[R] flats into refine ATK/DEF (row values are totals)
//     + enchant lines of the active preset (two pools, 3 lines each)
//   account-wide:
//     Enhance Resonate row at the claimed level + Refine Resonance row at the claimed level
//
// Refine/enhance/enchant need an item in the slot to be performed [code] EquipRefinePanel/EquipEnhancePanel.
// Whether slot enhance/refine flats still count while the slot is empty is unknown.
// The sum lands in the hero's attr ids; layers (AddL1 x MulL2 ...) are applied by the attrs model, not here.

/** "<attr id>:<KeyEn>", e.g. "1101:BasePAtkAddL1". Parse the id with keyId(); layer is in the name. */
export type AttrKey = string;
export type Attrs = Record<AttrKey, number>;
/** [item id, amount]; names in EquipmentData.materials. */
export type ItemAmount = [itemId: number, num: number];
/** [quality, weight, probability = weight / total of the list]. */
export type Odds = [quality: number, weight: number, p: number];

export interface EquipmentData {
  source: string;
  builds: EquipBuild[];
  parts: EquipPart[];
  showQualities: ShowQuality[];
  /** 61 entries, index = quality - 1. */
  qualities: EquipQuality[];
  /** Every item id referenced in this file (costs, protection, dismantle). Keyed by id. */
  materials: Record<string, { name: string; desc: string }>;
  items: ItemTables;
  enhance: EnhanceData;
  refine: RefineData;
  enhanceResonance: EnhanceResonanceRow[];
  refineResonance: RefineResonanceRow[];
  enchant: EnchantData;
  summon: SummonData;
  accessoryDrops: AccessoryDrop[];
}

/** Career build (= career spec id): 11 Novice, 21 Agi Sword, 22 Spear Knight, 31 Fire Mage, 32 Ice Mage,
 *  41 Falcon Hunter, 42 Shoot Hunter, 51 Crit Pierce. */
export interface EquipBuild {
  id: number;
  name: string;
  /** career_spec.AttrTag: 1 physical, 2 magic; null when the build has no career_spec row. */
  attrTag: number | null;
  /** false = equipment rows exist but the build is not in career_spec (Shoot Hunter 42 is unreleased). [data] */
  released: boolean;
}

export interface EquipPart {
  /** 1 Armor, 2 Cape, 3 Belt, 4 Gloves, 5 Leg Guards, 6 Shoes, 7 Necklace, 8 Ring. Slot pos == part id. */
  id: number;
  name: string;
  /** 1 armor (from Elite Summon), 2 accessory (from dungeons) [data] equip_part_info, rule text func_rule_600. */
  category: number;
  categoryName: string;
  unlockBaseLevel: number;
  /** Slot unlocks at this Elite Summon level (Gloves: 3). [data] */
  unlockSummonLevel: number;
}

/** Display grade 1..10 (Normal .. Eternal). Colours are UIColor constants [code]; two entries = gradient. */
export interface ShowQuality {
  id: number;
  name: string;
  /** Text colour on light panels (DARK_QUALITY_<id>). */
  dark: string[];
  /** Text colour on dark panels (LIGHT_QUALITY_<id>). */
  light: string[];
}

export interface EquipQuality {
  /** Internal quality 1..61 (what drop tables and equip_info use). */
  id: number;
  /** Display grade id (ShowQuality). */
  show: number;
  /** Sub-grade, "I".."X". */
  sub: string;
  /** e.g. "Mythic VI". */
  name: string;
  /** Number of random attrs an item of this quality has (0/1/2). [data] */
  randomAttrs: number;
  /** Max refine conditions (0/1/2); the tables give at most 1 per item, so effectively 0/1. [data] */
  refineAttrs: number;
  /** Items returned when dismantling (Echo Core). [data] */
  dismantle: ItemAmount[];
  autoDismantleSummonLevel: number;
}

/** A refine condition on an item: tier bonus by the slot's refine level. */
export interface RefineCond {
  attr: AttrKey;
  /** Refine-level thresholds, ascending (zero entries of conditionArg are dropped). */
  at: number[];
  /** Value for each threshold. */
  v: number[];
  /** Present only when not 2 (tier). 1 = floor(R / at[0]) * v[0]. No such rows in 0.0.163. */
  type?: number;
}

export interface ItemTables {
  /** Base attr keys, same 5 for every item: PATK, MATK, PDEF, MDEF, HP flats (AddL1). [data] */
  attrs: AttrKey[];
  /** Per-level growth factor of base attrs, 1.004 for every row. [data] Client keeps it as float32
   *  (1.0039999485): at item level 1000 that is 0.005% lower. Ignore. */
  levelNum: number;
  /** names[part][show - 1]: item name by part and display grade (same for every build). [data] */
  names: Record<string, string[]>;
  /** base[part][quality - 1] = [n[], r[]]: base value and roll half-width per attr (range is [-r, +r]).
   *  Identical for every build. [data] */
  base: Record<string, [n: number[], r: number[]][]>;
  /** random[build][part][quality - 1] = attrs. Deterministic: each (build, part, quality) has exactly
   *  RandomAttrCount rows; the client sorts by fight_attr.SortOrder then Entry and takes that many. [code] DropCfg.
   *  Novice (11) has none. Values do not scale with item level (LevelNum = QualityNum = 1). [data] */
  random: Record<string, Record<string, Attrs[]>>;
  /** refineConds[build][part][quality - 1]: [] below quality 13 and for Novice. [data] */
  refineConds: Record<string, Record<string, RefineCond[][]>>;
  /** levelRange[baseLevel - 1] = [lo, hi, x]: item level of a new drop at that player base level.
   *  The client preview uses lo [code] DropCfg.ResolveEquipLevelFromPlayerBase; a uniform roll in [lo, hi] is
   *  [inferred]. x is not read by the client [unknown]. Whether dungeon accessories use this too is unknown. */
  levelRange: [lo: number, hi: number, x: number][];
}

/** One item as the UI wants it, assembled by getItem(). */
export interface EquipItem {
  build: number;
  part: number;
  quality: number;
  name: string;
  /** attr -> [base n, roll half-width r] */
  base: Record<AttrKey, [n: number, r: number]>;
  random: Attrs;
  refineConds: RefineCond[];
}

/** Enhance (slot). Deterministic: no fail, no blessing in this version (itemBaseRate/BlessLimit all 0). [data] */
export interface EnhanceData {
  maxLevel: number;
  /** PATK, MATK, PDEF, MDEF, HP flats (AddL1). */
  attrs: AttrKey[];
  tables: EnhanceTable[];
  /** part -> index into tables (all parts share table 0 in 0.0.163). */
  partTable: Record<string, number>;
}

export interface EnhanceTable {
  /** values[attrIndex][E] = TOTAL flat at enhance level E (not incremental). [data] Not multiplied by refine. [code] */
  values: number[][];
  costItem: number;
  /** cost[E] = items to go E -> E+1 (row E's CostNum; cost[max] = 0). [code] EquipEnhancePanel.SumEnhanceCostNum */
  cost: number[];
}

/** Refine (slot), levels 0..30. */
export interface RefineData {
  maxLevel: number;
  /** Refine PATK, Refine MATK, Refine PDEF, Refine MDEF flats (12201/12401/12301/12501 AddL1). */
  attrs: AttrKey[];
  tables: RefineTable[];
  partTable: Record<string, number>;
}

export interface RefineTable {
  /** levels[R]; R = 0..maxLevel. */
  levels: RefineLevel[];
}

/**
 * Row R describes BOTH the stats at +R and the attempt R -> R+1 ([code] EquipRefinePanel uses the current
 * level's row for rates and costs).
 *
 * Stats at +R:
 *   flat[i]  TOTAL refine ATK/DEF flat (refine.attrs order). Goes to refine attack/defence, which BasePHurt adds
 *            after the defence curve. [code] (the server adding it per slot is [inferred])
 *   base     item base attrs x (1 + base)   [code] EquipPowerCompare.ApplyEquipAttrsToMatrix
 *   random   item random attrs x (1 + random)   [code] same place
 *
 * Attempt at +R (Markov chain, one step):
 *   pay `cost` every attempt (Refine Meteorite). If `protect` is non-null the player may tick protection:
 *   pay `protect` too, consumed whether it succeeds or not [data] item 109 description.
 *   success -> R+1      p = success
 *   retain  -> R        p = retain          ("Refine failed, level unchanged")
 *   demote  -> R-1      p = demote          ("Refine failed, level reduced to +N") [data]; one level [inferred]
 *   With protection the demote outcome stays at R instead ("prevent downgrade on failure" [data]); success is
 *   unchanged [inferred] (AddRate is 0 on every row, no other rate field exists). success+retain+demote = 1.
 *   Protection is offered only when demote > 0 (rows 13..29) [code] EquipRefinePanel.IsProtectFeatureOn.
 *   Max row (30): rates 0, cost [].
 */
export interface RefineLevel {
  lv: number;
  flat: number[];
  base: number;
  random: number;
  success: number;
  retain: number;
  demote: number;
  cost: ItemAmount[];
  protect: ItemAmount | null;
}

/**
 * Account-wide "Enhance Resonate" (master level). Claim level L+1 when at least `parts` slots that hold an item
 * have enhance >= `enhance`; levels are claimed one at a time. [code] EnhanceMasterDialog/EquipEnhancePanel.
 * Only the claimed level's row applies; rows are totals (0.03 -> 0.06 -> 0.10 ...). [inferred]
 * Whether it switches off when you later fall below the requirement is unknown (no client code reverts it).
 */
export interface ResonanceRow {
  level: number;
  parts: number;
  /** MulL2 % ids (enhance) or refine ATK/DEF MulL4 % (+ Final PATK/MATK MulL6 at L5-6) ids (refine). */
  attrs: Attrs;
}
export interface EnhanceResonanceRow extends ResonanceRow {
  enhance: number;
}
/** "Refine Resonance": same rule with refine >= `refine`. [code] RefineMasterDialog/EquipRedDotHandler */
export interface RefineResonanceRow extends ResonanceRow {
  refine: number;
}

/**
 * Enchant (slot). Two pools per slot: category 1 unlocks at slot refine +3, category 2 at +12
 * ([code] EnchantCfg.GetUnlockRefineLevel, Variables ENCHANT1/2_UNLOCK_LEVEL). Each pool has its own enchant
 * level (2..6, starts at 2 [code]) and 3 lines. One enchant re-rolls every unlocked line and costs
 * lockCost[number of locked lines] of the pool's item (Star Powder / Wrath of Sea God) [code] EquipEnchantPanel.
 * Up to 2 lines can be locked, at least 1 must stay unlocked [data]. 1 material = 1 EXP [data] rule text;
 * at `upgradeExp` the pool levels up (row of the current level) [code]. Higher levels unlock higher qualities.
 *
 * Per line [code: what the client's odds dialog shows; the server doing the same is inferred]:
 *   quality q ~ qualityOdds[level]
 *   option  ~ weight among pools(part, category, q).options whose specs include your spec
 *   P(line = option) = P(q) * option.p
 * Pool totals are the same for every spec, so `p` is valid for any spec the option lists. [data]
 * Values are fixed (min == max) and added flat to the attr id [inferred].
 * Enchant state is stored per preset (up to 3); the account's ActiveEnchantScheme is the live one [code].
 * Novice (11) has no options.
 */
export interface EnchantData {
  unlockRefine: Record<string, number>;
  maxLocks: number;
  presets: number;
  /** Specs that appear in any option list. */
  specs: number[];
  /** Line quality names 1..6 (Normal..Mythic). Enchant level L is also shown with quality_txt_L. */
  qualityNames: Record<string, string>;
  levels: EnchantLevel[];
  qualityOdds: { level: number; odds: Odds[] }[];
  /** Deduplicated pools; look up with poolIndex. */
  pools: EnchantPool[];
  /** poolIndex[part][category][quality - 1] -> index into pools. */
  poolIndex: Record<string, Record<string, number[]>>;
}

export interface EnchantLevel {
  category: number;
  level: number;
  name: string;
  lines: number;
  /** EXP (= materials) to go from this level to the next; 0 at max. */
  upgradeExp: number;
  item: number;
  /** Cost of one enchant with 0 / 1 / 2 lines locked. */
  lockCost: number[];
}

export interface EnchantPool {
  /** Sum of weights any one spec sees. */
  total: number;
  /** Client order (SortOrder, Entry). */
  options: EnchantOption[];
}

export interface EnchantOption {
  attr: AttrKey;
  v: number;
  w: number;
  /** w / total: chance of this option given the line rolled this quality. */
  p: number;
  /** Only these specs can roll it; absent = every spec in EnchantData.specs. */
  specs?: number[];
  /** "Rare" tag in game (Final DMG / Final PATK-MATK-HP % / penetration lines). */
  rare?: 1;
  /** "New" tag (shown when the quality is new at the previewed enchant level). */
  new?: 1;
  /** Specs the game marks it "recommended" for. */
  rec?: number[];
  /** DecreaseWeight [[1, w1], [2, w2]] (~30% of w). Server-only. Probably the weight used when the same attr
   *  already sits on 1 / 2 other lines, i.e. duplicates are rarer [inferred]. Displayed odds ignore it. */
  dup?: [number, number][];
}

/**
 * Elite Summon ("equipment summon"): spend a Dead Branch to summon an elite; it drops armor.
 * Drop grade odds per summon level [data] (as shown in game: weight / total [code] EliteSummonLevelUpDialog).
 * At level L >= 5: L-3 ~55%, L-2 ~30%, L-1 ~10%, L ~5%, L+1 <1%, L+2 0.01%.
 * Level-up from L: fill `stages` bars at `perStage` Echo Core each (total stages*perStage)
 * [code] MonsterSummonBtn.HasEnoughMaterialsToFillStrongBar, then wait `seconds` (speed up with item 19,
 * 60 s each, or ads, 1800 s, 3 a day [code] Variables).
 * Which armor part drops, and what dropNum does, are server-side [unknown]; dropNum is not read by the client.
 */
export interface SummonData {
  costPerSummon: ItemAmount;
  /** Multi-drop options (x2/x4 cost and drops); unlocked by a monthly-card effect (multiDropEf). [code] */
  dropMultipliers: number[];
  speedup: { item: number; itemSeconds: number; adSeconds: number; adDaily: number };
  /** Elite Summon is blocked when the equipment bag is full. [data] */
  bagCapacity: number;
  levels: SummonLevel[];
}

export interface SummonLevel {
  level: number;
  /** null at max level. */
  levelUp: { stages: number; item: number; perStage: number; seconds: number } | null;
  dropNum: number;
  summonItem: ItemAmount;
  summonLimit: number;
  showColor: number;
  multiDropEf: number;
  odds: Odds[];
}

/** Necklace/Ring drop grade odds per dungeon (team PVE) stage. [code] TeamPveCfg + accessory_drop */
export interface AccessoryDrop {
  stage: number;
  name: string;
  unlockMainStage: number;
  odds: Odds[];
}

// ---------------------------------------------------------------- pure helpers

export const keyId = (k: AttrKey) => Number(k.split(":")[0]);

export function addAttrs(into: Attrs, from: Attrs, scale = 1): Attrs {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v * scale;
  return into;
}

export function itemName(eq: EquipmentData, part: number, quality: number): string {
  const show = eq.qualities[quality - 1]?.show ?? 0;
  return eq.items.names[part]?.[show - 1] ?? "";
}

/** The item for (build, part, quality), or null when there is no such row. */
export function getItem(
  eq: EquipmentData,
  build: number,
  part: number,
  quality: number,
): EquipItem | null {
  const b = eq.items.base[part]?.[quality - 1];
  if (!b) return null;
  const base: Record<AttrKey, [number, number]> = {};
  eq.items.attrs.forEach((k, i) => (base[k] = [b[0][i], b[1][i]]));
  return {
    build,
    part,
    quality,
    name: itemName(eq, part, quality),
    base,
    random: eq.items.random[build]?.[part]?.[quality - 1] ?? {},
    refineConds: eq.items.refineConds[build]?.[part]?.[quality - 1] ?? [],
  };
}

/** Item level range [lo, hi] of a new drop at a player base level. */
export function dropLevelRange(eq: EquipmentData, baseLevel: number): [number, number] {
  const r = eq.items.levelRange[Math.min(Math.max(baseLevel, 1), eq.items.levelRange.length) - 1];
  return [r[0], r[1]];
}

/**
 * Tier rule [code] EquipPowerCompare.CalcRefineAttr (Condition 2): value of the highest threshold <= R, not summed;
 * 0 below the first threshold. Type 1: floor(R / at[0]) * v[0].
 * Note: the client's own power preview reads conditionArg with its trailing zeros, so it always picks an index
 * past the value list and never counts conditions; the item tooltip lists them per threshold. The server rule is
 * [inferred] to be this tier reading of the tooltip ("Refine Level 5: DEX +2", "Refine Level 10: DEX +3").
 */
export function refineCondValue(c: RefineCond, refine: number): number {
  if (c.type === 1) return c.at[0] > 0 ? Math.floor(refine / c.at[0]) * c.v[0] : 0;
  let v = 0;
  c.at.forEach((a, i) => {
    if (a <= refine) v = c.v[i];
  });
  return v;
}

export function refineLevel(eq: EquipmentData, part: number, refine: number): RefineLevel {
  const t = eq.refine.tables[eq.refine.partTable[part] ?? 0];
  return t.levels[Math.min(Math.max(refine, 0), t.levels.length - 1)];
}

/**
 * Item-bound attrs at item level `level` in a slot refined to `refine`. [code] DropCfg + EquipPowerCompare
 * roll: position in the roll range, -1 = minimum (what the client preview shows), 0 = middle, +1 = maximum.
 * Real items already carry their rolled, level-scaled base values; this reproduces them from (n, r, L).
 */
export function itemAttrs(
  eq: EquipmentData,
  item: EquipItem,
  level: number,
  refine: number,
  roll = 0,
): Attrs {
  const ref = refineLevel(eq, item.part, refine);
  const scale = eq.items.levelNum ** level;
  const out: Attrs = {};
  for (const [k, [n, r]] of Object.entries(item.base))
    out[k] = (n + roll * r) * scale * (1 + ref.base);
  for (const [k, v] of Object.entries(item.random)) out[k] = (out[k] ?? 0) + v * (1 + ref.random);
  for (const c of item.refineConds) {
    const v = refineCondValue(c, refine);
    if (v) out[c.attr] = (out[c.attr] ?? 0) + v;
  }
  return out;
}

/** Slot-bound flats: enhance totals at `enhance` + refine ATK/DEF totals at `refine`. [data] totals per row */
export function slotAttrs(eq: EquipmentData, part: number, enhance: number, refine: number): Attrs {
  const out: Attrs = {};
  const et = eq.enhance.tables[eq.enhance.partTable[part] ?? 0];
  const e = Math.min(Math.max(enhance, 0), eq.enhance.maxLevel);
  eq.enhance.attrs.forEach((k, i) => {
    if (et.values[i][e]) out[k] = (out[k] ?? 0) + et.values[i][e];
  });
  const ref = refineLevel(eq, part, refine);
  eq.refine.attrs.forEach((k, i) => {
    if (ref.flat[i]) out[k] = (out[k] ?? 0) + ref.flat[i];
  });
  return out;
}

/** Items needed to enhance a slot from `from` to `to`. */
export function enhanceCost(eq: EquipmentData, part: number, from: number, to: number): ItemAmount {
  const t = eq.enhance.tables[eq.enhance.partTable[part] ?? 0];
  let n = 0;
  for (let e = Math.max(from, 0); e < Math.min(to, eq.enhance.maxLevel); e++) n += t.cost[e];
  return [t.costItem, n];
}

export interface RefineStep {
  /** Attempting lv -> lv+1. */
  lv: number;
  protect: boolean;
  /** Expected attempts to first reach lv+1 starting at lv, including climbing back after demotions. */
  attempts: number;
  /** Expected materials for the same, by item id. */
  materials: Record<string, number>;
}

/**
 * Expected attempts and materials to refine `from` -> `to` (exact Markov chain expectation).
 * First-passage recurrence, s/d = success/demote of row R (d = 0 where protection is used):
 *   A_R = (1 + d_R * A_{R-1}) / s_R              attempts to go R -> R+1
 *   C_R = (cost_R [+ protect_R] + d_R * C_{R-1}) / s_R   per material
 *   total = sum over R = from .. to-1
 * protect(lv) chooses protection per level (only applied where the row offers it).
 */
export function refineExpected(
  eq: EquipmentData,
  part: number,
  from: number,
  to: number,
  protect: (lv: number) => boolean = () => false,
): { attempts: number; materials: Record<string, number>; steps: RefineStep[] } {
  const levels = eq.refine.tables[eq.refine.partTable[part] ?? 0].levels;
  const end = Math.min(to, levels.length - 1);
  const steps: RefineStep[] = [];
  let prev: RefineStep | null = null;
  for (let lv = 0; lv < end; lv++) {
    const r = levels[lv];
    const useProtect = r.protect !== null && protect(lv);
    const d = useProtect ? 0 : r.demote;
    const mats: Record<string, number> = {};
    const add = (id: number | string, n: number) => (mats[id] = (mats[id] ?? 0) + n);
    for (const [id, n] of r.cost) add(id, n);
    if (useProtect && r.protect) add(r.protect[0], r.protect[1]);
    if (d && prev) for (const [id, n] of Object.entries(prev.materials)) add(id, d * n);
    for (const id of Object.keys(mats)) mats[id] /= r.success;
    const step: RefineStep = {
      lv,
      protect: useProtect,
      attempts: (1 + d * (prev?.attempts ?? 0)) / r.success,
      materials: mats,
    };
    steps.push(step);
    prev = step;
  }
  const picked = steps.slice(Math.max(from, 0));
  const materials: Record<string, number> = {};
  for (const s of picked)
    for (const [id, n] of Object.entries(s.materials)) materials[id] = (materials[id] ?? 0) + n;
  return { attempts: picked.reduce((a, s) => a + s.attempts, 0), materials, steps: picked };
}

/**
 * Highest resonance level reachable with the given slots. `slotLevels`: enhance (or refine) level of each slot
 * that holds an item; leave empty slots out. Levels are claimed in order, so this counts consecutive rows met.
 * Use: resonanceLevel(eq.enhanceResonance, (r) => r.enhance, levels).
 */
export function resonanceLevel<R extends ResonanceRow>(
  rows: R[],
  need: (r: R) => number,
  slotLevels: number[],
): number {
  let level = 0;
  for (const r of [...rows].sort((a, b) => a.level - b.level)) {
    if (slotLevels.filter((l) => l >= need(r)).length < r.parts) break;
    level = r.level;
  }
  return level;
}

export function enchantPool(
  eq: EquipmentData,
  part: number,
  category: number,
  quality: number,
): EnchantPool | null {
  const i = eq.enchant.poolIndex[part]?.[category]?.[quality - 1];
  return i === undefined || i === null ? null : eq.enchant.pools[i];
}

/** Every option one enchant line can roll for a spec at an enchant level, with P(line = option). */
export function enchantLineOdds(
  eq: EquipmentData,
  part: number,
  category: number,
  level: number,
  spec: number,
): { quality: number; option: EnchantOption; p: number }[] {
  const qo = eq.enchant.qualityOdds.find((x) => x.level === level);
  if (!qo) return [];
  const out: { quality: number; option: EnchantOption; p: number }[] = [];
  for (const [q, , pq] of qo.odds) {
    for (const o of enchantPool(eq, part, category, q)?.options ?? []) {
      if (!o.specs || o.specs.includes(spec)) out.push({ quality: q, option: o, p: pq * o.p });
    }
  }
  return out;
}

/** Chance that at least one of `lines` independent lines hits an event of per-line chance p. */
export const atLeastOnce = (p: number, lines: number) => 1 - (1 - p) ** lines;

/** Materials (= EXP) to raise an enchant pool from level `from` to `to`. */
export function enchantExp(eq: EquipmentData, category: number, from: number, to: number): number {
  return eq.enchant.levels
    .filter((l) => l.category === category && l.level >= from && l.level < to)
    .reduce((a, l) => a + l.upgradeExp, 0);
}
