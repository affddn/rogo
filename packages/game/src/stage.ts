// Stage clear model.
// A stage is cleared when every enemy dies within its time limit (40 s on campaign stages, the boss group
// arrives at 20 s). work(stage) = sum(count * HP / mean hit); a character's capacity is the work it gets
// through in one fight. Growing flat stats (ATK, refine ATK, HP, DEF) by g raises damage through the exact
// hit formula and power by g.
import { meanHit } from "./damage";
import type { Profile } from "./profile";
import { REFERENCE } from "./reference";
import type { Stage } from "./types";

export function work(profile: Profile, stage: Stage, scale = 1): number {
  let w = 0;
  for (const e of stage.enemies) w += (e.count * e.hp) / meanHit(profile, e, scale);
  return w;
}

export interface Calibration {
  /** the stage the capacity was measured on; the drift below is anchored there */
  stage: Stage;
  /** work the character gets through in one fight */
  cap: number;
  /** fight: a lost stage and how much got done. cleared: between the furthest clear and the stage after
   * it. reference: no progress given, so the reference fight, scaled by attack frequency. */
  source: "fight" | "cleared" | "reference";
}

/** The stage after `id` in campaign order. */
const after = (stages: Map<string, Stage>, id: string) => {
  const list = [...stages.values()];
  const i = list.findIndex((s) => s.id === id);
  return i >= 0 ? list[i + 1] : undefined;
};

export function calibrationOf(profile: Profile, stages: Map<string, Stage>): Calibration | null {
  const { stuck, cleared } = profile.progress;
  const fight = stuck && stages.get(stuck.stage);
  if (stuck && fight)
    return { stage: fight, cap: stuck.done * work(profile, fight), source: "fight" };
  const done = cleared ? stages.get(cleared) : undefined;
  if (done) {
    // cleared that one, not the next yet: the geometric middle of the two
    const next = after(stages, done.id);
    const lo = work(profile, done);
    return {
      stage: done,
      cap: next ? Math.sqrt(lo * work(profile, next)) : lo,
      source: "cleared",
    };
  }
  const ex = REFERENCE.progress.stuck!;
  const ref = stages.get(ex.stage);
  if (!ref) return null;
  const hits = ex.done * work(REFERENCE, ref);
  return {
    stage: ref,
    cap: hits * (profile.stats.atkFreq / REFERENCE.stats.atkFreq),
    source: "reference",
  };
}

export const capacity = (profile: Profile, stages: Map<string, Stage>) =>
  calibrationOf(profile, stages)?.cap ?? 0;

/** The flat-stat multiplier g at which work(stage) fits the capacity. */
export function neededScale(profile: Profile, stage: Stage, cap: number): number {
  if (!cap) return Number.NaN;
  let lo = 1e-3;
  let hi = 1e9;
  for (let i = 0; i < 80; i++) {
    const mid = Math.sqrt(lo * hi);
    if (work(profile, stage, mid) > cap) lo = mid;
    else hi = mid;
  }
  return hi;
}

// Cross-account calibration, from real clears:
// - The reference Archer (8.38M) lost 6-10 with ~96% done: the raw model's anchor.
// - A Lord Knight account, real / raw: 9-6 cleared ~88M (0.54), 10-1 cleared 125M (0.47),
//   10-9 cleared ~259M (0.58), 10-10 lost at 262M; 9-12 chapter boss cleared ~120M (1.07).
// Growing accounts gain rate stats (DMG Boost and the like), so the power a stage needs falls behind the
// raw scaling: the factor drifts from 1 at the anchor to 0.53 by ~19x the anchor's power. Chapter bosses
// are one target, so AoE does not help: they need ~2x what a wave stage of the same raw size needs.
export const DRIFT = { late: 0.53, span: 163.4 / 8.6, bossFactor: 1.07 / 0.53 };

export function driftFactor(rawRatio: number): number {
  if (rawRatio <= 1) return 1;
  if (rawRatio >= DRIFT.span) return DRIFT.late;
  return DRIFT.late ** (Math.log(rawRatio) / Math.log(DRIFT.span));
}

export interface StageEstimate {
  id: string;
  /** power if only flat stats grow */
  raw: number;
  /** power estimate with the cross-account calibration */
  power: number;
  /** share of the stage's enemy HP you get through now (1 = clears) */
  progress: number;
  basis: "anchored" | "fit" | "interpolated" | "extrapolated";
}

export function estimateAll(profile: Profile, stages: Stage[]): StageEstimate[] {
  const byId = new Map(stages.map((s) => [s.id, s]));
  const cal = calibrationOf(profile, byId);
  const cap = cal?.cap ?? 0;
  const calRaw = cal ? profile.power * neededScale(profile, cal.stage, cap) : profile.power;
  const out: StageEstimate[] = [];
  let prevRaw = 0;
  for (const s of stages) {
    const g = neededScale(profile, s, cap);
    const raw = profile.power * g;
    // a chapter boss follows its chapter's waves, so it drifts with them
    const level = Math.max(raw, s.chapterBoss ? prevRaw : 0);
    const power = raw * driftFactor(level / calRaw) * (s.chapterBoss ? DRIFT.bossFactor : 1);
    const ratio = level / calRaw;
    out.push({
      id: s.id,
      raw,
      power,
      progress: cap ? Math.min(1, cap / work(profile, s)) : 0,
      // the Lord Knight's clears sit at raw ratios ~13-57 of the anchor
      basis:
        ratio <= 1.3
          ? "anchored"
          : ratio < 10
            ? "interpolated"
            : ratio < 60
              ? "fit"
              : "extrapolated",
    });
    prevRaw = raw;
  }
  return out;
}

/** The furthest stage in a row that the current stats clear. */
export function furthestClear(
  estimates: StageEstimate[],
  power: number,
): StageEstimate | undefined {
  let last: StageEstimate | undefined;
  for (const e of estimates) {
    if (e.power > power) break;
    last = e;
  }
  return last;
}

/** The enemy with the HP bar, or the first of the boss group. */
export function bossOf(stage: Stage) {
  return stage.enemies.find((e) => e.hpBar) ?? stage.enemies.find((e) => e.boss);
}

export const enemyHp = (stage: Stage) => stage.enemies.reduce((a, e) => a + e.count * e.hp, 0);
