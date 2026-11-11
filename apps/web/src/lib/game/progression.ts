// Decision core for the long-running progression job. Pure and runtime-agnostic: the bridge job
// runner interprets its commands, and progression.tla models the same states and transitions.
import { fightEligible, hasAutoIdentity, stamp } from "./daily-autorun.ts";
import type { Receipt, Review, Run, Scan, Step } from "./daily-types.ts";

export type ProgressOptions = {
  classSwitch: boolean;
  specSwitch: boolean;
  statReset: boolean;
  dailies: boolean;
  freeListings: boolean;
  assist: boolean;
  maxActions?: number | null;
  maxMinutes?: number | null;
};
export const DEFAULT_PROGRESS_OPTIONS: ProgressOptions = {
  classSwitch: true,
  specSwitch: true,
  statReset: true,
  dailies: true,
  freeListings: true,
  assist: false,
};
// Rescans must land inside both five-minute idle timers (bridge and Python worker).
export const WAIT_STEPS_MS = [30_000, 60_000, 120_000, 240_000];
export const MAX_CONSECUTIVE_REJECTIONS = 3;
export const MIN_ACTION_GAP_MS = 2_000;
// Build-change levers re-arm only after the original build's power rises by this many percent
// since that lever was last pulled. Smaller rises (claims) only retry the boss on that build.
export const LEVER_REARM_PERCENT = 3;
// Worker errors raised before anything was sent for a routine.run selection.
const NOTHING_SENT = new Set([
  "routine_scan_expired",
  "routine_invalid_selection",
  "routine_one_mode_only",
  "bridge_busy",
]);
const SESSION_ENDED = new Set([
  "session_closed",
  "session_lost",
  "operation_timeout",
  "worker_protocol",
  "response_too_large",
  "reply_too_large",
  "snapshot_invalid",
  "session_required",
]);

export type Purpose =
  | "claim"
  | "idle"
  | "offer"
  | "stats"
  | "skills"
  | "loadout"
  | "advance"
  | "campaign"
  | "rebuild"
  | "spec"
  | "class"
  | "revert"
  | "sweep"
  | "fight"
  | "assist";
export type Planned = {
  step: Step;
  purpose: Purpose;
  reason: string;
  // Reserved before sending, so a lost outcome can never be retried under the same key.
  fight?: string;
  lever?: string;
  basis?: string;
  power: string;
  day: string;
};
export type Command =
  | { type: "scan" }
  | { type: "prepare"; plan: Planned; scanId: string }
  | { type: "execute"; plan: Planned; review: Review }
  | { type: "wait"; ms: number }
  | { type: "stop" };
export type JobEvent =
  | { type: "start" }
  | { type: "scanned"; scan: Scan; now: number }
  | { type: "prepared"; review: Review }
  | { type: "executed"; run: Run }
  | { type: "failed"; code: string; sent: boolean }
  | { type: "woke"; now: number }
  | { type: "stopRequested" }
  | { type: "sessionEnded" };
export type LogLevel = "info" | "decision" | "action" | "result" | "wait" | "warn" | "error";
export type LogDraft = {
  level: LogLevel;
  text: string;
  step?: string;
  receipt?: { status: Receipt["status"]; command: number; won?: boolean; note?: string };
};
type BuildId = { career: number; spec: number; line: number };
export type Stall = { id: number; stage: number; origin: BuildId; basis: string };
export type GroupUse = { day: string; available: number; lost: boolean };
export type JobState = {
  phase: "idle" | "scanning" | "preparing" | "executing" | "waiting" | "stopped";
  options: ProgressOptions;
  startedAt: number;
  identity: { sessionId: string; characterId: string; realm: string } | null;
  expected: BuildId | null;
  stopRequested: boolean;
  stopReason: string | null;
  uncertain: boolean;
  plan: Planned | null;
  scans: number;
  stage: number | null;
  power: string | null;
  stall: Stall | null;
  stallCount: number;
  tried: string[];
  pulled: Record<string, string>;
  resets: string[];
  blocked: string[];
  seen: string[];
  groups: Record<string, GroupUse>;
  assists: Record<string, number>;
  rejections: number;
  waitIndex: number;
  notes: string[];
  counters: { actions: number; clears: number; defeats: number; rejected: number };
};
export type Reduction = { state: JobState; command: Command | null; log: LogDraft[] };

export function initialState(options: ProgressOptions, now: number): JobState {
  return {
    phase: "idle",
    options,
    startedAt: now,
    identity: null,
    expected: null,
    stopRequested: false,
    stopReason: null,
    uncertain: false,
    plan: null,
    scans: 0,
    stage: null,
    power: null,
    stall: null,
    stallCount: 0,
    tried: [],
    pulled: {},
    resets: [],
    blocked: [],
    seen: [],
    groups: {},
    assists: {},
    rejections: 0,
    waitIndex: 0,
    notes: [],
    counters: { actions: 0, clears: 0, defeats: 0, rejected: 0 },
  };
}

// Everything the scan exposes that changes a campaign fight. Equal fingerprints mean a retry
// would replay the same build against the same boss.
export function fingerprint(scan: Scan) {
  const b = scan.character.build;
  return [
    b?.career ?? 0,
    b?.spec ?? 0,
    scan.character.level,
    scan.character.power,
    b?.stats?.join(".") ?? "",
    b?.skillLevels ?? "",
    b?.loadout?.join(".") ?? "",
  ].join(":");
}
export function gameDay(scan: Scan) {
  return scan.dungeon?.day ?? String(Math.floor(scan.checkedAt / 86400));
}
function powerOf(value: string) {
  return /^\d+$/.test(value) ? BigInt(value) : 0n;
}
// True when `now` is at least LEVER_REARM_PERCENT above `then` (integer maths).
export function risenEnough(now: string, then: string) {
  const a = powerOf(now),
    b = powerOf(then);
  return a > b && a * 100n >= b * BigInt(100 + LEVER_REARM_PERCENT);
}
function onBuild(scan: Scan, target: BuildId) {
  const b = scan.character.build;
  return !!b && b.career === target.career && b.spec === target.spec;
}
function currentBuild(scan: Scan): BuildId | null {
  const b = scan.character.build;
  return b ? { career: b.career, spec: b.spec, line: b.line } : null;
}

function choose(s: JobState, scan: Scan, day: string, log: LogDraft[]): Planned | null {
  const power = scan.character.power;
  const base = { power, day };
  const fresh = scan.steps.filter((st) => !s.blocked.includes(st.key));
  const unseen = (st: Step) => !s.seen.includes(stamp(st));
  const build = scan.character.build;
  const pick = (step: Step | undefined, purpose: Purpose, reason: string, extra = {}) =>
    step ? { step, purpose, reason, ...base, ...extra } : null;

  // 1. Free rewards and listings first: they can raise level and power.
  const claim = fresh.find((st) => st.kind === "claim" && unseen(st));
  if (claim) return pick(claim, "claim", "Ready reward; claims can raise level or power.");
  // Idle income (paced by the helper's session clock) and a free Quick Idle raise level too.
  const idle = fresh.find((st) => st.kind === "idle" && unseen(st));
  if (idle)
    return pick(
      idle,
      "idle",
      idle.idle?.type === "fast"
        ? "A free Quick Idle is left today."
        : "Idle income is due (battery-saving rate).",
    );
  const offer = s.options.freeListings
    ? fresh.find((st) => st.kind === "offer" && unseen(st))
    : undefined;
  if (offer) return pick(offer, "offer", "Zero-price listing.");
  const builds = fresh.filter((st) => st.kind === "build" && !!st.development);
  // 2. Unused stat points on the active specialization.
  const stats = builds.find(
    (st) => st.development!.type === "stats" && st.development!.spec === build?.spec && unseen(st),
  );
  if (stats) return pick(stats, "stats", "Unused stat points on the active build.");
  // 2b. Unspent skill points, then learned active skills that aren't equipped.
  const skills = builds.find(
    (st) => st.development!.type === "skills" && st.development!.spec === build?.spec && unseen(st),
  );
  if (skills)
    return pick(skills, "skills", "Unspent skill points; the game's skill allocator places them.");
  const loadout = builds.find(
    (st) =>
      st.development!.type === "loadout" && st.development!.spec === build?.spec && unseen(st),
  );
  if (loadout) return pick(loadout, "loadout", "Learned active skills are not equipped.");
  // 3. Class advancement once its transfer tasks are claimed, only from the build that clears.
  const home = !s.stall || onBuild(scan, s.stall.origin);
  const advance = builds.find((st) => st.development!.type === "advance" && unseen(st));
  if (advance && build?.line === 100) {
    if (!s.notes.includes("novice")) {
      s.notes.push("novice");
      log.push({
        level: "warn",
        text: "A first-class choice is available. Choosing a class line is left to you; the job won't pick one.",
      });
    }
  } else if (advance && home)
    return pick(advance, "advance", "All class-transfer task rewards are claimed.");
  // 4. The campaign boss, once per (stage, build fingerprint).
  const campaign = fresh.find((st) => st.autoGroup === "campaign" && st.kind === "fight");
  if (campaign && s.stage !== null) {
    const fight = `${s.stage}|${fingerprint(scan)}`;
    if (!s.tried.includes(fight))
      return pick(
        campaign,
        "campaign",
        s.stall
          ? "This build has not fought this boss yet."
          : "Next campaign boss with the current build.",
        { fight },
      );
  }
  // 5. Stalled: the next untried lever that changes the fingerprint.
  const stall = s.stall && s.stall.stage === s.stage ? s.stall : null;
  if (stall && build) {
    const leverOk = (lever: string) => {
      const last = s.pulled[`${stall.stage}|${lever}`];
      return last === undefined || risenEnough(stall.basis, last);
    };
    const lever = (step: Step | undefined, purpose: Purpose, key: string, reason: string) =>
      step ? pick(step, purpose, reason, { lever: key, basis: stall.basis }) : null;
    if (s.options.statReset && !s.resets.includes(`${stall.id}|${build.spec}`)) {
      const rebuild = builds.find(
        (st) =>
          st.development!.type === "rebuild" &&
          st.development!.spec === build.spec &&
          leverOk(`rebuild:${build.spec}`),
      );
      const chosen = lever(
        rebuild,
        "rebuild",
        `rebuild:${build.spec}`,
        "Lost with this allocation; rebuild to the game's recommended stats.",
      );
      if (chosen) return chosen;
    }
    if (s.options.specSwitch) {
      const spec = builds.find(
        (st) =>
          st.development!.type === "spec" &&
          st.development!.spec !== stall.origin.spec &&
          leverOk(`spec:${st.development!.spec}`),
      );
      const chosen = lever(
        spec,
        "spec",
        `spec:${spec?.development!.spec}`,
        "Try another unlocked specialization on this class line.",
      );
      if (chosen) return chosen;
    }
    if (s.options.classSwitch) {
      const cls = builds.find(
        (st) =>
          st.development!.type === "class" &&
          st.development!.line !== stall.origin.line &&
          leverOk(`class:${st.development!.career}`),
      );
      const chosen = lever(
        cls,
        "class",
        `class:${cls?.development!.career}`,
        "Try another class line through the free Job Switch.",
      );
      if (chosen) return chosen;
    }
    // 6. Nothing beat the boss: return to the build that cleared the earlier stages.
    if (!onBuild(scan, stall.origin)) {
      const back =
        build.line !== stall.origin.line
          ? builds.find(
              (st) =>
                st.development!.type === "class" && st.development!.line === stall.origin.line,
            )
          : builds.find(
              (st) => st.development!.type === "spec" && st.development!.spec === stall.origin.spec,
            );
      const chosen = pick(back, "revert", "No build beat this boss; return to the original build.");
      if (chosen) return chosen;
    }
  }
  // 7. Daily resource modes within the scan's own attempt counts.
  if (s.options.dailies) {
    const group = (st: Step) => s.groups[st.autoGroup!];
    const sweep = scan.steps.find((st) => {
      if (st.kind !== "sweep" || !st.autoGroup || (st.available ?? 0) <= 0) return false;
      if (s.blocked.includes(st.key)) return false;
      const used = group(st);
      return !used || used.day !== day || (st.available ?? 0) < used.available;
    });
    if (sweep) return pick(sweep, "sweep", "Daily resource sweep with attempts left.");
    const fight = fresh
      .filter((st) => {
        if (!fightEligible(st)) return false;
        const used = group(st);
        if (!used || used.day !== day) return true;
        return !used.lost && st.autoGroup !== "world" && (st.available ?? 0) < used.available;
      })
      .sort((a, b) => (b.powerRatio ?? 0) - (a.powerRatio ?? 0))[0];
    if (fight) return pick(fight, "fight", "Daily mode fight within its attempt count.");
  }
  if (s.options.assist && scan.dungeon?.eligible && scan.dungeon.remaining > 0) {
    const d = scan.dungeon;
    const limit = s.assists[`limit:${d.day}`] ?? d.remaining;
    s.assists[`limit:${d.day}`] = limit;
    const assist = fresh.find(
      (st) =>
        st.kind === "assist" &&
        st.assist?.day === d.day &&
        unseen(st) &&
        (st.assist.type === "watch" || (s.assists[d.day ?? ""] ?? 0) < limit),
    );
    if (assist) return pick(assist, "assist", "Posted dungeon invitation (assist only).");
  }
  return null;
}

function stop(s: JobState, reason: string, level: LogLevel = "info"): Reduction {
  s.phase = "stopped";
  s.plan = null;
  s.stopReason = reason;
  return { state: s, command: { type: "stop" }, log: [{ level, text: reason }] };
}
function rescan(s: JobState, log: LogDraft[]): Reduction {
  if (s.stopRequested) {
    const r = stop(s, "Stopped on request. No further actions will be sent.");
    return { ...r, log: [...log, ...r.log] };
  }
  s.phase = "scanning";
  s.plan = null;
  return { state: s, command: { type: "scan" }, log };
}
function reject(s: JobState, log: LogDraft[], scan = true): Reduction {
  s.rejections += 1;
  s.counters.rejected += 1;
  if (s.rejections >= MAX_CONSECUTIVE_REJECTIONS) {
    const r = stop(
      s,
      `${s.rejections} consecutive rejections. Stopped; inspect the character before another run.`,
      "error",
    );
    return { ...r, log: [...log, ...r.log] };
  }
  return scan ? rescan(s, log) : wait(s, log);
}
function wait(s: JobState, log: LogDraft[], reason?: string): Reduction {
  if (s.stopRequested) return stop(s, "Stopped on request. No further actions will be sent.");
  s.phase = "waiting";
  s.plan = null;
  const ms = WAIT_STEPS_MS[Math.min(s.waitIndex, WAIT_STEPS_MS.length - 1)];
  s.waitIndex += 1;
  log.push({
    level: "wait",
    text: `${reason ?? "Nothing useful to do right now."} Rescanning in ${Math.round(ms / 1000)} s.`,
  });
  return { state: s, command: { type: "wait", ms }, log };
}
function capReason(s: JobState, now: number) {
  const o = s.options;
  if (o.maxActions && s.counters.actions >= o.maxActions)
    return `Reached the action cap (${o.maxActions}).`;
  if (o.maxMinutes && now - s.startedAt >= o.maxMinutes * 60_000)
    return `Reached the time cap (${o.maxMinutes} min).`;
  return null;
}

function onScanned(s: JobState, scan: Scan, now: number): Reduction {
  const log: LogDraft[] = [];
  if (!hasAutoIdentity(scan))
    return stop(s, "The helper returned a scan without session identity. Reconnect.", "error");
  if (!s.identity)
    s.identity = {
      sessionId: scan.sessionId,
      characterId: scan.character.id,
      realm: scan.character.realm,
    };
  else if (
    s.identity.sessionId !== scan.sessionId ||
    s.identity.characterId !== scan.character.id ||
    s.identity.realm !== scan.character.realm
  )
    return stop(s, "The character or game session changed. Nothing else was sent.", "error");
  const build = currentBuild(scan);
  if (
    s.expected &&
    (!build || build.career !== s.expected.career || build.spec !== s.expected.spec)
  )
    return stop(
      s,
      "The class or specialization changed outside this job. Stopped without another action.",
      "error",
    );
  if (!s.expected && build) s.expected = build;
  s.scans += 1;
  if (s.stopRequested) return stop(s, "Stopped on request. No further actions will be sent.");
  const cap = capReason(s, now);
  if (cap) return stop(s, cap);
  const campaign = scan.steps.find((st) => st.autoGroup === "campaign" && st.kind === "fight");
  const stage = campaign?.stageEntry ?? null;
  if (stage !== s.stage) {
    if (s.scans > 1)
      log.push({
        level: "info",
        text: stage ? `Campaign stage is now ${stage}.` : "No campaign boss is offered.",
      });
    s.stage = stage;
    s.stall = null;
    s.tried = s.tried.filter((k) => k.startsWith(`${stage}|`));
    s.pulled = Object.fromEntries(
      Object.entries(s.pulled).filter(([k]) => k.startsWith(`${stage}|`)),
    );
  }
  if (s.power !== null && powerOf(scan.character.power) > powerOf(s.power))
    log.push({ level: "info", text: `Power rose to ${scan.character.power}.` });
  s.power = scan.character.power;
  if (s.stall && onBuild(scan, s.stall.origin)) s.stall.basis = scan.character.power;
  prune(s, scan);
  // One notice per stall (and per build for the skills notice), not one per wait.
  const stallNote = (kind: string, spec = 0) => {
    const key = `${kind}:${s.stall?.id ?? 0}:${spec}`;
    if (s.notes.includes(key)) return false;
    s.notes.push(key);
    return true;
  };
  const plan = choose(s, scan, gameDay(scan), log);
  // Skill points are spent before any fight; this only fires when no skill proposal was offered.
  if (
    plan?.purpose === "campaign" &&
    scan.character.build?.skillLevels === 0 &&
    stallNote("skills", build?.spec)
  )
    log.push({
      level: "warn",
      text: "This build has no skills allocated and no skill allocation was offered (no unspent points, or the build couldn't be read). Its fight is likely to lose; the job tries anyway (fights are free).",
    });
  if (!plan) {
    if (s.stall && stallNote("idle"))
      log.push({
        level: "info",
        text: "While stalled, idle income is collected on each rescan at the battery-saving rate (one claim per 15 s at most); the boss is retried when level or power changes.",
      });
    const reason = s.stall
      ? "Stalled: every available build has fought this boss and dailies are done. Waiting for level or power to change."
      : "Nothing eligible right now.";
    return wait(s, log, reason);
  }
  s.phase = "preparing";
  s.plan = plan;
  log.push({
    level: "decision",
    text: `${plan.step.title}: ${plan.reason}`,
    step: plan.step.title,
  });
  return { state: s, command: { type: "prepare", plan, scanId: scan.scanId }, log };
}

// Keeps memory bounded over a long run without weakening what the guards protect:
// - a `seen` stamp only matters while the scan still offers that step;
// - blocked build steps (a small fixed set per class tier) stay blocked for the run, while other
//   blocked keys are dropped once the scan stops offering them (a past stage's boss, a claimed task);
// - resets are per stall, notes per stall, assist counts per game day.
function prune(s: JobState, scan: Scan) {
  const present = new Set(scan.steps.map((st) => st.key));
  s.seen = s.seen.filter((st) => present.has(st.slice(0, st.lastIndexOf(":"))));
  s.blocked = s.blocked.filter((k) => k.startsWith("build:") || present.has(k));
  if (!s.stall) s.resets = [];
  const stall = `:${s.stall?.id ?? 0}:`;
  s.notes = s.notes.filter((n) => !/^(skills|idle):/.test(n) || n.includes(stall));
  const day = gameDay(scan);
  s.assists = Object.fromEntries(
    Object.entries(s.assists).filter(([k]) => k === day || k === `limit:${day}`),
  );
}

function reserve(s: JobState, p: Planned) {
  s.seen.push(stamp(p.step));
  if (p.fight) s.tried.push(p.fight);
  if (p.lever && s.stall) s.pulled[`${s.stall.stage}|${p.lever}`] = p.basis ?? "0";
  if (p.purpose === "rebuild" && s.stall)
    s.resets.push(`${s.stall.id}|${p.step.development!.spec}`);
  const group = p.step.autoGroup;
  if ((p.purpose === "sweep" || p.purpose === "fight") && group)
    s.groups[group] = { day: p.day, available: p.step.available ?? 0, lost: false };
  if (p.purpose === "assist" && p.step.assist?.type === "join") {
    const day = p.step.assist.day;
    s.assists[day] = (s.assists[day] ?? 0) + 1;
  }
}

function onPrepared(s: JobState, review: Review): Reduction {
  const p = s.plan!;
  const checked = review.steps?.[0];
  if (
    review.steps?.length !== 1 ||
    review.normalized?.keys?.length !== 1 ||
    review.normalized.keys[0] !== p.step.key ||
    checked.key !== p.step.key ||
    checked.revision !== p.step.revision ||
    checked.kind !== p.step.kind ||
    checked.command !== p.step.command
  )
    return reject(s, [
      { level: "warn", text: `${p.step.title} changed during review; nothing was sent.` },
    ]);
  if (s.stopRequested) return stop(s, "Stopped on request before sending. Nothing was sent.");
  reserve(s, p);
  s.phase = "executing";
  return {
    state: s,
    command: { type: "execute", plan: p, review },
    log: [{ level: "action", text: `Running ${p.step.title}.`, step: p.step.title }],
  };
}

function onExecuted(s: JobState, run: Run): Reduction {
  const p = s.plan!;
  const r = run.receipts?.[0];
  if (run.receipts?.length !== 1 || run.notRun !== 0 || r.command !== p.step.command) {
    s.uncertain = true;
    return stop(
      s,
      `Incomplete receipt for ${p.step.title}. Check game state; nothing was retried.`,
      "error",
    );
  }
  s.counters.actions += 1;
  const summary = { status: r.status, command: r.command, won: r.won, note: r.note };
  const log: LogDraft[] = [];
  const say = (level: LogLevel, text: string) =>
    log.push({ level, text, step: p.step.title, receipt: summary });
  if (r.status === "unknown" || r.status === "stopped") {
    s.uncertain = r.status === "unknown";
    say("error", `${p.step.title}: ${r.status}. ${r.note ?? ""}`.trim());
    const out = stop(s, "Stopped without retrying. Reconnect and inspect the game state.", "error");
    return { ...out, log: [...log, ...out.log] };
  }
  if (r.status === "rejected") {
    if (p.purpose !== "campaign") s.blocked.push(p.step.key);
    say("warn", `${p.step.title} was rejected${r.note ? `: ${r.note}` : ""}. Not offered again.`);
    return reject(s, log);
  }
  if (r.status === "skipped") {
    say("result", `${p.step.title} skipped: ${r.note ?? "eligibility changed"}.`);
    return rescan(s, log);
  }
  s.rejections = 0;
  s.waitIndex = 0;
  const change = p.step.development;
  if (change && ["class", "advance", "spec"].includes(change.type)) {
    const state = r.buildState;
    if (
      !state ||
      state.career !== change.career ||
      (change.type === "spec" && state.spec !== change.spec)
    ) {
      s.uncertain = true;
      return stop(s, "Class change receipt is incomplete. Inspect the character.", "error");
    }
    const line = change.line;
    s.expected = { career: state.career, spec: state.spec, line };
    if (p.purpose === "advance" && s.stall) s.stall.origin = { ...s.expected };
  }
  if (p.purpose === "campaign") {
    if (r.won === true) {
      s.counters.clears += 1;
      say("result", `Victory at ${p.step.title}.`);
    } else if (r.won === false) {
      s.counters.defeats += 1;
      if (!s.stall || s.stall.stage !== s.stage) {
        s.stallCount += 1;
        s.stall = { id: s.stallCount, stage: s.stage!, origin: { ...s.expected! }, basis: p.power };
      }
      say("result", `Defeat at ${p.step.title}. Trying the next untried build before retrying.`);
    } else {
      s.uncertain = true;
      return stop(s, "The campaign receipt has no result. Inspect the stage.", "error");
    }
  } else if (p.purpose === "fight" && r.won === false && p.step.autoGroup) {
    s.groups[p.step.autoGroup].lost = true;
    say("result", `${p.step.title} lost; not repeated this game day.`);
  } else say("result", `${p.step.title}: confirmed.${r.note ? ` ${r.note}` : ""}`);
  return rescan(s, log);
}

function onFailed(s: JobState, code: string, sent: boolean): Reduction {
  const what = s.plan?.step.title ?? "the scan";
  if (s.phase === "executing" && sent && !NOTHING_SENT.has(code)) {
    s.uncertain = true;
    return stop(
      s,
      `Outcome uncertain for ${what} (${code}). Do not repeat it before checking game state.`,
      "error",
    );
  }
  if (SESSION_ENDED.has(code)) return stop(s, `The game session ended (${code}).`, "error");
  const log: LogDraft[] = [{ level: "warn", text: `${what} failed before sending (${code}).` }];
  if (s.phase === "scanning") return reject(s, log, false);
  if (s.plan) s.blocked.push(s.plan.step.key);
  return reject(s, log);
}

// One event in, one command out. Events after stop are ignored.
export function reduce(prev: JobState, event: JobEvent): Reduction {
  const s: JobState = structuredClone(prev);
  if (s.phase === "stopped") return { state: s, command: null, log: [] };
  switch (event.type) {
    case "start":
      if (s.phase !== "idle") break;
      s.phase = "scanning";
      return {
        state: s,
        command: { type: "scan" },
        log: [{ level: "info", text: "Progression job started." }],
      };
    case "stopRequested":
      if (s.stopRequested) break;
      s.stopRequested = true;
      if (s.phase === "waiting" || s.phase === "idle")
        return stop(s, "Stopped on request. No further actions will be sent.");
      return {
        state: s,
        command: null,
        log: [{ level: "info", text: "Stop requested; finishing the request in flight." }],
      };
    case "sessionEnded":
      if (s.phase === "executing") {
        s.uncertain = true;
        return stop(s, "The game session ended during an action; its outcome is unknown.", "error");
      }
      return stop(s, "The game session ended.");
    case "woke":
      if (s.phase !== "waiting") break;
      {
        const cap = capReason(s, event.now);
        if (cap) return stop(s, cap);
      }
      return rescan(s, []);
    case "scanned":
      if (s.phase !== "scanning") break;
      return onScanned(s, event.scan, event.now);
    case "prepared":
      if (s.phase !== "preparing") break;
      return onPrepared(s, event.review);
    case "executed":
      if (s.phase !== "executing") break;
      return onExecuted(s, event.run);
    case "failed":
      if (!["scanning", "preparing", "executing"].includes(s.phase)) break;
      return onFailed(s, event.code, event.sent);
  }
  return { state: s, command: null, log: [] };
}
