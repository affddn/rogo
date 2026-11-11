// Items, where they come from, shops and summon pools: the shapes of public/data/items.json,
// shops.json and summons.json, written by scripts/export_items.py from the client's config tables.
//
// Evidence tags used below:
//   [code]     read from decompiled client code (GameLogic.dll, Cross.dll)
//   [data]     a table value, a Variables.cs constant, or the game's own text
//   [inferred] our reading of the data. Drops and gacha rolls are resolved on the server, so the
//              client only shows what can drop; the roll rules marked [inferred] are not in its code.

/** "item:<item_info id>" | "card:<card_info id>" | "pet:<pet_info id>". */
export type AssetKey = `item:${number}` | `card:${number}` | `pet:${number}`;
export type AssetKind = "item" | "card" | "pet";

/**
 * Chance per attempt, as a fraction (0.25 = 25%; 1 = guaranteed). "possible" means the client lists
 * the reward but the pool or weights aren't in the client, so no number can be derived
 * (e.g. the "Random Card - Purple" chests).
 */
export type Chance = number | "possible";

/** A reward line: an asset with an amount, sometimes with a chance. */
export interface Reward {
  /** Absent for things that aren't items/cards/pets (equipment or weapons by quality). */
  key?: AssetKey;
  name: string;
  /** `[min, max]` when a count multiplier applies (drop_group.DropAmount) [data]. */
  amount: number | [number, number];
  /** Omitted when guaranteed. */
  p?: Chance;
}

// ---------------------------------------------------------------- items.json

/**
 * Where an asset comes from. Grouped in the UI by `kind`:
 * - idle: campaign idle income. Card rolls use stage_info.idleDrop: slot 0 rolls every 8h, slot 1
 *   every 3h (Variables.IDLE_CARD_DROP_FREQUENCY) [data]; pairing slot -> timer by index [inferred].
 *   Item income uses stage_info.idleItem/idleNum against IDLE_ITEM_DROP_FREQUENCY, same pairing [inferred].
 * - firstClear: main stage first clear (stage_info.FirstDownReward).
 * - mvp, secretRealm, tower, dungeon, baphomet, guild, arena, guildWar: game modes (first clears,
 *   sweeps, rank and milestone rewards).
 * - quest, daily, weekly, growth, achievement, jobChange, limitedQuest: task_info rewards plus the
 *   activity chests in Variables (TASK_DAILY_REWARD, TASK_WEEKLY_REWARD, CARNIVAL_TASK_PROGRESS_REWARD).
 * - event: login reward series (event_task_info), welcome mail, rating prompt, ranking likes.
 * - signin: Check-in Bonus (free and premium track).
 * - chest / select: opening a random chest (the item's drop) / picking from a selectable chest.
 * - convert: duplicates turned into fragments, equipment dismantled into Echo Core.
 * - summon / summonBonus: gacha pools and their draw-count milestones.
 * - shop: a store listing (see shops.json via `ref`).
 * - pass, monthlyCard, firstTopUp, giftPack: paid products and their free tiers. Shown as data only.
 */
export type SourceKind =
  | "idle"
  | "firstClear"
  | "mvp"
  | "secretRealm"
  | "tower"
  | "dungeon"
  | "baphomet"
  | "guild"
  | "arena"
  | "guildWar"
  | "quest"
  | "daily"
  | "weekly"
  | "growth"
  | "achievement"
  | "jobChange"
  | "limitedQuest"
  | "event"
  | "signin"
  | "chest"
  | "select"
  | "convert"
  | "summon"
  | "summonBonus"
  | "shop"
  | "pass"
  | "monthlyCard"
  | "firstTopUp"
  | "giftPack";

/**
 * One way to get an asset, or a range of them (stages, MVP levels, tower floors) that give the
 * same amount at the same chance.
 *
 * How `p` is derived for drops: a drop id lists drop_base rows grouped by DropGroupId, and the
 * client shows a chance only when the group's Probability < 1 (DropCfg.ShouldShowProbability) [code].
 * Each group rolls on its own with drop_group.Probability; on success one row of the group is picked
 * with chance Weight / sum of the group's weights, so p = Probability x Weight / sum(Weight)
 * [inferred]. Several groups can pay out from the same roll. Summon sources take p from summons.json.
 */
export interface Source {
  kind: SourceKind;
  /** Ready to show, e.g. "MVP Angeling sweep Lv 6–15", "Idle card roll (every 3h) at stage 3-4–3-5". */
  label: string;
  /** Per attempt. In a summary (`count` + `total`) the [min, max] over the merged sources. */
  amount: number | [number, number];
  /** Chance per attempt. Omitted on a summary whose sources differ in chance. */
  p?: Chance;
  /** Lowest chance across a merged range (Pet Gacha levels); `p` is then the highest. */
  pMin?: number;
  /**
   * What one attempt is: "first clear", "clear", "sweep", "idle 8h", "idle 3h", "idle 15 min",
   * "pull", "open", "purchase", "day", "week", "completion", "login day", "<n> pulls", ...
   */
  per?: string;
  /**
   * drop_group.Frequency: always 1/Probability in this data [data]. Read as "about once per N
   * attempts", possibly a guarantee by the Nth (server-side) [inferred]. E.g. MVP hats: 556.
   */
  pity?: number;
  /**
   * Expected amount per day at this spot = amount x p x attempts per day [inferred]. Attempts/day:
   * idle 86400 / timer seconds (assumes a full 24h of idle credit; offline idle caps at 12h, see
   * ItemsFile.idle), MVP sweeps 3 per MVP (mvp_challenge_info.MvpDailySweepTimes), Secret Realm
   * 3 tickets, Dungeon 3 clears + 5 assists, Endless Tower 1 sweep [data].
   */
  perDay?: number;
  /** Campaign stage ids ("chapter-stage", as in stages.json) covered, first and last. */
  stages?: [string, string];
  /** How many sources were merged into this line (stages in a range, event periods, ...). */
  count?: number;
  /** Summary only: expected amount if every merged source is done once (sum of amount x p). */
  total?: number;
  /** Summary only: label of the most rewarding merged source. */
  best?: string;
  /** Summary only: label of the earliest merged source. */
  first?: string;
  /** Card entries only: this is a source of the card's fragments; `amount` counts fragments. */
  viaShard?: true;
  /** Link: "item:<id>" (the chest), "summon:<summon id>", "goods:<store goods id>". */
  ref?: string;
  /** Shop sources: how the listing is paid for (see Goods). */
  pay?: PayMethod;
  cost?: Price;
  /** Real-money price in USD from recharge_info [data]. Informational only. */
  usd?: number;
  limit?: number;
  refresh?: RefreshRule;
}

export interface Item {
  key: AssetKey;
  id: number;
  asset: AssetKind;
  name: string;
  /** item_info.ItemKind (names in ItemsFile.kinds); 0 for cards and pets. */
  kind: number;
  /** item_info.Category (names in ItemsFile.categories); 0 for cards and pets. */
  category: number;
  /** Quality tier, names in ItemsFile.qualities (cards: 2 green .. 5 orange). */
  quality: number;
  /** English description with %{n} filled in; cards: flavour text; pets: "". */
  desc: string;
  /** item_info.IsShow = 0: not listed in the backpack. */
  hidden?: true;
  /** The game's own "how to obtain" hints: ids into ItemsFile.acquisitions [data]. */
  access?: number[];
  /** Card fragments: the card they build. Cards: their own id. */
  card?: number;
  /** Cards: the fragment item id. */
  shard?: number;
  /** Cards: fragments a duplicate converts to, and needed to build one (card_info.DuplicateShardRatio). */
  shardsPerCard?: number;
  /** Collection Gear fragments: legacy_info entry. */
  legacy?: number;
  /** Appearance items: the appearance they unlock. */
  avatar?: number;
  /** Random chests: what one opening gives (drop expanded as for Source.p). */
  contents?: Reward[];
  /** Selectable chests: the options; you pick one. */
  choose?: Reward[];
  /** Where this item is spent as a currency: "store:<id>", "summon:<id>". */
  spentIn?: string[];
  /**
   * Sorted by kind (in SourceKind order), then by value (perDay, else amount x p). Groups with more
   * than 8 ranges collapse into one summary line (`count`, `total`, `best`, `first`). Card idle
   * spots are capped at the 24 best.
   */
  sources: Source[];
}

export interface ItemsFile {
  version: string;
  /** quality id -> name (quality_txt_N) [data]. */
  qualities: Record<string, string>;
  /** item category -> name (item_category_N) [data]. */
  categories: Record<string, string>;
  /** ItemKind -> label; the kind constants are named in GameLogic [code]. */
  kinds: Record<string, string>;
  /** acquisition_info id -> name, for Item.access [data]. */
  acquisitions: Record<string, string>;
  /** Variables.cs timers [data]: card roll seconds per idleDrop slot, item seconds per idleItem slot, offline cap. */
  idle: { cardRollSeconds: number[]; itemSeconds: number[]; offlineCapSeconds: number };
  items: Item[];
}

// ---------------------------------------------------------------- shops.json

/**
 * store_goods_info.Method [code: ShopModel, BuyBtn, TreasureGoodsCellLogic]: free, an item cost
 * (methodArg = [item, price]), watch an ad, or real money (methodArg[0] = recharge_info entry).
 */
export type PayMethod = "free" | "item" | "ad" | "money";

/**
 * LimitRefreshRule: "0" permanent, "1" daily, "2" weekly, "3" monthly, "4" per event period
 * (ShopListCell.BuildLimitText picks lang shop_limit_header_N) [code][data].
 */
export type RefreshRule = 0 | 1 | 2 | 3 | 4;

export interface Price {
  key: AssetKey;
  name: string;
  amount: number;
}

export interface Goods {
  /** store_goods_info.Entry; item sources link here as "goods:<id>". */
  id: number;
  items: Reward[];
  pay: PayMethod;
  /** pay = "item": the price. */
  cost?: Price;
  /** pay = "money": USD price [data]. Informational only. */
  usd?: number;
  /** Struck-through original price, in the cost currency [code: BuyBtn]. */
  was?: number;
  /** Percent off shown on the listing [code: ShopListCell]. */
  sale?: number;
  /** Purchases allowed per refresh period; absent = unlimited. */
  limit?: number;
  refresh?: RefreshRule;
  /** Unlock condition text, e.g. "Unlocks after clearing Main Stage 5-12." [code: ShopModel.IsBuyRuleUnlocked]. */
  unlock?: string;
}

export interface Store {
  /** store_info.Entry. */
  id: number;
  name: string;
  /** shop: mode currency shops; mall: the Mall tabs; event: a limited treasure event's exchange or gift pack. */
  kind: "shop" | "mall" | "event";
  funcId: number;
  /** Items accepted as payment here. */
  currencies: AssetKey[];
  /** Event stores: open window, days counted from server open (event_open_info) [inferred]. */
  days?: [number, number];
  goods: Goods[];
}

export interface ShopsFile {
  refresh: Record<string, string>;
  stores: Store[];
}

// ---------------------------------------------------------------- summons.json

/** One item in a pool group. */
export interface PoolItem extends Reward {
  /** summon_drop_info.BaseWeight [data]. */
  weight: number;
  /**
   * Chance per pull = group rate x weight / sum of the group's weights. The group rate is the
   * game's shown figure [data]; the split inside a group by weight is [inferred].
   */
  p?: number;
  /** The pity track (PityTrack.id) this item belongs to. */
  pity?: number;
  /**
   * WeightDecayRate pairs [copies owned, weight factor]: the weight shrinks for gear you already
   * own [inferred]. Only on Collection Wish pools.
   */
  decay?: [number, number][];
}

export interface PoolGroup {
  /** summon_drop_info.ShowGroup. */
  id: number;
  /** Group name as shown in the pool preview, e.g. "Legendary Quality", "Grand Prize". */
  name: string;
  quality?: number;
  /** The rate text the game shows (summon_info.ShowProbability) [code: LegacySummonCfg.ParseShowProbability]. */
  shown?: string;
  /** `shown` as a fraction. */
  rate?: number;
  items: PoolItem[];
}

/**
 * A pity track (summon_probability_info): curve[n-1] is the chance the track pays on the n-th pull
 * since it last paid; the last entry is 1 (guaranteed) [data]. Reading the curve that way [inferred]
 * reproduces the game's shown rates exactly for Normal Wish (0.39/5.88/13.41%), Job Wish
 * (2.36/11.07%) and Arcane Card Trove (1.43%); for Heroic Relic Vault and Splendid Garb Treasury it
 * gives 15.4% against a shown 5% (`shownMatches: false`), so those two are unresolved.
 */
export interface PityTrack {
  id: number;
  /** "Legendary Quality", "Heroic Blessing", "Soul Bond", ... */
  name: string;
  /** Pulls after which the track's reward is guaranteed. */
  max: number;
  curve: number[];
  /** Long-run share of pulls that pay this track: 1 / expected pulls between payouts [inferred]. */
  effective: number;
  /** Set when the track has its own shown group: whether `effective` equals the shown rate. */
  shownMatches?: boolean;
  items: Reward[];
}

export interface ProgressReward {
  /** Total pulls needed. */
  at: number;
  rewards: Reward[];
  big?: boolean;
}

export interface SummonBase {
  /** "weapon" | "pet" | "elite" | "wish" | "wish-<entry>" | "treasure-<entry>" | "wheel"; sources link as "summon:<id>". */
  id: string;
  /** summon_info.Entry (0 for Elite Summon, which has none). */
  entry: number;
  name: string;
  funcId: number;
  /** The game's rule text for this feature, colour tags stripped [data]. */
  rule: string;
  /** Single pull, in spending order: the ticket first, then the fallback currency (per the rule text) [data]. */
  cost: Price[];
  /** Fixed multi-pull (e.g. 10 for 10 tickets). */
  multi?: { pulls: number; cost: Price[] };
  freePerDay?: number;
  adsPerDay?: number;
  totalLimit?: number;
  /** Most pulls in one batch where you pick the count (weapon and pet gacha). */
  maxBatch?: number;
  /** Event window, days from server open (event_open_info) [inferred]. */
  days?: [number, number];
}

/** Gacha level row: rates at this level and pulls to the next. */
export interface GachaLevel {
  level: number;
  /** Pulls made at this level to reach the next; 0 = max level (CostNum is the progress bar max) [code]. */
  toNext: number;
  /** Quality shown as the level's best. */
  top: number;
  /** Reward for reaching this level (LevelArchievement) [data]. */
  reward?: Reward[];
}

/** Weapon Gacha: rates by weapon tier [code: SummonLevelDetailDialog]. */
export interface WeaponSummon extends SummonBase {
  type: "weapon";
  levels: (GachaLevel & {
    /** tier = WeaponQuality 1..28; quality/sub = its shown quality and grade (I–IV). Each tier is one weapon per class build [code]. */
    rates: { tier: number; quality: number; sub: string; p: number }[];
  })[];
}

/** Pet Gacha: rates by pet quality; pets of a quality share it equally [code: PetSummonLevelDetailDialog]. */
export interface PetSummon extends SummonBase {
  type: "pet";
  levels: (GachaLevel & {
    rates: { quality: number; p: number; pets: AssetKey[]; each: number }[];
    guardSlots: number;
    grade: number;
  })[];
}

/** Elite Summon (equipment). Rates per level = DropWeight / sum [code: EliteSummonLevelUpDialog]. */
export interface EliteSummon extends SummonBase {
  type: "elite";
  /** Summon multipliers offered (Variables.ELITE_SUMMON_DROP_MULTIPLIER) [data]. */
  multipliers: number[];
  levels: {
    level: number;
    /** Equipment pieces per summoned elite [inferred]. */
    dropNum: number;
    /** Name colour of summoned elites [code: SoldierStateBar_Monster]. */
    color: number;
    /** tier = equipment quality 1..61 ("Epic II"); quality = its colour tier. */
    rates: { tier: number; name: string; quality: number; p: number }[];
    /** Next level: progress steps needed, Echo Core cost, timer seconds [code]. Absent at max level. */
    upgrade?: { steps: number; cost: Price; seconds: number };
    /** Highest summon multiplier unlocked at this level (EfMultiEliteSummonDrop) [inferred]. */
    multiplier?: number;
  }[];
}

/** Pool-based gacha: Collection Wish, limited treasure events, Watch & Spin. */
export interface PoolSummon extends SummonBase {
  type: "wish" | "treasure" | "wheel";
  groups: PoolGroup[];
  pity?: PityTrack[];
  progress?: ProgressReward[];
  /** Wish: milestones repeat after the last one [data: rule text]; shared by all pools with this summon_info.ShareGroup. */
  progressRepeats?: boolean;
  progressShared?: number;
  /** Highlighted prizes (LEGACY_SUMMON_SHOW_PRIZE / treasure DisplayCore) [data]. */
  featured?: AssetKey[];
  /** Treasure events. */
  theme?: string;
  period?: number;
  /** The insignia exchanged in the event's store. */
  exchange?: AssetKey;
  /** [exchange store id, gift pack store id] in shops.json. */
  stores?: [number, number];
  /** InheritBaodi: pity progress is kept across periods [data]. */
  pityCarriesOver?: boolean;
}

export type Summon = WeaponSummon | PetSummon | EliteSummon | PoolSummon;

export interface SummonsFile {
  summons: Summon[];
}

// ---------------------------------------------------------------- helpers

export function parseKey(key: AssetKey): { asset: AssetKind; id: number } {
  const [asset, id] = key.split(":");
  return { asset: asset as AssetKind, id: Number(id) };
}

/** Chance of at least one success in `attempts` independent tries at chance `p`. */
export function chanceWithin(p: number, attempts: number): number {
  return 1 - (1 - p) ** attempts;
}

/** Chance a pity track pays at least once within the next `pulls`, starting `since` pulls into the curve. */
export function pityChanceWithin(curve: number[], pulls: number, since = 0): number {
  let miss = 1;
  for (let i = since; i < Math.min(since + pulls, curve.length); i++) miss *= 1 - curve[i];
  return 1 - miss;
}

/** Expected pulls between payouts of a pity track (1 / PityTrack.effective). */
export function expectedPulls(curve: number[]): number {
  let survive = 1;
  let pulls = 0;
  for (const p of curve) {
    pulls += survive;
    survive *= 1 - p;
  }
  return pulls;
}

export function formatChance(p: Chance | undefined): string {
  if (p === undefined) return "";
  if (p === "possible") return "possible";
  if (p >= 1) return "100%";
  const pct = p * 100;
  return `${pct >= 1 ? pct.toFixed(1).replace(/\.0$/, "") : pct.toPrecision(2)}%`;
}
