// Game modes besides the campaign, and what campaign stages pay.
// Data: public/data/modes.json and public/data/stage-rewards.json, written by scripts/export_content.py from the
// SEA 0.0.163 client tables.
//
// Evidence tags used below:
//   [code]     read in the decompiled client (GameLogic.dll / Cross.dll); file named where it matters
//   [data]     read from table rows or in-game text (func_rule_* help texts are quoted as `rules`)
//   [inferred] my conclusion; the server code that does it is not in the client
//
// Rewards are rolled on the server; the client only shows the drop tables. Every drop is a set of groups: each
// group rolls once with its Probability and, on a hit, picks one row by Weight [code DropCfg.cs shows rows and
// flags Probability < 1; the roll itself is inferred]. Fights run in Cross.Fight, which the client ships, so
// timers and win rules are [code].
//
// Every mode's enemies sit on the campaign stat curve: each one's DEF equals some campaign stage's DEF up to the
// soldier's base value [data]. `tier` names that stage, so a mode fight can be read as "a campaign X-Y fight with
// this much HP in this much time".
import type { Enemy } from "../types";

/** "<kind>:<id>" with kind 20 item, 30 equipment, 40 weapon, 50 card, 55 legacy (Collection Gear), 60 pet.
 * Equipment and weapons without an id are generated for the player's own build: "30:0:<quality>-<part>-<level>",
 * "40:0:<quality>" [code DropCfg.BuildEquipInfoFromDropBase / BuildWeaponInfoFromDropBase]. */
export type ItemKey = string;

export interface ItemInfo {
  name: string;
  quality: number;
}

/**
 * One drop row.
 * - `[item, amount]`: always paid.
 * - `[item, amount, chance, group, pity]`: paid with probability `chance` (group Probability × row weight share).
 *   Rows sharing `group` are one roll: at most one of them pays. `pity` > 0 is drop_group.Frequency, which
 *   wherever it is set equals ⌈1 / group Probability⌉, so it reads as "at least one every `pity` rolls"
 *   [inferred]; 0 = none.
 */
export type DropRow =
  | [item: ItemKey, amount: number]
  | [item: ItemKey, amount: number, chance: number, group: number, pity: number];

/** Expected amount of each item from one roll of a drop. */
export function expected(rows: DropRow[]): Record<ItemKey, number> {
  const out: Record<ItemKey, number> = {};
  for (const r of rows) out[r[0]] = (out[r[0]] ?? 0) + r[1] * (r[2] ?? 1);
  return out;
}

/** Field order of EnemyRow; the first 18 are Enemy's fields. */
export const ENEMY_ROW = [
  "id",
  "count",
  "spawnAt",
  "spawnOver",
  "hpBar",
  "boss",
  "patk",
  "matk",
  "pdef",
  "mdef",
  "hp",
  "pveDmg",
  "dmgUp",
  "dmgRed",
  "finalUp",
  "finalRed",
  "hit",
  "flee",
  "round",
] as const;

/**
 * An Enemy packed as a row to keep the files small; toEnemy() gives the exact Enemy that build_data.py would
 * write for stages.json (same lineup rules: count = Count × Turns, stats = fight_soldier base + lineup attrs,
 * boss = not "spawns at 0 s over several turns"). The extra last field is the stage_round the line belongs to
 * (1-based); spawnAt counts from that round's opening.
 * - Lines that pick a random soldier per spawn (fight_lineup.SoldierRandomGroup) use the group's first member:
 *   members share base stats [data].
 * - On mode stages `boss` matches the soldier's Boss tag exactly [data]; on campaign stages it also covers the
 *   late-spawning group.
 */
export type EnemyRow = [
  id: number,
  count: number,
  spawnAt: number,
  spawnOver: number,
  hpBar: 0 | 1,
  boss: 0 | 1,
  patk: number,
  matk: number,
  pdef: number,
  mdef: number,
  hp: number,
  pveDmg: number,
  dmgUp: number,
  dmgRed: number,
  finalUp: number,
  finalRed: number,
  hit: number,
  flee: number,
  round: number,
];

export const toEnemy = (r: EnemyRow): Enemy => ({
  id: r[0],
  count: r[1],
  spawnAt: r[2],
  spawnOver: r[3],
  hpBar: r[4] === 1,
  boss: r[5] === 1,
  patk: r[6],
  matk: r[7],
  pdef: r[8],
  mdef: r[9],
  hp: r[10],
  pveDmg: r[11],
  dmgUp: r[12],
  dmgRed: r[13],
  finalUp: r[14],
  finalRed: r[15],
  hit: r[16],
  flee: r[17],
});

/** The Enemy list the clear model (stage.ts work()) takes. */
export const enemiesOf = (fight: { enemies: EnemyRow[] }): Enemy[] => fight.enemies.map(toEnemy);

/**
 * How a fight is won [code]. A PvE fight that runs out of time is lost (FightModeAdapterFLBase.OnFightTimeout).
 * - killAll: every spawned enemy dead (StageAdapterFLBase.CheckFightEndOnMonsterDead: defenders left = 0).
 * - killBoss: killing the boss ends the fight as a win even with mobs alive (ResInstance3StageAdapterFL).
 * - damage: scored on damage dealt. Baphomet's final stage and the Guild Hunt's last phase are deathless
 *   (SoldierCompFL.IsDeathless), so the fight always runs to the timer.
 */
export type WinRule = "killAll" | "killBoss" | "damage";

/** One stage_round. Rounds open in order; enemies of a round count spawnAt from its opening [code
 * FightStageRoundRefreshItem / StageBossSysFL]. */
export interface Round {
  /** seconds after which `next` = 2 opens the next round; not the fight timer */
  time: number;
  /** when the next round opens: 1 = this round has spawned everything, 2 = `time` has passed,
   * 3 = everything spawned and dead (RoundRule) */
  next: 1 | 2 | 3;
  /** this round stops spawning once the next opens (RoundCut) */
  cut: boolean;
  /** BossRaid flag; the Endless Tower uses it to mark boss floors [code EndlessTowerStageAdapterFL.IsBossFloor] */
  bossRound: boolean;
  /** most enemies of this round alive at once; 0 = no limit. The whole field is also capped at 20 [code
   * FightVariables.STAGE_MONSTER_AMOUNT_LIMIT] */
  maxOnField: number;
  /** res_stage_buff entry applied when the round opens; see ResInstancesMode.stageBuffs */
  buff?: number;
}

export interface Fight {
  /**
   * Fight timer in seconds [code]: fight_function_info.FightTime for the mode's FightStageType (MVP 40, Baphomet
   * 50, Guild Hunt 50, Weapon/EXP realm 40, Equipment realm 50, Dungeon 30, Arena 50); the Endless Tower uses
   * the floor's first stage_round RoundTime instead (EndlessTowerStageAdapterFL.InitFightCountDown).
   */
  time: number;
  /** Dungeon only: when the boss spawns the timer restarts at this many seconds (ExtraFightTime,
   * FightActors.AddBoss → SetExtraFightTime) [code] */
  extraTime?: number;
  /** largest stage_round.MonsterLimit, as stages.json's maxOnField */
  maxOnField: number;
  /** campaign stage ("chapter-stage") on the same stat tier; see the header [data match, inferred meaning] */
  tier: string | null;
  enemies: EnemyRow[];
  /** present when the fight has several rounds or a round buff */
  rounds?: Round[];
}

export interface ModeStage extends Fight {
  /** unique across modes: "mvp-<entry>", "wb-<entry>", "res-<category>-<n>", "team-<n>", "guild-<entry>",
   * "tower-<floor>" (towerFloor()) */
  id: string;
  /** the mode table's Entry */
  entry: number;
  name: string;
  win: WinRule;
  /** the power the game shows as recommended (RecommendBr) [data]; no mode gates entry on it [code MvpModel
   * only compares it for a hint] */
  recommendedPower?: number;
  /** one-time reward for the first clear [data] */
  firstClear?: DropRow[];
  /** what a clear pays after that; its meaning differs per mode, see each mode */
  repeat?: DropRow[];
}

/** How a feature unlocks: function_info [code FunctionManager.IsFunctionOpen: all set conditions must hold]. */
export interface Unlock {
  /** function_info entry */
  func: number;
  name: string;
  /** the game's own unlock text */
  text: string;
  /** main quest that must be completed and claimed */
  mainQuest?: number;
  /** campaign stage to clear: the quest's target ("Clear Main Stage X") or function_info.UnlockStage */
  stage?: string;
  baseLevel?: number;
  jobLevel?: number;
  /** days since character creation */
  accountDay?: number;
  /** UnlockStage is the placeholder 99999, so IsFunctionOpen never passes in this client [code] */
  closed?: true;
}

// ---------------------------------------------------------------- MVP Challenge

/**
 * One MVP difficulty. Clearing it unlocks the next difficulty of the same MVP [data rule text; AutoNextStage].
 * Stats: the MVP's HP is 0.4–1× the whole HP of its tier's campaign stage, as one target [data].
 */
export interface MvpStage extends ModeStage {
  difficulty: number;
  firstClear: DropRow[];
  /** sweep reward (mvp_stage_info.SweepDrops). A sweep pays the highest difficulty cleared [data rule text] */
  repeat: DropRow[];
}

export interface MvpBoss {
  entry: number;
  name: string;
  /** fight_soldier id of the MVP */
  monster: number;
  unlock: Unlock;
  /** sweeps per day for this MVP, counted separately per MVP [data]; +1 with the Kafra Premium Card
   * (ef_mvp_sweep_times) [code MvpModel] */
  dailySweeps: number;
  stages: MvpStage[];
}

export interface MvpMode {
  name: string;
  unlock: Unlock;
  rules: string;
  bosses: MvpBoss[];
}

// ---------------------------------------------------------------- Baphomet Challenge (World Boss)

/**
 * One Baphomet stage, win: "damage". Damage turns into points at `scoreRatio` (score = damage × ratio)
 * [inferred from the rule text]. Killing the boss advances to the next stage; the final stage cannot be killed
 * [code FightActors.AddBoss]. How many fights a day is not in the client.
 */
export interface WorldBossStage extends ModeStage {
  difficulty: number;
  /** stage entry that must be beaten first; null for the first [data] */
  unlockAfter: number | null;
  final: boolean;
  /** world_boss_stage_info.BossHp. Not the fight HP (the lineup's HP differs), meaning unknown */
  bossHp: number;
  scoreRatio: number;
  monster: number;
  /**
   * One-time rewards for first bringing the boss to `hpPercent` of its HP [code WorldBossCfg.ParseFirstReward,
   * WorldBossRewardGroupHelper]; the last pair (0 %) is the kill reward.
   */
  hpRewards: { hpPercent: number; reward: DropRow[] }[];
}

/** A rank tier. The server reports your tier; the client's fallback is the highest `minScore` your best score
 * reaches [code WorldBossCfg.ResolveRankTierRewardCfg]. `maxRank` is the worst rank that keeps the tier, 0 = no
 * rank needed [code GetRankTierRankSpan, data]. Daily and weekly rewards come by mail [data]. */
export interface RankTier {
  entry: number;
  name: string;
  minScore: number;
  maxRank: number;
  daily: DropRow[];
  weekly: DropRow[];
}

export interface WorldBossMode {
  name: string;
  unlock: Unlock;
  rules: string;
  stages: WorldBossStage[];
  tiers: RankTier[];
}

// ---------------------------------------------------------------- Endless Tower

/**
 * One floor (floor n = floors[n - 1]); win: killAll, one round. After a win the next floor starts in place with
 * full HP/MP and a fresh timer [code EndlessTowerStageAdapterFL.ContinueWaveInPlace].
 */
export interface TowerFloor {
  /** fight timer: the floor's RoundTime (15 s, 25 s on boss floors) [code] */
  time: number;
  enemies: EnemyRow[];
  firstClear: DropRow[];
  /** daily sweep reward when this is your highest cleared floor [code EndlessTowerSweepDialog, data rule text] */
  repeat: DropRow[];
  /** boss: first round has BossRaid (every 10th floor) [code]; special: endless_tower_stage_info.Category 1
   * without a boss (every 10th floor + 5), drawn with a special cell [data] */
  kind?: "boss" | "special";
}

/**
 * Threat: [floors cleared today, threat level, index into threatTexts, stat bonus, damage bonus].
 * When today's cleared floors pass a row's count, its task adds attrs to every enemy team; they stack, so these
 * values are running totals [code ActivateThreatSkillTasks, FSTFightSideAttr → AddAttr]. `stat bonus` goes to
 * Base{Hp,PAtk,MAtk,PDef,MDef}MulL6 (1 = +100 %), `damage bonus` to FightDmgIncreased. Resets daily at 0:00 [data].
 */
export type ThreatRow = [
  floorsToday: number,
  level: number,
  text: number,
  statMul: number,
  dmgUp: number,
];

export interface EndlessTowerMode {
  name: string;
  unlock: Unlock;
  rules: string;
  win: "killAll";
  maxOnField: number;
  /** starting a run costs one; consecutive floors in that run are free; no refund on a loss [data rule text,
   * Variables.ENDLESS_TOWER_DAILY_CHALLENGE_COUNT] */
  dailyChallenges: number;
  /** Variables.ENDLESS_TOWER_DAILY_FREE_SWEEP_COUNT; ad sweeps are 0 */
  dailyFreeSweeps: number;
  floors: TowerFloor[];
  threat: ThreatRow[];
  /** "%{1}" = floors cleared today */
  threatTexts: string[];
  /** drop 96500 (Variables.ENDLESS_TOWER_SWEEP_REWARD); the client never reads it, use is unknown */
  sweepFallback: DropRow[];
}

/** A floor as a ModeStage, for code that handles every mode alike. */
export function towerFloor(mode: EndlessTowerMode, floor: number): ModeStage {
  const f = mode.floors[floor - 1];
  return {
    id: `tower-${floor}`,
    entry: floor,
    name: `Floor ${floor}`,
    win: mode.win,
    maxOnField: mode.maxOnField,
    tier: null,
    time: f.time,
    enemies: f.enemies,
    firstClear: f.firstClear,
    repeat: f.repeat,
  };
}

/** The threat in force once `floorsToday` floors are cleared today. */
export function threatAt(mode: EndlessTowerMode, floorsToday: number): ThreatRow {
  let row = mode.threat[0];
  for (const t of mode.threat) if (t[0] <= floorsToday) row = t;
  return row;
}

// ---------------------------------------------------------------- Resource Secret Realms

/** One difficulty. Stages unlock in order [inferred from StageIdx and AutoNextStage]. */
export interface ResStage extends ModeStage {
  difficulty: number;
  /** one challenge ticket of the realm [data] */
  firstClear: DropRow[];
  /** paid by every later clear or sweep, each costing a ticket (res_instance_stage_info.CommonReward)
   * [data, inferred cost] */
  repeat: DropRow[];
}

export interface ResCategory {
  /** 1 Weapon, 2 EXP, 3 Equipment */
  category: number;
  name: string;
  unlock: Unlock;
  /** func_rule text. The Weapon realm's text is a copy of the EXP one (and gives 50 s; the fight is 40 s) */
  rules: string;
  /** FightStageType: category + 2 [code ResInstanceStageAdapterFVBase] */
  stageType: number;
  /** rounds shared by every stage of the realm */
  rounds?: Round[];
  /** each realm has its own ticket: +3 a day while below 10; tickets from elsewhere can exceed it [data];
   * Kafra Premium Card: +3 a week [data monthly_card_info] */
  ticket: { item: ItemKey; dailyRestore: number; restoreCap: number };
  stages: ResStage[];
}

/** res_stage_buff: skill tasks run when a round opens [code FightStageRoundRefreshItem.SetOpen]. The triggers
 * are fight_trigger rows; the bonus each grants is in fight_skill_task, not decoded here. As the help texts put
 * it: Weapon — a bonus every 10 s (3×, both sides); EXP — kill 10 normal mobs within each 10 s window for a big
 * damage bonus; Equipment — every elite kill grants a damage bonus [data]. */
export interface StageBuff {
  entry: number;
  target: "none" | "player" | "attacker" | "defender" | "both";
  tasks: string[];
  triggers: { trigger: Record<string, unknown>; max: number; lifeTime: number }[];
}

export interface ResInstancesMode {
  name: string;
  unlock: Unlock;
  categories: ResCategory[];
  stageBuffs: StageBuff[];
}

// ---------------------------------------------------------------- Dungeon (Team PvE)

/**
 * A 3-player stage, win: killAll. 30 s to clear the mobs, then the boss spawns and the timer restarts at 50 s
 * (`extraTime`). A failed fight costs nothing [data rule text].
 */
export interface TeamStage extends ModeStage {
  difficulty: number;
  /** campaign stage to clear first (UnlockMainStage) [data] */
  unlockStage: string;
  /** clear reward while you have clear attempts (VisibleDrops) [data] */
  repeat: DropRow[];
  /** helper reward once clear attempts are spent (VisibleAssistDrops) [data] */
  assist: DropRow[];
  /** "Random Accessory" quality odds: [accessory quality, chance] from accessory_drop [code TeamPveCfg] */
  accessoryQuality: [quality: number, chance: number][];
  /** monsters the stage card shows (boss first) [data] */
  monsters: number[];
  /** Drops / AssistDrops as stored, e.g. "[[3,0,30101]]"; the first two numbers are not explained */
  rawDrops: [string, string];
}

export interface TeamPveMode {
  name: string;
  unlock: Unlock;
  rules: string;
  /** rewarded clears a day (TEAM_PVE_FREE_COUNT); losses don't count [data] */
  dailyClears: number;
  /** helper clears a day (TEAM_PVE_ASSISTANT_COUNT) */
  dailyAssists: number;
  stages: TeamStage[];
  /** chest track: `points` of Dungeon Achievement Points for each level [data] */
  achievements: { level: number; points: number; reward: DropRow[] }[];
}

// ---------------------------------------------------------------- Guild Hunt (Guild Boss)

/**
 * Score from one fight [code GuildBossStageAdapterFL.CalcFightScoreBySegments]: total damage over all phases is
 * cut at each segment's damage mark; each piece pays floor(piece / damagePerPoint) points; damage past the last
 * mark uses the last segment's divisor.
 */
export function guildBossScore(
  totalDamage: number,
  segments: [damage: number, damagePerPoint: number][],
): number {
  let score = 0;
  let prev = 0;
  for (const [mark, per] of segments) {
    if (totalDamage <= prev) break;
    if (mark > prev) {
      if (per) score += Math.floor((Math.min(mark, totalDamage) - prev) / per);
      prev = mark;
    }
  }
  const last = segments[segments.length - 1];
  if (last && totalDamage > prev && last[1]) score += Math.floor((totalDamage - prev) / last[1]);
  return score;
}

export interface GuildBossTier {
  entry: number;
  name: string;
  /** guild rank needed, 0 = any; with minScore = guild points needed [data] */
  maxRank: number;
  minScore: number;
  /** Privilege Skills given to every member for `days` after the Monday settlement [data] */
  skills: { skill: number; name: string; level: number; text: string; days: number }[];
}

export interface GuildBossMode {
  name: string;
  unlock: Unlock;
  rules: string;
  /** challenges or sweeps a day (GUILD_BOSS_DAILY_CHALLENGE_TIMES); each starts at phase 1 [data] */
  dailyChallenges: number;
  /**
   * The whole fight, win: "damage". Four bosses spawn one after another (round rule 3); 50 s in all; the last
   * one alive is deathless [code GuildBossStageAdapterFL.TryMarkLastRemainingBossDeathless].
   */
  stage: ModeStage;
  /** per phase reached: loot chests brought to the guild and the challenge reward [code GuildCfg
   * GetBossSweepChestCount (chests sum over phases reached), GetBossSweepChallengeDropId] */
  phases: {
    phase: number;
    monster: number;
    name: string;
    chests: number;
    challengeReward: DropRow[];
  }[];
  /** what one loot chest holds (GUILD_BOSS_CHEST_REWARD) */
  chest: DropRow[];
  /** [damage mark, damage per point]; see guildBossScore() */
  scoreSegments: [damage: number, damagePerPoint: number][];
  /** daily cumulative points rewards [data rule text] */
  scoreRewards: { score: number; reward: DropRow[] }[];
  /** guild_boss_damage_reward: same rewards keyed by damage; the client never reads it */
  damageRewards: { damage: number; reward: DropRow[] }[];
  tiers: GuildBossTier[];
}

// ---------------------------------------------------------------- Rune Arena and Guild War (PvP, no stages)

/** Points scale by bracket: a win gains × winMul, a loss loses × lossMul, from the bracket your score is in
 * [inferred from VictoryVar/DefeatVar]. So below 1120 a loss costs nothing. */
export interface ScoreBracket {
  minScore: number;
  winMul: number;
  lossMul: number;
}

/** Elo constants (Variables.ARENA_ELO_* / GVG_ELO_*); expected = 1 / (1 + base^((theirs − yours) / divisor)),
 * change = k × (result − expected) [inferred: standard Elo]. */
export interface Elo {
  base: number;
  divisor: number;
  k: number;
  startScore: number;
}

export interface ArenaMode {
  name: string;
  unlock: Unlock;
  /** 1v1 auto fight; at the timer the higher remaining HP % wins [data] */
  rules: string;
  time: number;
  /** one-time per season on reaching `minScore`; a new season (weekly, Monday 0:00) resets you to
   * `seasonReset` of your tier [data] */
  tiers: {
    entry: number;
    name: string;
    minScore: number;
    seasonReset: number;
    reward: DropRow[];
  }[];
  /** by rank `from`..`to` (inclusive) */
  rankRewards: { from: number; to: number; daily: DropRow[]; season: DropRow[] }[];
  scoreBrackets: ScoreBracket[];
  elo: Elo;
  /** challenge tickets: back up to 5 every day, 5 more a day for 10..30 Diamonds [code Variables] */
  tickets: { item: ItemKey; dailyRestore: number; buyPerDay: number; buyCost: number[] };
  /** reward per fight for the first `perDay` fights a day (ARENA_CHALLENGE_REWARD_*) */
  fightReward: { win: DropRow[]; lose: DropRow[]; perDay: number };
}

export interface GvgMode {
  name: string;
  unlock: Unlock;
  rules: string;
  /** attacks per member per match, never the same stronghold twice [data] */
  attacksPerMatch: number;
  tiers: { entry: number; name: string; minScore: number; seasonReset: number }[];
  /** `to` 0 = no upper bound */
  rankRewards: { from: number; to: number; weekly: DropRow[]; season: DropRow[] }[];
  /** cumulative attacks across seasons [data] */
  progressRewards: { attacks: number; reward: DropRow[] }[];
  /** stronghold tiers by member power: `count` strongholds of this level, points per attack and per break,
   * breaks that score per stronghold [data] */
  strongholds: {
    level: number;
    count: number;
    attackPoints: number;
    breakPoints: number;
    breakTimes: number;
  }[];
  scoreBrackets: ScoreBracket[];
  elo: Elo;
  /** Variables.GVG_CHALLENGE_REWARD (each attack), GVG_MATCH_REWARD_WIN/LOSE, GVG_BYE_REWARD */
  matchRewards: { attack: DropRow[]; win: DropRow[]; lose: DropRow[]; bye: DropRow[] };
  /** match windows in server time [data gvg_open_info] */
  schedule: { season: number; week: number; match: number; open: string; end: string }[];
}

/** public/data/modes.json */
export interface ModesData {
  items: Record<ItemKey, ItemInfo>;
  modes: {
    mvp: MvpMode;
    worldBoss: WorldBossMode;
    endlessTower: EndlessTowerMode;
    resInstances: ResInstancesMode;
    teamPve: TeamPveMode;
    guildBoss: GuildBossMode;
    arena: ArenaMode;
    gvg: GvgMode;
  };
}

// ---------------------------------------------------------------- campaign stage rewards

/** Stat offsets in Enemy's order: patk, matk, pdef, mdef, hp, pveDmg, dmgUp, dmgRed, finalUp, finalRed, hit,
 * flee. Added to the soldier's fight_soldier base (monsters.json `base`) for patk..hp; the rest have no base. */
export type StatRow = [
  patk: number,
  matk: number,
  pdef: number,
  mdef: number,
  hp: number,
  pveDmg: number,
  dmgUp: number,
  dmgRed: number,
  finalUp: number,
  finalRed: number,
  hit: number,
  flee: number,
];

/**
 * stage_idle_monster, one slot [code StageIdleSysFL]: when idling on the stage each slot first spawns
 * rand(spawnMin..spawnMax) single monsters and `groupCount` packs of rand(groupMin..groupMax), round robin; each
 * kill (or wiped pack) is replaced from a random slot that can spawn singles (packs); a monster id is picked from
 * `ids` per spawn. Normal monsters on the field are capped at 20. Idle monsters don't attack on their own
 * (IdleStageAdapterFL.CanSelectTargetProactive).
 */
export type FieldSlot = [
  ids: number[],
  spawnMin: number,
  spawnMax: number,
  groupCount: number,
  groupMin: number,
  groupMax: number,
];

/** The idle field of a stage: what you fight while idling there, as opposed to the boss challenge (stages.json). */
export interface IdleField {
  slots?: FieldSlot[];
  /** stage_idle_monster attrs, given to each idle monster as its parent attr matrix [code StageIdleCompFL,
   * FightActors.AddNormalMonster]; read as offsets on the soldier base [inferred] */
  stats?: StatRow;
  /** stage_elite_monster.eliteGroup: an Elite Summon (Dead Branch) on this stage spawns one of these at random
   * with `eliteStats`; killing it pays the summon's equipment [code StageIdleCompFL.AddRandomEliteMonster via
   * OptionType.EliteMonsterSummon] */
  elites?: number[];
  eliteStats?: StatRow;
}

/**
 * stage_boss_range: the rectangle a non-idle fight takes place in and where the player (and Dungeon teammates)
 * and the boss spawn, in metres relative to the scene [code WorldSizeCompFL.CreateWithBossRange,
 * BossChallengeStageAdapterFL]. Keyed by fight stage, so it covers mode fights too; all campaign stages share
 * one value.
 */
export interface BossArena {
  size: [width: number, length: number];
  player: [x: number, z: number];
  boss: [x: number, z: number];
}

export interface CampaignStageRewards {
  /** stage_info.Entry */
  entry: number;
  /** one-time reward for clearing the stage (FirstDownReward) [code StageListCell]; nothing for later clears */
  firstClear: DropRow[];
  /**
   * While this is your current stage (online or offline). No campaign table pays Zeny: idle Zeny is 0 [data].
   * Bonuses (Kafra cards, guild tech, items) multiply EXP by 1 + percent/100 [code IdleYieldBonusHelper].
   */
  idle: {
    /** IdleExpBase per 10 s tick × 360 [code IdleYieldBonusHelper.CalcExpPerMinute, RevenueBoard] */
    baseExpPerHour: number;
    jobExpPerHour: number;
    /** [item, per hour]: idleNum[i] of idleItem[i] every IDLE_ITEM_DROP_FREQUENCY[i] s (Dead Branch 15 min,
     * Reinforce Metal 30 min, Weapon Gacha Coin 1 h, Diamond 5 min, Speedup Voucher 12 min)
     * [code Variables values, inferred pairing — the server pays it] */
    items: [item: ItemKey, perHour: number][];
    /** [every N hours, card pool key]: idleDrop[0] every 8 h, idleDrop[1] every 3 h [inferred pairing with
     * IDLE_CARD_DROP_FREQUENCY]; pools in StageRewardsData.cardPools */
    cards: [everyHours: number, pool: string][];
  };
  /** in battery-saving mode the client reports this many kills every 15 s (BatterySavingMob) [code
   * BatterySavingRewardController] */
  batterySavingKills: number;
  field?: IdleField;
  /** only when it differs from StageRewardsData.bossArena (never in this client) */
  bossArena?: BossArena;
}

export interface MonthlyCardIdle {
  entry: number;
  name: string;
  /** idle Base / Job EXP +% */
  baseExpPct: number;
  jobExpPct: number;
  /** idle items +% */
  resourcePct: number;
  /** extra offline hours */
  offlineHours: number;
  fastIdleFree: number;
  mvpSweeps: number;
  resTicketsWeekly: number;
}

/** Idle rules [code Variables / FightVariables compiled defaults; the client ships nothing that overrides them]. */
export interface IdleRules {
  tickSeconds: number;
  itemEverySeconds: number[];
  cardEverySeconds: number[];
  /** offline income stops after this many hours (OFFLINE_IDLE_REWARD_TIME) */
  offlineCapHours: number;
  monsterCap: number;
  batterySavingEverySeconds: number;
  /** Quick Idle: one hour of idle income at once [data item text]; free uses, then up to `paidPerDay` more for
   * a Quick Idle Ticket or Diamonds [code AdveIncomeDialog] */
  fastIdle: { freePerDay: number; paidPerDay: number; diamondCost: number[]; ticketItem: ItemKey };
  /** Kafra cards' idle effects [data monthly_card_info] */
  cards: MonthlyCardIdle[];
}

/** public/data/stage-rewards.json */
export interface StageRewardsData {
  items: Record<ItemKey, ItemInfo>;
  idle: IdleRules;
  bossArena: BossArena | null;
  /** idle card pools by first drop id; many stages share one */
  cardPools: Record<string, DropRow[]>;
  /** by "chapter-stage", as stages.json */
  stages: Record<string, CampaignStageRewards>;
}
