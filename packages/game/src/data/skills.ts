// Jobs, levels and skills.
// Data: public/data/jobs.json and public/data/skills.json, written by scripts/export_skills.py from the
// SEA 0.0.163 client tables (career_*, jobLevel_info, baseLevel_info, job_transfer_task_group, task_info,
// fight_skill, fight_skill_cast, fight_bullet_cast, fight_bullet, fight_brand, fight_skill_task(_change),
// fight_trigger, fight_condition, fight_buff, career_skill_attr, awaken_*).
//
// Evidence tags:
//   [code]     read in the decompiled client (GameLogic.dll / Cross.dll); file named where it matters
//   [data]     read from table rows or in-game text
//   [inferred] my conclusion; the server code that does it is not in the client
//
// How one skill hit is priced [code] FightSkillTaskLogic.Hurt, UnifiedCritUtil:
//   hit = formula(part.f)(attacker, target) × (crit ? max(1, CritDmg − CritShield) : 1) × part.mul
//   part.f is the bullet's hurt formula: 3 NormalPHurt / 4 NormalMHurt (normal-attack pools: AtkDmgIncreased,
//   NormalAtkVulnerability), 5 SkillPHurt / 6 SkillMHurt (skill pools), others are custom (see `formulas`).
//   The crit roll uses the SKILL's class: spell 1 (normal attack) rolls CRIT, every other skill rolls Skill CRIT,
//   whatever formula its bullets use. So Double Strafe rolls Skill CRIT but is boosted by normal-attack pools.
//
// Per-cast numbers (`coef`, `hits`) are against ONE isolated target (a lone boss) [code]:
//   - copier casts fire n × w bullets; with TargetNoRepeat (`noRep`) the target pool runs dry after one pick,
//     so a lone target takes 1 of them (Arrow Rain Barrage: 1 marking arrow alone, 2 with a second enemy);
//   - area bullets hit each target once per wave: waves = min(rounds, floor(dur/int)+1, hmax, lim);
//   - child casts chained from a bullet's hit tasks run once per hit, from its attacker tasks once per bullet;
//   - a child gated by a random condition counts as expected value; one gated by a state ("while buff X",
//     "on Skill CRIT") is listed in `parts` with `cond` and left out of coef/hits.
// `targets` = enemies one cast can damage: 0 = everything inside the area (`aoe` radius/width), n = picks.
//
// Cooldown and cast time [code] SkillObj.RefreshCd, FightFormulaTemplate 104:
//   cd   = (base + var) / (1 + min(1, Haste))           first cast of a fight waits cd[0] (StartCooldown, all 0)
//   cast = sing[0] + sing[1] / (1 + Haste)              only skills with sing > 0 channel before firing
//   normal attack interval = 1 / AttackPerSecond         (Haste does not apply)
//   The hero's "Variable Cooldown Reduction" (VariableCooldownPer) does not reach player skills in this build:
//   it is read from the per-skill matrix, which has no hero parent [code] SkillObj.cs:405, FightTeamCompFL.
//   Animation (`anim`, s) is scaled by clamp(0.4 + 0.7·(193 − Aspd)/43, 0.4, 1) when animAttr = 10100 (Aspd),
//   or by clamp(1/(1 + attr), 0.4, 1) for another attr (10200 = Haste); a skill cannot recast faster than that.
//   Skills fire automatically when ready (`auto`); one action at a time, so a 40 s rotation is a queue.
//   SP gates casting: a skill with sp > current SP waits [code] SkillObj.cs:296-301; SP regenerates
//   MpRecovery × MaxSP every 10 s (career base MpRecovery 0.2). CD-0 channel skills (Fire Bolt, Ice Arrow,
//   Hellfire, Ice Spike Piercing) are limited by cast time + animation + SP, not by cooldown.
//
// Skill level L = skill points spent on the node; 1 point per level [code] CareerSkillInfo.CurrSkillPoint.
// A skill at level L runs every fight_brand row with SkillLevel ≤ L [code] SkillObj.GetBrandList; their tasks
// add to per-bullet / per-cast / per-skill attribute matrices. Those additions are `mods` (cumulative at
// each level). Mods from one skill can target another skill's bullets (Wide Arrow Array → Arrow Shower,
// Vulture's Eye → normal attack), so a build's true numbers come from evalSkill(collectMods(...)).
// Per-level `coef`/`hits`/`procs`/`buffs` in the JSON use the skill's own mods only; `boosts` gives what a
// level adds to other skills (with the target at max level).
//
// Power: `br` (SkillBRNum, attr 81000) of every learned skill and awakening tier sums into the power
// formula's layer-2 term with ratio 1.5 for every spec [code + data] (see power.ts / gear.md §4.4).
// Passive stats (`attrs`) go to the hero's attr totals like any other source [inferred: server sums them].

/** "<attr id>:<KeyEn>", e.g. "1101:BasePAtkAddL1"; the suffix (AddL1, MulL2…) names the layer. */
export type AttrKey = string;
export type Attrs = Record<AttrKey, number>;
/** [tier, job level within the tier]; tier 0 Novice, 1 1st job, 2 2nd, 3 2nd advanced, 4 3rd. */
export type JobRef = [tier: number, jobLevel: number];
export type StatName = "str" | "agi" | "vit" | "int" | "dex" | "luk";

// ---------------------------------------------------------------------------------------------
// jobs.json
// ---------------------------------------------------------------------------------------------

export interface JobsData {
  /** Tier names: "0" Novice … "4" 3rd Job ("5" 4th Job exists in text only; no career rows). [data] */
  tiers: Record<string, string>;
  /** One per class line (CareerKind 100 Novice, 200 Swordsman, 300 Magician, 400 Archer, 500 Thief). */
  lines: ClassLine[];
  /** Keyed by spec (career build) id: 11, 21, 22, 31, 32, 41, 42, 51. */
  specs: Record<string, SpecInfo>;
  /** Job change from tier N to N+1, in order. */
  jobChange: JobChange[];
  /** Index = base level − 1 (1..120). */
  baseLevels: BaseLevel[];
  /** In order of the global job-level index `idx` (1..161). */
  jobLevels: JobLevel[];
  /** function_info rows with any unlock gate (base level, stage, main quest, account age). */
  functions: GatedFunction[];
  /** Attribute points [code] HeroPointCell / HeroAddStatusPanel (see attributes.md §4). */
  pointRules: {
    /** cost of the next point in one stat = floor(points already in that stat / 5) + 1 */
    costPerPoint: string;
    /** per spent point (in cost units): flat bonus to these attrs */
    perSpentPoint: Attrs;
  };
}

export interface ClassLine {
  kind: number;
  name: string;
  /** Tiers in order (Novice line has one). */
  jobs: JobTier[];
  /** Spec ids on this line. */
  specs: number[];
}

export interface JobTier {
  /** career_info.Entry, e.g. 401 Archer, 411 Hunter, 421 Sniper, 431 Ranger. */
  career: number;
  tier: number;
  tierName: string;
  name: string;
  front: number | null;
  next: number | null;
  defaultSpec: number;
  /** career_skill node ids shown on the job-change screen. [data] */
  stageSkills: number[];
  /**
   * Career base sources while on this job [data] career_info.attr. Duplicated ids collapse (Max SP 100 is
   * listed twice and counts once; mages list MATK twice and get no PATK base). Tier-dependent: DmgIncreased
   * .01/.02/.03/.04 and BaseHpMulL2 .12/.18/.22/.26.
   */
  base: Attrs;
}

export interface SpecInfo {
  name: string;
  desc: string;
  line: number;
  /** 1 physical, 2 magic; null for builds without a career_spec row. */
  attrTag: number | null;
  icon: number;
  /** Job level that unlocks this spec (22 Spear Knight and 32 Ice Mage: 2nd job lv 1); null = from the start. */
  unlock: JobRef | null;
  /**
   * Recommend-button target ratio [code] AttrPointAllocator: base stat = the one with ratio 1 (else the
   * smallest non-zero); it keeps buying the stat with the largest ratio − alloc/alloc_base while affordable.
   */
  ratio: Record<StatName, number> | null;
  /** career_skill node ids (career_spec.CoreSkills). */
  coreSkills: number[];
  /** fight_skill id of this spec's normal attack [code] IdleStageAdapterFV.NewNormalSkillData. */
  normalAttack: number | null;
  /** true for 42 Shoot Hunter: no career_spec row, its tier 2–3 nodes reuse Swordsman skills. [data + inferred] */
  unreleased: boolean;
}

export interface JobChange {
  fromTier: number;
  toTier: number;
  /** Highest base level any group or task of this tier asks for. */
  baseLevel: number;
  /** Job level task (always the tier's last job level). */
  jobLevel: JobRef | null;
  /** Last main stage the quests ask to clear ("C-S"). */
  stage: string | null;
  /**
   * The change button needs every task of every group of the current tier claimed [code]
   * JobTransPanel.UpdateCanTransferState. A group's tasks open at unlockBaseLevel + unlockStage reached.
   */
  groups: JobQuestGroup[];
}

export interface JobQuestGroup {
  id: number;
  index: number;
  name: string;
  unlockBaseLevel: number;
  unlockStage: string | null;
  unlockText: string;
  /**
   * DmgIncreased / BaseHpMulL2 bonus, CUMULATIVE totals (group 403 = .10 / .99) [data]; the server is
   * assumed to apply the highest completed group only [inferred].
   */
  bonus: Attrs;
  tasks: { id: number; type: number; need: number; text: string }[];
}

export interface BaseLevel {
  lv: number;
  /** EXP needed to reach the next level (0 at the cap). */
  exp: number;
  /** Attribute points granted on reaching this level [inferred: server-side; BasePoint]. */
  points: number;
  cumPoints: number;
  /** ArmorLevelRange: [min item level, max item level, third value unknown] for drops at this level. */
  gear: number[];
  /** baseLevel_info.levelAttr — empty in every row of this build. */
  attrs?: Attrs;
  unlocks?: Unlock[];
}

export interface Unlock {
  type: "cardSlot" | "equipPart" | "function" | "jobQuest";
  id: number;
  name: string;
  /** equipPart: also needs this Elite Summon level [code] FunctionManager.EquipSoltIsUnLock. */
  summonLevel?: number;
  /** jobQuest: also needs this stage cleared. */
  stage?: string;
}

export interface JobLevel {
  tier: number;
  /** Job level within the tier (Novice 1–2, 1st 1–34, 2nd 1–30, 2nd adv 1–45, 3rd 1–50). */
  lv: number;
  /** Global index (jobLevel_info.UnlockJoblevel) that skill unlocks compare against [code] CareerSkillInfo. */
  idx: number;
  /** EXP to the next job level (0 at the cap). */
  exp: number;
  /** Skill points granted at this level; `cumSp` running total (160 by 3rd job 50). [data] */
  sp: number;
  cumSp: number;
  /** jobLevel_info.numAttr/upgradeAttr — all zero in this build, so absent. */
  attrs?: Record<string, number>;
  /** Skills (fight_skill ids) that unlock at this level, per spec. */
  skills?: Record<string, number[]>;
}

export interface GatedFunction {
  id: number;
  name: string;
  baseLevel?: number;
  /** "C-S" main stage; null with closed = not open in this build ("Stay tuned"). */
  stage?: string | null;
  mainQuest?: number;
  /** Days since account creation. */
  accountDay?: number;
  /** Compared with the job level WITHIN the tier [code] FunctionManager.IsFunctionOpen; unused in this build. */
  jobLevel?: number;
  closed?: boolean;
}

// ---------------------------------------------------------------------------------------------
// skills.json
// ---------------------------------------------------------------------------------------------

export interface SkillsData {
  /** fight_formula id → key for every hurt formula a bullet uses. */
  formulas: Record<string, string>;
  /** Skill trees keyed by spec id. */
  specs: Record<string, SpecTree>;
  /** Keyed by fight_skill id: every career skill, every awakening skill, every spec's normal attack. */
  skills: Record<string, Skill>;
  /** fight_bullet_cast rows reachable from those skills. */
  casts: Record<string, BulletCast>;
  /** fight_bullet rows reachable from those casts. */
  bullets: Record<string, Bullet>;
  triggers: Record<string, Trigger>;
  buffs: Record<string, Buff>;
}

export interface SpecTree {
  name: string;
  line: number;
  normal: number | null;
  unreleased: boolean;
  /** Tree nodes in tier, idx order. */
  nodes: SkillNode[];
  awaken: AwakenLine[];
}

export interface SkillNode {
  /** career_skill.Entry (what stageSkills/coreSkills reference). */
  node: number;
  /** fight_skill id → SkillsData.skills. */
  skill: number;
  /** 1 active (goes in a use slot), 2 passive (always on once learned). [data] */
  kind: 1 | 2;
  career: number;
  /** Job tier the node belongs to; locked until you reach it [code] CareerSkillInfo.HasLockSkillAllocated. */
  tier: number;
  idx: number;
  /**
   * The game's auto-allocate order inside a tier [code] SkillAutoAllocator: first 1 point into every
   * unlocked skill by idx, then fill to max in this order.
   */
  autoOrder: number;
  /** [row, col] in the 3-wide tree grid. */
  grid: number[];
  /** Max level (5 or 10); one skill point per level. */
  max: number;
  /** Extra job-level gate inside the tier; null = available on reaching the tier. */
  unlock: JobRef | null;
  /** Prerequisite [skill id, level it must reach]. */
  front: [skill: number, level: number] | null;
}

export interface AwakenLine {
  id: number;
  name: string;
  desc: string;
  icon: number;
  /** The gate attr; tiers compare its FINAL value (after all sources) with `need` [data + code AwakenCfg]. */
  gate: AttrKey;
  /**
   * Tiers ≤ the activated index count. A skill tier adds `skill` at level 1 [code] AwakenCfg.
   * GetActivatedPassiveSkills; stat tiers are summed [inferred]. Gear that drops the gate below `need`
   * switches tiers off [code] EquipPowerCompare.IsAwakenAttrDecline.
   */
  tiers: { idx: number; need: number; skill?: number; attrs: Attrs }[];
}

export interface Skill {
  name: string;
  /** Icon asset id (string as in the table). */
  icon: string;
  /** SpellKind: 1 normal attack, 2 active, 3 passive. [data] */
  spell: 1 | 2 | 3;
  /** [StartCooldown, BaseCooldown, VariableCooldown] seconds, before brand mods (see level.cd). */
  cd: [number, number, number];
  /** [BaseSingTime, VariableSingTime] seconds. */
  sing: [number, number];
  /** SP (MP) cost per cast. */
  sp: number;
  range: number;
  /** Default cast states; SkillObj cycles them cast by cast [code]. Mods ['st', …] replace the list. */
  states: number[];
  max: number;
  /** Total action time of the first cast state, seconds at Aspd/Haste 0. */
  anim?: number;
  /** Attr that shortens the animation (10100 Aspd, 10200 Haste). */
  animAttr?: number;
  /** Delay from cast start to the first bullet, seconds. */
  fireAt?: number;
  /** Cast links emitted per cast state (including states only reachable through mods). */
  emits?: Record<string, CastLink[]>;
  /** IsActive: auto-cast when ready. */
  auto?: 1;
  /** fight_condition id the skill needs before it can be cast (e.g. enemy within range). */
  cond?: string;
  /** Skill this passive upgrades (fight_brand.EnhanceSkillEntry). */
  enhances?: number;
  /**
   * Learning this skill disables every brand (all level effects) of skill `replaces` [code]
   * FightBrandSysFL.ApplyBrandReplace. Sonic Blast → Increase ASPD, Wolf Assault → Lightning Impact.
   */
  replaces?: number;
  /** awaken_info ids that grant this skill (level 1). */
  awaken?: number[];
  normal?: 1;
  /** Index = level − 1. */
  lv: SkillLevel[];
}

export interface SkillLevel {
  /** In-game level text with numbers filled (first fight_brand row of the level, as SkillBasePanel shows). */
  desc: string;
  /** SkillBRNum (power) at this level [data] career_skill_attr. */
  br?: number;
  /** Other career_skill_attr stats at this level — totals, not increments. [data] */
  attrs?: Attrs;
  /**
   * career_skill_attr.EffectCondition when not 1. Only 2 (with UniquePassive 1) on Increase ASPD and Sonic
   * Blast: their stats apply as an "equip effect" while the active is slotted, and only one of the two
   * counts — from the skill text [data]; no client code reads these fields [inferred].
   */
  attrsWhen?: number;
  /** Total damage multiplier per cast against one isolated target (Σ part.mul × part.hits). */
  coef?: number;
  /** Damage instances on that target per cast. */
  hits?: number;
  /** 0 = every enemy in the area, n = up to n picked enemies, 1 = single target. */
  targets?: number;
  /** Largest area radius (circle/sector) or width (rect), metres. */
  aoe?: number;
  parts?: Part[];
  /** Coef/hits are the mean over this many cycling cast states. */
  stateAvg?: number;
  /** 'conditional' (some parts gated, see Part.cond), 'unboundedArea' (area with no wave limit: counted once). */
  flags?: string[];
  /** [base, var] after this skill's own cooldown mods, when they differ from Skill.cd. */
  cd?: [number, number];
  sing?: [number, number];
  /** Triggers this level installs (passive procs, on-cast follow-ups, buff-borne effects). */
  procs?: Proc[];
  /** Buffs/debuffs this skill applies, with values at this level. */
  buffs?: BuffValue[];
  /** Cumulative brand mods at this level (input to collectMods/evalSkill). */
  mods?: SkillMod[];
  /** What this level adds to OTHER skills (target at its max level; normal attack at 1). */
  boosts?: Boost[];
}

export interface Part {
  /** Bullet id. */
  b: number;
  /** BulletAttrAttackMul = (AttrAttackMul + ΣAddL1) × (1 + ΣMulL2) [code] FightTeamCompFL + AttrTX. */
  mul: number;
  /** Instances on one isolated target per cast (expected value if randomly gated). */
  hits: number;
  /** Hurt formula id (see SkillsData.formulas). */
  f: number;
  /** Area radius/width; absent = single-target bullet. */
  r?: number;
  shape?: "rect" | "sector";
  /** Targets: 0 = whole area; absent = 1. */
  tg?: number;
  /** Present = only when the condition holds; not in coef/hits. `crit` = needs this cast's Skill CRIT
   *  (expected extra = critChance × mul × hits); `buff` = needs that buff on the caster. */
  cond?: Chance;
}

export interface Proc {
  /** Trigger id → SkillsData.triggers. */
  id: string;
  /** Event (FTR… without prefix), e.g. DoBulletHurtAfter (a bullet of yours hit), DoSkillAfter (you cast). */
  on: string;
  /**
   * Chance per event from THIS skill's mods (0 when another skill sets it; recompute with procChance()).
   * Plus LUK scaling when chanceStat = [attr, per, k]: chance + stat/per × k (continuous, no floor) [code]
   * FightFormulaTemplate.BulletCastProbability.
   */
  chance?: number;
  chanceStat?: [attr: number, per: number, k: number];
  /** fight_condition id when the gate is not a random roll (buff present, mark count…). */
  cond?: string;
  /** Fires on every Nth event (Wolf Assault: every 14 normal attacks). */
  every?: number;
  /** Internal cooldown, seconds. */
  cd?: number;
  /** Damage when it fires (same lone-target rules as Part). */
  coef?: number;
  hits?: number;
  f?: number;
  flags?: string[];
}

export interface BuffValue {
  /** Buff id → SkillsData.buffs. */
  id: string;
  /** self = on you, target = on the enemy (debuff). [data: task Actor; inferred for task-less debuffs] */
  on: "self" | "target";
  /** Seconds: (Duration + Σ200000 + Σ200100) × (1 + Σ200110) [code] FightTeamCompFL buff matrix + AttrTX.
   *  ≥ 99999 means it lasts the whole fight. */
  dur: number;
  /** Attr values while the buff is up, at this level, per stack (Fight* attrs are in-fight multipliers). */
  attrs?: Attrs;
  /** Max stacks: CoverLayer + Σ200300. */
  stack?: number;
  /** Coefficient change for skills while the buff is up (state switches, bullet mods inside the buff). */
  boosts?: Boost[];
}

export interface Boost {
  skill: number;
  /** Level of the boosted skill the delta was computed at. */
  atLv: number;
  /** Change in that skill's per-cast coef (lone target). */
  dCoef: number;
  /** Its new [base, var] cooldown, when changed. */
  cd?: [number, number];
  dHits?: number;
  /** The boost applies only while this buff is up. */
  whileBuff?: string;
}

/**
 * One brand effect. Numeric kinds are summed per (kind, target, attr) across levels and skills.
 *  ['b', bullet, attr, v]   bullet matrix: 100002 coef AddL1, 100003 coef MulL2, 100600 radius, 100900 rounds,
 *                           100800 duration, 100700 interval, 14101 skill crit on that bullet …
 *  ['c', cast, attr, v]     bullet-cast matrix: 101200 copies, 101300 waves, 101900 chain, 101500 proc chance
 *  ['s', skill, attr, v]    skill matrix: 13201/13202 BaseCooldown Add/Mul, 13301/13302 VariableCooldown,
 *                           13902/13903, 14002/14003 sing time …
 *  ['a', 0, attr, v]        hero attr in fight
 *  ['bf', buff, attr, v]    buff matrix: 200100 duration add, 200110 duration mul, 200000 duration
 *  ['bp', buff, param, v]   buff param add (buff attr values: see Buff.params)
 *  ['bp+', buff, attrKey, v] extra attr added to a buff
 *  ['tp', trigger, param, v] / ['p', task, param, v] / ['ta', trigger, attr, v]
 *  ['st', skill, states]    replace a skill's cast states (last one wins)
 *  ['tr', trigger, ('buff'|'bullet', id)?]  install a trigger (optionally attached to a buff / bullet)
 *  ['hit', bullet, cast]    extra cast on each hit of that bullet
 *  ['tcast', trigger, cast] extra cast when that trigger fires
 *  ['hbuff', bullet, buff] / ['tbuff', trigger, buff]  extra buff applied by a bullet / trigger
 *  ['buff', buff]           buff applied at fight start
 *  ['bmod', buff, mod]      `mod` applies only while `buff` is up
 *  ['bst', buff, skill, states]  replaces the state switch `buff` makes
 *  ['fx', kind, …]          effect the export does not model (named only)
 */
export type SkillMod = [string, ...unknown[]];

/** Cast id, or [cast id, gate] when a condition gates it. */
export type CastLink = number | [number, Chance];
/** {p}: fixed chance. {cast}: chance = that cast's attr 101500 (+ stat/per × k). {cond}: not random. */
export type Chance =
  | { p: number }
  | { cast: number; stat?: number; per?: number; k?: number }
  | { cond: string; buff?: string; crit?: 1 };

export interface BulletCast {
  /** Bullet id. */
  b: number;
  /** BulletScriptKey: 1/2/6/9/11/12 are area scripts, 3/5/7/8 single-target, 4 multi-link. [code] */
  scr: number;
  /** CopierNum (bullets per wave; 0 = no copier, one bullet). */
  n?: number;
  /** CopierWave (waves). */
  w?: number;
  wi?: number;
  /** ChainCount (extra bounces to other targets). */
  ch?: number;
  /** BulletTargetType: 31 current target; 100–251 pick other enemies (random/nearest). [data] */
  tgt?: number;
  range?: number;
  /** TargetNoRepeat: each copy needs a different enemy. */
  noRep?: 1;
}

export interface Bullet {
  /** AttrAttackMul (base coefficient). */
  mul: number;
  /** Hurt formula id; absent = deals no damage (buff carrier, etc.). */
  f?: number;
  /** DamageType 1 physical, 2 magic. */
  dt?: number;
  /** Collide radius (rect: width), length, sector angle. */
  r?: number;
  len?: number;
  ang?: number;
  rect?: number[];
  /** CollideRoundLimit, CollideInterval, CollideDuration, CollideLimit (total hits), RoleHitedMax/Interval. */
  rounds?: number;
  int?: number;
  dur?: number;
  lim?: number;
  hmax?: number;
  hint?: number;
  start?: number;
  tags?: number[];
  /** IgnoreEvasion: cannot miss. */
  sure?: 1;
  /** Casts run on each target hit / once per bullet (attacker tasks). */
  hit?: CastLink[];
  fire?: CastLink[];
  buffs?: string[];
  fx?: string[];
}

export interface Trigger {
  on: string;
  /** Event filter, e.g. {bullets:[4010001]} = your normal-attack arrow, {spellKinds:[1]} = normal attacks. */
  filter?: Record<string, unknown>;
  every?: number;
  cd?: number;
  max?: number;
  life?: number;
  chance?: Chance;
  casts?: CastLink[];
  buffs?: string[];
  fx?: string[];
  params?: Record<string, number>;
}

export interface Buff {
  dur: number;
  /** BuffKind (1 buff, 2 debuff / mark). */
  kind?: number;
  stack?: number;
  on: "self" | "target";
  /** Attr values at base (brand 'bp' mods add to the params). */
  attrs?: Attrs;
  /** param name → attr key it feeds. */
  params?: Record<string, AttrKey>;
  casts?: number[];
  triggers?: string[];
  /** Mods that hold while the buff is up (same shapes as SkillMod). */
  mods?: SkillMod[];
  fx?: string[];
}

// ---------------------------------------------------------------------------------------------
// Helpers (pure). evalSkill mirrors export_skills.py eval_skill, so evalSkill(d, id, lv.mods) reproduces
// the exported per-level coef/hits.
// ---------------------------------------------------------------------------------------------

/** Seconds between casts when the skill is always ready: (base + var) / (1 + min(1, Haste)). [code] */
export function skillCooldown(cd: [number, number], haste: number): number {
  return (cd[0] + cd[1]) / (1 + Math.min(1, haste));
}

/** Channel time before the skill fires: base + var / (1 + Haste). [code] fight_formula 100 */
export function castTime(sing: [number, number], haste: number): number {
  return sing[0] + sing[1] / (1 + haste);
}

/** Proc chance with its stat term (e.g. LUK / 7 × 1%). [code] */
export function procChance(p: Proc, stat = 0): number {
  const s = p.chanceStat;
  return Math.min(1, (p.chance ?? 0) + (s ? (stat / s[1]) * s[2] : 0));
}

/**
 * All mods of a build: levels = {fight skill id: level} for every learned skill, plus awakening skills at 1.
 * Brands of a skill named by another learned skill's `replaces` are dropped [code].
 */
export function collectMods(d: SkillsData, levels: Record<number, number>): SkillMod[] {
  const learned = Object.entries(levels).filter(([, lv]) => lv > 0);
  const replaced = new Set(learned.map(([id]) => d.skills[id]?.replaces).filter((x) => x));
  const out: SkillMod[] = [];
  for (const [id, lv] of learned) {
    const s = d.skills[id];
    if (!s || replaced.has(Number(id))) continue;
    out.push(...(s.lv[Math.min(lv, s.lv.length) - 1]?.mods ?? []));
  }
  return out;
}

/** The mods a buff adds while it is up, given the build's mods ('bmod' / 'bst'). */
export function buffMods(d: SkillsData, buffId: string, mods: SkillMod[]): SkillMod[] {
  const own = [
    ...(d.buffs[buffId]?.mods ?? []),
    ...mods.filter((m) => m[0] === "bmod" && m[1] === buffId).map((m) => m[2] as SkillMod),
  ];
  const over = new Map(
    mods.filter((m) => m[0] === "bst" && m[1] === buffId).map((m) => [m[2] as number, m[3]]),
  );
  const out = own.map((m) =>
    m[0] === "st" && over.has(m[1] as number)
      ? (["st", m[1], over.get(m[1] as number)] as SkillMod)
      : m,
  );
  for (const [sk, st] of over)
    if (!own.some((m) => m[0] === "st" && m[1] === sk)) out.push(["st", sk, st]);
  return out;
}

const AREA_SCRIPTS = new Set([1, 2, 6, 9, 11, 12]);
const PICK_TARGETS = new Set([100, 101, 102, 103, 150, 151, 152, 153, 154, 200, 250, 251]);
const NUMERIC = new Set(["b", "c", "s", "a", "bf", "ta", "bp", "tp", "p", "bp+"]);

class ModIndex {
  v = new Map<string, number>();
  states = new Map<number, number[]>();
  hit = new Map<number, CastLink[]>();
  constructor(mods: SkillMod[]) {
    for (const m of mods) {
      if (NUMERIC.has(m[0])) {
        const k = `${m[0]}|${m[1]}|${m[2]}`;
        this.v.set(k, (this.v.get(k) ?? 0) + (m[3] as number));
      } else if (m[0] === "st") this.states.set(m[1] as number, m[2] as number[]);
      else if (m[0] === "hit")
        this.hit.set(m[1] as number, [...(this.hit.get(m[1] as number) ?? []), m[2] as number]);
    }
  }
  g(kind: string, target: number | string, attr: number | string): number {
    return this.v.get(`${kind}|${target}|${attr}`) ?? 0;
  }
}

function linkChance(c: Chance, M: ModIndex): number | null {
  if ("p" in c) return c.p;
  if ("cast" in c) return Math.min(1, M.g("c", c.cast, 101500));
  return null;
}

function areaHits(b: Bullet, M: ModIndex, id: number): number | null {
  const rounds = (b.rounds ?? 0) + M.g("b", id, 100900);
  const dur = (b.dur ?? 0) + M.g("b", id, 100800);
  const itv = (b.int ?? 0) + M.g("b", id, 100700);
  let w = rounds > 0 ? rounds : Infinity;
  if (dur > 0 && itv > 0) w = Math.min(w, Math.floor(dur / itv + 1e-6) + 1);
  if (b.hmax) w = Math.min(w, b.hmax);
  if (b.hint && dur > 0) w = Math.min(w, Math.floor(dur / b.hint + 1e-6) + 1);
  if (b.lim) w = Math.min(w, b.lim);
  return Number.isFinite(w) ? w : null;
}

interface EvalPart extends Part {
  r: number;
  tg: number;
}

function evalCast(
  d: SkillsData,
  cid: number,
  M: ModIndex,
  mult: number,
  parts: EvalPart[],
  flags: Set<string>,
  depth: number,
  chance: number,
  cond?: Chance,
) {
  const c = d.casts[cid];
  if (!c || depth > 6) return;
  const bid = c.b;
  const b = d.bullets[bid] ?? { mul: 0 };
  let total = 1;
  let lone = 1;
  if ((c.n ?? 0) > 0) {
    const n = Math.max(0, Math.round((c.n ?? 0) + M.g("c", cid, 101200)));
    const w = Math.max(1, Math.round((c.w ?? 0) + M.g("c", cid, 101300)));
    total = n * w;
    lone = c.noRep ? Math.min(1, total) : total;
  }
  const chain = (c.ch ?? 0) + M.g("c", cid, 101900);
  const area = AREA_SCRIPTS.has(c.scr);
  let per = area ? areaHits(b, M, bid) : 1;
  if (per === null) {
    flags.add("unboundedArea");
    per = 1;
  }
  const hits = mult * lone * per;
  const tg = area
    ? (b.lim ?? 0)
    : (c.tgt !== undefined && PICK_TARGETS.has(c.tgt) ? total : 1) + Math.trunc(chain);
  if (b.f) {
    const mul = (b.mul + M.g("b", bid, 100002)) * (1 + M.g("b", bid, 100003));
    const r = area ? (b.r ?? 0) + M.g("b", bid, 100600) : 0;
    const shape = area ? (b.len ? "rect" : b.ang ? "sector" : undefined) : undefined;
    parts.push({
      b: bid,
      mul,
      hits: hits * chance,
      f: b.f,
      r,
      tg,
      ...(shape ? { shape } : {}),
      ...(cond ? { cond } : {}),
    });
  }
  const groups: [CastLink[], number][] = [
    [[...(b.hit ?? []), ...(M.hit.get(bid) ?? [])], hits],
    [b.fire ?? [], mult * lone],
  ];
  for (const [links, m] of groups) {
    for (const link of links) {
      let cc = link as number;
      let ch: number | null = 1;
      let cd = cond;
      if (Array.isArray(link)) {
        cc = link[0];
        ch = linkChance(link[1], M);
        if (ch === null) {
          flags.add("conditional");
          ch = 1;
          cd = cond ?? link[1];
        }
      }
      evalCast(d, cc, M, m, parts, flags, depth + 1, chance * ch, cd);
    }
  }
}

export interface SkillEval {
  /** Mean per-cast coefficient over the cast states in use, lone target. */
  coef: number;
  hits: number;
  aoe: number;
  /** 0 = whole area. */
  targets: number;
  /** Parts of every state in use (cond parts included, flagged). */
  parts: Part[];
  flags: string[];
}

/** Per-cast damage of `skillId` under `mods` (a skill's own lv.mods, or collectMods(...) for a build). */
export function evalSkill(d: SkillsData, skillId: number, mods: SkillMod[]): SkillEval | null {
  const s = d.skills[skillId];
  if (!s?.emits) return null;
  const M = new ModIndex(mods);
  const states = M.states.get(skillId) ?? s.states;
  const flags = new Set<string>();
  const all: EvalPart[] = [];
  let coef = 0;
  let hits = 0;
  let aoe = 0;
  let targets = 1;
  let n = 0;
  for (const st of states) {
    const links = s.emits[String(st)];
    if (!links) continue;
    n++;
    const parts: EvalPart[] = [];
    for (const link of links) {
      let cc = link as number;
      let ch: number | null = 1;
      let cd: Chance | undefined;
      if (Array.isArray(link)) {
        cc = link[0];
        ch = linkChance(link[1], M);
        if (ch === null) {
          flags.add("conditional");
          ch = 1;
          cd = link[1];
        }
      }
      evalCast(d, cc, M, 1, parts, flags, 0, ch, cd);
    }
    for (const p of parts) {
      if (p.cond) continue;
      coef += p.mul * p.hits;
      hits += p.hits;
      aoe = Math.max(aoe, p.r);
      if (p.r && !p.tg) targets = 0;
      else if (targets) targets = Math.max(targets, p.tg);
    }
    all.push(...parts);
  }
  if (!n || !all.length) return null;
  return {
    coef: coef / n,
    hits: hits / n,
    aoe,
    targets,
    parts: all.map(({ r, tg, ...p }) => ({
      ...p,
      ...(r ? { r } : {}),
      ...(tg !== 1 ? { tg } : {}),
    })),
    flags: [...flags],
  };
}

/** [base, var] cooldown of a skill under `mods`: (cfg + AddL1) × (1 + MulL2) for each. [code] AttrTX */
export function skillCdUnder(d: SkillsData, skillId: number, mods: SkillMod[]): [number, number] {
  const s = d.skills[skillId];
  const M = new ModIndex(mods);
  return [
    (s.cd[1] + M.g("s", skillId, 13201)) * (1 + M.g("s", skillId, 13202)),
    (s.cd[2] + M.g("s", skillId, 13301)) * (1 + M.g("s", skillId, 13302)),
  ];
}
