// Shapes of public/data/systems.json (scripts/export_systems.py): the power systems outside
// equipment and cards — weapons, Collection Gear (legacy_*), pets, awakening, guild skills,
// treasure pools, card slots/collection, costumes and titles.
//
// Tags on every rule:
//   [code]     read from the decompiled client (file:line under src/logic/GameLogic or src/cross)
//   [data]     read from the table rows
//   [inferred] the server code that applies it is not in the client; table shape or client UI supports it
//
// How sources combine is shared with the rest of the planner: the server sums every source per attr id
// and the client only receives totals [code AttrModel.cs:46-70]. So every map below is a delta to add to
// the hero's per-id totals; layering (AddL1 → MulL2 → …) happens afterwards (see attributes.ts).

/** "<attr id>:<KeyEn>" → value, as in cards.json. Percent attrs are fractions (0.05 = 5%).
 * The KeyEn suffix gives the layer: …AddL1 flat, …MulL2 additive % pool, …MulL4/MulL6 separate multipliers. */
export type AttrMap = Record<string, number>;

/** One reward or prize. `type` is the table's asset category (20 item, 40 weapon, 50 card, 55 legacy, 60 pet). */
export interface Reward {
  type: "item" | "equip" | "weapon" | "card" | "legacy" | "pet";
  id: number;
  num: number;
  /** English name; "" when the id has no name row (a few event items) */
  name: string;
}

/** An item cost. `num` is per action (per level, per draw…), never cumulative unless a field says so. */
export interface Cost {
  item: number;
  name: string;
  num: number;
}

/** A fight_brand: an in-fight proc/passive. Never part of the attr totals or the power score [code CastSysFL.cs]. */
export interface Brand {
  id: number;
  /** English text with its arguments filled in; describes the full effect at that star/tier */
  text: string;
}

/** A gacha pool (summon_info). */
export interface Summon {
  id: number;
  name: string;
  /** cost of one draw */
  cost: Cost | null;
  /** multi-draw: `draws` pulls for `cost` (null when the pool has no discounted multi) */
  multi: { draws: number; cost: Cost | null } | null;
  /** item that replaces `cost` 1:1 per draw when held (e.g. Weapon Gacha Coin) */
  ticket: Cost | null;
  freePerDay: number;
  adPerDay: number;
  /** the rates the game shows, verbatim strings ("0.39%") */
  shownOdds?: { group: string; rate: string }[];
}

export interface SpecMeta {
  name: string;
  /** career_info.CareerKind (200 Swordsman line, 300 Magician, 400 Archer, 500 Thief) */
  careerKind: number;
  /** "magic" when fight_battle_rate gives BasePAtk(1100) weight 0 for the spec [data]. Drives pet attack inheritance. */
  damage: "physical" | "magic";
  /** false for 42 Shoot Hunter: it has weapon/awakening rows but no career_spec row and no power weights [data] */
  released: boolean;
}

export interface CareerMeta {
  name: string;
  kind: number;
  /** 0 Novice, 1 first job … 4 third job */
  tierStage: number;
  specs: number[];
}

export interface SystemsData {
  meta: {
    client: string;
    /** quality_txt_N: 1 Normal … 7 Ancient … 10 Eternal. Used by weapon show quality, pets, legacy, avatars. */
    qualityNames: Record<string, string>;
    specs: Record<string, SpecMeta>;
    careers: Record<string, CareerMeta>;
  };
  weapons: WeaponSystem;
  legacy: LegacySystem;
  pets: PetSystem;
  awakening: AwakenLine[];
  guild: GuildSystem;
  treasure: TreasurePool[];
  cards: CardSlotSystem;
  avatars: AvatarSystem;
  titles: { hasStats: false; titles: Title[] };
}

// ------------------------------------------------------------------ weapons

/**
 * Weapons (weapon_info, weapon_upgrade, weapon_achievement, weapon_gacha_levelup).
 *
 * - A weapon is owned by quality `q` (1..28). Its stats are read from **the current build's** row, so switching
 *   build changes every weapon's stats [code WeaponUtils.cs:39-47, WeaponCfg.cs:23-31].
 * - Equipped (one weapon): `equip` × `starFactor.equip[star-1]` plus `equipFlat` unscaled [code WeaponUtils.cs:48-55].
 * - Owned (activated, star ≥ 1): `inv` × `starFactor.inv[star-1]` plus `invFlat` [code WeaponUtils.cs:75-82].
 *   Summed over every activated weapon, the equipped one included [inferred].
 * - Star s needs `count ≥ starCost[show][s-1]` copies of that weapon; star 1 is activation
 *   [code WeaponUtils.cs:86-125]. Copies are consumed per step, so the total to reach star s is the prefix sum [inferred,
 *   same as legacy/cards where the client sums the steps: SelectChestGrowHelper.cs:171-197].
 * - weapon_levelup has a single row, so weapon level has no effect in this client [data].
 * - The weapon % lands in BasePAtkMulL2 (BaseMAtkMulL2 for mages): the same additive pool as STR/DEX→%, card, legacy
 *   and enhance %. Because the top weapons put 60–120 into that pool, other MulL2 sources are worth little relative
 *   to flat AddL1 or the thin MulL4/MulL6/DMG-increase pools [inferred from the layer math].
 */
export interface WeaponSystem {
  maxStar: number;
  /** index star-1. Identical for every show quality [data, asserted by the exporter]. */
  starFactor: { equip: number[]; inv: number[] };
  /** copies consumed for each star step, by show quality ("1".."7"); index star-1 */
  starCost: Record<string, number[]>;
  builds: WeaponBuild[];
  achievements: WeaponAchievement[];
  summonLevels: WeaponSummonLevel[];
  summon: Summon | null;
}

export interface WeaponBuild {
  spec: number;
  specName: string;
  released: boolean;
  category: number;
  categoryName: string;
  /** 28 rows, q ascending */
  weapons: Weapon[];
}

export interface Weapon {
  /** weapon quality 1..28: the key the player owns */
  q: number;
  name: string;
  /** "I".."IV" */
  sub: string;
  /** show quality 1..7 (Normal..Ancient): picks starCost and achievement group */
  show: number;
  /** the one attr scaled by starFactor.equip */
  equip: AttrMap;
  /** equipped, not star-scaled (stat flats, Haste, Skill CRIT) */
  equipFlat: AttrMap;
  /** the one owned attr scaled by starFactor.inv */
  inv: AttrMap;
  invFlat: AttrMap;
  desc: string;
}

/**
 * Weapon Master tasks. Progress = sum of stars over owned weapons whose show quality is `show`, using the current
 * build's rows [code WeaponUtils.cs:254-281; task TriggerType 1101]. Each claimed task adds `attrs` (flats, summed over
 * claimed tasks [inferred]) or gives `reward` items once.
 */
export interface WeaponAchievement {
  id: number;
  task: number;
  show: number;
  stars: number;
  text: string;
  attrs: AttrMap;
  reward: Reward[];
}

/**
 * Weapon summon level. At level L each draw rolls a weapon quality with `odds` (fractions summing to 1);
 * after `drawsToNext` draws at L the pool reaches L+1 (0 = max) [code SummonAchievementDialog.cs:147-152,
 * SummonLevelDetailDialog.cs:118-130]. `reward` is granted on reaching L.
 */
export interface WeaponSummonLevel {
  level: number;
  drawsToNext: number;
  /** weapon quality q ("1".."28") → probability */
  odds: Record<string, number>;
  topShow: number;
  reward: Reward[];
}

// ------------------------------------------------------------------ Collection Gear (legacy_*)

/**
 * Collection Gear (legacy_*, gacha "Collection Wish" / "Job Wish", event pool "Heroic Relic Vault").
 *
 * - Equipped: `stars[star-1].equip` + its `brand` [code LegacyPowerCompare.cs:291-310].
 * - Owned (activated): `stars[star-1].inv`, summed over every activated item, any career [code LegacyCfg.cs:1150-1167
 *   (UI total); server inferred].
 * - Wearing needs player base level ≥ `baseLevel` and a career of the same kind at tier stage ≥ the listed career's
 *   [code LegacyCfg.cs:442-475]. Items with a `twoHanded` category fill slots 1 and 2 [code LegacyCfg.cs:277-342].
 * - Star-up consumes `shards` shard items for that step; a duplicate drop is worth `dupShards` shards
 *   [code SelectChestGrowHelper.cs:171-197; data].
 * - Slot enhance: see LegacyEnhance. Suits: see LegacySuit. Collection bonus is items only.
 */
export interface LegacySystem {
  slots: Record<string, string>;
  categories: { id: number; name: string; slots: number[]; twoHanded: boolean }[];
  items: LegacyItem[];
  enhance: LegacyEnhance;
  suits: LegacySuit[];
  /** one-off item rewards at total-star milestones over all items, claimed in order */
  collectionBonus: { totalStar: number; reward: Reward[] }[];
  /** draw-count milestones of the wish pools; `group` 10000 Collection Wish, 11000 Job Wish (all jobs share it) */
  summonProgress: {
    group: number;
    round: number;
    draws: number;
    reward: Reward[];
    bigPrize: boolean;
  }[];
  summon: Summon[];
}

export interface LegacyItem {
  id: number;
  name: string;
  /** 3 Excellent, 4 Epic, 5 Legendary */
  quality: number;
  category: number;
  baseLevel: number;
  /** career_info entries (201 Swordsman, 301 Magician, 401 Archer, 501 Thief) */
  careers: number[];
  /** specs those careers cover */
  specs: number[];
  shard: { item: number; name: string };
  dupShards: number;
  /** legacy_info.ShardItemTransfer as [shards, item, num]: presumably surplus shards convert to `num` × item
   * per `shards` [inferred; server only] */
  shardTransfer: { shards: number; item: number; name: string; num: number } | null;
  acquisition: string[];
  desc: string;
  /** 5 rows, star ascending */
  stars: LegacyStar[];
}

export interface LegacyStar {
  star: number;
  /** shards consumed for this step (star 1 = activation) */
  shards: number;
  equip: AttrMap;
  /** text shows the full effect at this star */
  brand: Brand | null;
  inv: AttrMap;
}

/**
 * Per-slot enhance (slots 1..8 all share one table [data, asserted]). At level L each of `attrs` gets `value[L]`
 * (a total, not an increment). `cost[L]` × costItem takes L → L+1 (0 at max).
 * Counts only while the slot holds an equipped item [code LegacyCfg.cs:119-135 (UI sum); server inferred].
 */
export interface LegacyEnhance {
  parts: number[];
  maxLevel: number;
  attrs: string[];
  costItem: { item: number; name: string };
  value: number[];
  cost: number[];
}

/**
 * Sets. Worn (every part equipped): tier = min star over the parts; apply the single tier with the highest
 * `star ≤ tier` — `equip` and `brand`, not cumulative [code LegacyCfg.cs:812-846, 1034-1056, LegacyPowerCompare.cs:99-165].
 * Owned (every part activated): `inv` of the same tier rule [code LegacyCfg.cs:984-1002].
 */
export interface LegacySuit {
  id: number;
  name: string;
  parts: number[];
  careers: number[];
  specs: number[];
  tiers: { star: number; equip: AttrMap; brand: Brand | null; inv: AttrMap }[];
}

// ------------------------------------------------------------------ pets

/**
 * Pets (pet_info, pet_levelup, pet_skill, pet_gacha_levelup).
 *
 * - Level 0 = not activated; level L reads `levels[pet.curve]` at index L-1 [code PetInfoData.cs]. Every pet of one
 *   quality shares one curve [data, asserted].
 * - Level-up to L needs `count ≥ cost[L-1]` copies of the pet [code PetInfoData.cs:60-86]; consumed [inferred].
 * - One combat pet ("Deployed") and up to `guardSlots` guard pets ("Guarding", shown as Blessing slots).
 *   Guard slots unlocked = summonLevels[current pet summon level].guardSlots [code PetGuardSlot.cs:178-192].
 * - `guard` attrs go to the hero from each guarding pet [code PetGuardTotalAttrDialog.cs lists guard pets only;
 *   server inferred]. Whether the combat pet also grants them is unknown.
 * - `inv` attrs from every activated pet [inferred]. They are PDEF/MDEF/HP MulL2 only: pets add no owned damage.
 * - Pet attack = hero final BasePAtk × inherit[L-1]; for magic specs (BasePAtk power weight 0) hero BaseMAtk × inherit,
 *   still stored as the pet's BasePAtk [code AttrUtils.cs:332-365].
 * - Pet power = pet BasePAtk × spec weight (fight_battle_rate 1100, or 1200 for magic specs; 10 for every released spec)
 *   × battleRate[L-1] [code PetBattleRateCounter.cs:45-110]. Only the combat pet is added to total power
 *   [code EquipPowerCompare.cs:21-36].
 * - Pet damage uses the PetHurt formula with the pet's own attrs (`own`) [code FightFormulaTemplate.cs:192-195].
 */
export interface PetSystem {
  pets: Pet[];
  /** keyed by pet quality "2".."6" */
  levels: Record<string, PetCurve>;
  summonLevels: PetSummonLevel[];
  summon: Summon | null;
  slotNames: { fight: string; guard: string };
}

export interface Pet {
  id: number;
  name: string;
  /** 2 Fine … 6 Mythic */
  quality: number;
  show: number;
  curve: string;
  /** the pet's own base attrs (same for every pet) */
  own: AttrMap;
  acquisition: string[];
  skills: PetSkill[];
}

export interface PetSkill {
  idx: number;
  /** 0 normal attack, 1 active, 2 passive */
  kind: number;
  kindName: string;
  /** skill works once pet level ≥ unlockLevel [code PetSkillBtn.cs:38] */
  unlockLevel: number;
  skill: number;
  name: string;
  /** level-1 brand text; pet skills have no further levels [data] */
  text: string;
  /** BaseCooldown + VariableCooldown in seconds (9999 = once per fight); the variable part is cut by pet attack speed */
  cd: number;
  cast: number;
}

/** Columns indexed by level-1. `guard`/`inv` drop attrs that are 0 at every level. */
export interface PetCurve {
  maxLevel: number;
  cost: number[];
  inherit: number[];
  battleRate: number[];
  guard: Record<string, number[]>;
  inv: Record<string, number[]>;
}

/** Pet summon level: `odds` keyed by pet quality; which pet within a quality is not in the client [inferred uniform]. */
export interface PetSummonLevel {
  level: number;
  drawsToNext: number;
  odds: Record<string, number>;
  guardSlots: number;
  topShow: number;
  grade: number;
  reward: Reward[];
}

// ------------------------------------------------------------------ awakening

/**
 * Awakening: two lines per spec. No resource cost: a tier can be activated once the hero's **final** value of
 * `gate` reaches `req` [code AwakenCfg.cs:79-103]. The activated index is stored per build; tiers ≤ it count
 * [code AwakenCfg.cs:155-178, IdleStageAdapterFV.cs:168-176].
 * - Skill tiers ≤ index each add their passive skill at level 1 (cumulative; each tier's text is what it adds).
 * - Stat tiers ≤ index are summed [inferred]. Skill tiers also carry SkillBRNum (81000), a power-only attr.
 * - Gear changes that drop the gate below a tier's req switch it off [code EquipPowerCompare.cs:63-118].
 */
export interface AwakenLine {
  id: number;
  spec: number;
  specName: string;
  released: boolean;
  /** 1 or 2 */
  line: number;
  name: string;
  desc: string;
  /** the gate attr (a final value, e.g. "1050:BaseDEX", "10100:BaseAtkSpeed") */
  gate: string;
  gateName: string;
  /** where the game says to raise the gate attr */
  acquisition: string[];
  tiers: AwakenTier[];
}

export interface AwakenTier {
  tier: number;
  req: number;
  kind: "skill" | "stat";
  attrs: AttrMap;
  skill: { id: number; name: string; text: string } | null;
}

// ------------------------------------------------------------------ guild

/**
 * Guild skills. A level's `attrs` are the **total** at that level, so apply only the current level's row [data;
 * inferred]. Kinds [code GuildSkillInfoDialog.cs:74-130]:
 * - 1 "Member Skill": each member researches it for `cost` Guild Tech Core over `researchSec`;
 * - 2 "Guild Skill": researched for the whole guild, free;
 * - 3 Guild Hunt privilege: granted for `durationSec` (7 days) by the guild's Guild Hunt rank tier (huntRankRewards).
 * `unlockGuildLevel` gates kinds 1–2. Skills with `stats: false` only carry an economy `effect`.
 */
export interface GuildSystem {
  skills: GuildSkill[];
  huntRankRewards: {
    tier: number;
    name: string;
    maxRank: number;
    minScore: number;
    skills: { id: number; level: number }[];
  }[];
}

export interface GuildSkill {
  id: number;
  name: string;
  kind: 1 | 2 | 3;
  kindName: string;
  stats: boolean;
  /** UI group (1 combat, 2 economy, 3 content-specific) [data] */
  category: number;
  unlockGuildLevel: number;
  maxLevel: number;
  durationSec: number;
  levels: GuildSkillLevel[];
}

export interface GuildSkillLevel {
  level: number;
  researchSec: number;
  /** cost to research this level (from level-1); null for free kinds */
  cost: Cost | null;
  attrs: AttrMap;
  brand: Brand | null;
  /** economy effect (EfKind/EfNum), `name` taken from the level text */
  effect: { kind: number; name: string; value: number } | null;
  text: string;
}

// ------------------------------------------------------------------ treasure, cards, avatars, titles

/** Event gacha pools (treasure_info). **No stats of their own** [data]: prizes count through `feeds`. */
export interface TreasurePool {
  id: number;
  /** 1 Heroic Relic Vault (legacy), 2 Splendid Garb Treasury (avatars), 3 Arcane Card Trove (cards) */
  type: number;
  feeds: "legacy" | "avatar" | "card";
  name: string;
  pityName: string;
  /** pity counter cap (0 = none shown) */
  maxLuck: number;
  summon: Summon | null;
  /** shop currency the pool pays out */
  exchangeItem: { item: number; name: string };
  featured: { type: string; id: number; name: string }[];
  progressRewards: { draws: number; reward: Reward[] }[];
}

/**
 * Card slots and the card album bonus. Card stats themselves are in cards.json.
 * A card fits a slot of its own category once base level ≥ unlockLevel [code CardCfg.cs:245-282].
 * collectionBonus: item rewards only, claimed in order at total-star milestones [code CardCfg.cs:133-154].
 */
export interface CardSlotSystem {
  slotCategories: Record<string, string>;
  slots: { entry: number; category: number; idx: number; unlockLevel: number }[];
  collectionBonus: { totalStar: number; reward: Reward[] }[];
}

/**
 * Costumes and other appearances (avatar_new_info, avatar_res_info, avatar_progress_reward).
 * - `attrs`: shown as "Unlock Attribute" [code AvatarSimpleTip.cs:98-116]; they apply once unlocked, worn or not
 *   [inferred].
 * - Progress rewards: every milestone with `progress ≤` total collection progress adds its attrs (summed)
 *   [code AvatarCfg.cs:210-245]. Total progress comes from the server; it is presumably Σ `progress` of unlocked
 *   appearances [inferred].
 */
export interface AvatarSystem {
  categories: Record<string, string>;
  items: Avatar[];
  progressRewards: { progress: number; attrs: AttrMap }[];
}

export interface Avatar {
  id: number;
  /** 1 Costume, 2 Weapon look, 3 Headwear, 4 Face, 5 Mouth, 6 Back */
  category: number;
  quality: number;
  progress: number;
  name: string;
  /** per-spec names when they differ (weapon looks) */
  names?: Record<string, string>;
  unlock: AvatarUnlock;
  attrs: AttrMap;
}

/** kind 0 default, 1 job stage reached, 2 consume an item, 3 own any weapon of show quality `weaponShow` */
export interface AvatarUnlock {
  kind: number;
  text: string;
  jobStage?: number;
  cost?: Cost | null;
  weaponShow?: number;
}

/** Player titles: cosmetic, no attrs in any table [data]. */
export interface Title {
  id: number;
  name: string;
  grade: number;
  unlockKind: number;
  text: string;
  /** > 0: the title expires after this many seconds (Rune Arena season titles) */
  timedSec: number;
  hiddenUntilUnlocked: boolean;
}

// ------------------------------------------------------------------ helpers (pure)

export const attrId = (key: string): number => Number(key.slice(0, key.indexOf(":")));

/** into[k] += src[k] × scale, returning `into`. */
export function addAttrs(into: AttrMap, src: AttrMap, scale = 1): AttrMap {
  for (const [k, v] of Object.entries(src)) into[k] = (into[k] ?? 0) + v * scale;
  return into;
}

/** A weapon's equipped and owned attrs at `star` (0 = not activated). */
export function weaponAttrs(
  sys: WeaponSystem,
  w: Weapon,
  star: number,
): { equip: AttrMap; inv: AttrMap } {
  if (star <= 0) return { equip: {}, inv: {} };
  const s = Math.min(star, sys.maxStar) - 1;
  return {
    equip: addAttrs(addAttrs({}, w.equip, sys.starFactor.equip[s]), w.equipFlat),
    inv: addAttrs(addAttrs({}, w.inv, sys.starFactor.inv[s]), w.invFlat),
  };
}

/** Copies needed to go from star `from` to star `to` (from 0 = includes activation). */
export function weaponCopies(sys: WeaponSystem, show: number, from: number, to: number): number {
  return (sys.starCost[String(show)] ?? []).slice(from, to).reduce((a, b) => a + b, 0);
}

/** The suit tier that applies when every part is worn (or owned) at `partStars`. */
export function suitTier(
  suit: LegacySuit,
  partStars: number[],
): LegacySuit["tiers"][number] | undefined {
  if (partStars.length < suit.parts.length || partStars.some((s) => s <= 0)) return undefined;
  const min = Math.min(...partStars);
  return [...suit.tiers].reverse().find((t) => t.star <= min);
}

/** Enhance attrs of one slot at `level`. */
export function enhanceAttrs(e: LegacyEnhance, level: number): AttrMap {
  const v = e.value[Math.max(0, Math.min(level, e.maxLevel))];
  return Object.fromEntries(e.attrs.map((k) => [k, v]));
}

/** A pet curve's row at `level` (1-based); undefined for level 0. */
export function petLevel(c: PetCurve, level: number) {
  if (level <= 0) return undefined;
  const i = Math.min(level, c.maxLevel) - 1;
  const at = (m: Record<string, number[]>) =>
    Object.fromEntries(Object.entries(m).map(([k, col]) => [k, col[i]]));
  return { inherit: c.inherit[i], battleRate: c.battleRate[i], guard: at(c.guard), inv: at(c.inv) };
}

/** Combat pet power: heroAtk is the hero's final BasePAtk (BaseMAtk for magic specs); specWeight is 10 today. */
export const petPower = (
  heroAtk: number,
  inherit: number,
  battleRate: number,
  specWeight = 10,
): number => heroAtk * inherit * specWeight * battleRate;

/** Attrs and passive skills of an awakening line with tiers ≤ activated counted. */
export function awakenActive(
  line: AwakenLine,
  activated: number,
): { attrs: AttrMap; skills: number[] } {
  const attrs: AttrMap = {};
  const skills: number[] = [];
  for (const t of line.tiers) {
    if (t.tier > activated) break;
    addAttrs(attrs, t.attrs);
    if (t.skill) skills.push(t.skill.id);
  }
  return { attrs, skills };
}

/** Highest tier whose requirement the gate value meets (0 if none). */
export const awakenReachable = (line: AwakenLine, gateValue: number): number =>
  line.tiers.reduce((best, t) => (gateValue >= t.req ? Math.max(best, t.tier) : best), 0);

/** Summed avatar collection-progress attrs at `total` progress. */
export function avatarProgressAttrs(sys: AvatarSystem, total: number): AttrMap {
  const out: AttrMap = {};
  for (const r of sys.progressRewards) if (r.progress <= total) addAttrs(out, r.attrs);
  return out;
}
