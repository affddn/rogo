import { readFileSync } from "node:fs";
import { check } from "tla-ts";
import { expect, it } from "vite-plus/test";
import {
  DEFAULT_PROGRESS_OPTIONS,
  initialState,
  MAX_CONSECUTIVE_REJECTIONS,
  reduce,
  type Command,
  type JobEvent,
  type JobState,
} from "./progression";
import { buildOfCareer, buildOfSpec, FakeGame } from "./progression.fixture";

const spec = readFileSync(new URL("./progression.tla", import.meta.url), "utf8");
const SAFETY =
  "OneInFlight NothingAfterStop NoRefight LeverOncePerPower ResetOncePerStall UncertainStops";
type Constants = Record<string, number | boolean>;
const BASE: Constants = {
  NStages: 2,
  MaxPw: 1,
  MaxNudge: 0,
  MaxRej: MAX_CONSECUTIVE_REJECTIONS,
  Chores: 1,
  Dailies: 1,
  Faults: 1,
  CheckTried: true,
  CheckStop: true,
  CheckRisen: true,
  CheckResetOnce: true,
  CheckLock: true,
};
function config(constants: Constants, spec: string, invariants: string, properties = "") {
  const lines = Object.entries(constants).map(
    ([k, v]) => `${k} = ${typeof v === "boolean" ? (v ? "TRUE" : "FALSE") : v}`,
  );
  return [
    `SPECIFICATION ${spec}`,
    `CONSTANTS ${lines.join("\n")}`,
    invariants && `INVARIANTS ${invariants}`,
    properties && `PROPERTIES ${properties}`,
  ]
    .filter(Boolean)
    .join("\n");
}
const model = (constants: Constants, invariants = SAFETY, properties = "StoppedIsFinal") =>
  check({
    source: spec,
    config: config({ ...BASE, ...constants }, "Spec", invariants, properties),
  });

it("model-checks the job's safety properties", { timeout: 120_000 }, async () => {
  const r = await model({});
  expect(r.status).toBe("success");
  expect(r.distinctStates).toBeGreaterThan(100_000);
});

it(
  "model-checks liveness: the ladder settles and a stop is honoured",
  { timeout: 120_000 },
  async () => {
    const r = await model(
      { NStages: 1, Chores: 0, Faults: 1 },
      SAFETY,
      "StoppedIsFinal Settles StopHonoured",
    );
    expect(r.status).toBe("success");
    // Small power rises: new fingerprints (boss retries) but no lever re-arm, still no livelock.
    const nudged = await model(
      { NStages: 1, Chores: 0, Dailies: 0, Faults: 0, MaxNudge: 1 },
      SAFETY,
      "StoppedIsFinal Settles StopHonoured",
    );
    expect(nudged.status).toBe("success");
  },
);

it.each([
  ["CheckTried", "NoRefight"],
  ["CheckStop", "NothingAfterStop"],
  ["CheckRisen", "LeverOncePerPower"],
  ["CheckResetOnce", "ResetOncePerStall"],
  ["CheckLock", "OneInFlight"],
])("is not vacuous: without %s the checker reports %s", { timeout: 60_000 }, async (flag, name) => {
  const r = await model({ NStages: 1, Chores: 0, Faults: 0, [flag]: false });
  expect(r.status).toBe("invariant-violation");
  expect(r.violation?.name).toBe(name);
});

it(
  "is not vacuous: without the lever guard the ladder can cycle forever",
  { timeout: 60_000 },
  async () => {
    const r = await model(
      { NStages: 1, Chores: 0, Dailies: 0, Faults: 0, CheckRisen: false },
      "",
      "Settles",
    );
    expect(r.status).toBe("liveness-violation");
  },
);

// ---- Trace conformance: the real reducer, driven by the fake game, must follow the spec ----

class TSet {
  items: unknown[];
  constructor(items: unknown[]) {
    this.items = items;
  }
}
function tla(v: unknown): string {
  if (typeof v === "boolean") return v ? "TRUE" : "FALSE";
  if (typeof v === "number") return String(v);
  if (typeof v === "string") return JSON.stringify(v);
  if (Array.isArray(v)) return `<<${v.map(tla).join(", ")}>>`;
  if (v instanceof TSet) return `{${v.items.map(tla).join(", ")}}`;
  return `[${Object.entries(v as object)
    .map(([k, x]) => `${k} |-> ${tla(x)}`)
    .join(", ")}]`;
}
const pwOf = (power: string) => Math.floor((Number(power) - 10_000) / 1_000);
const nudgeOf = (power: string) => Math.floor(((Number(power) - 10_000) % 1_000) / 10);
const leverKey = (lever: string) => {
  const [kind, n] = lever.split(":");
  if (kind === "class") return ["class", buildOfCareer(+n)[0], 0];
  return [kind, ...buildOfSpec(+n)];
};
const LEVERS = [
  ["rebuild", 1, 1],
  ["rebuild", 1, 2],
  ["rebuild", 2, 1],
  ["spec", 1, 1],
  ["spec", 1, 2],
  ["spec", 2, 1],
  ["class", 1, 0],
  ["class", 2, 0],
];
function fight(key: string) {
  const [stage, fp] = key.split("|");
  const [, spec, , power, stats] = fp.split(":");
  return [+stage - 100, [buildOfSpec(+spec), pwOf(power), nudgeOf(power), stats.startsWith("9")]];
}
type Harness = { decided: boolean; faults: number };
function observe(s: JobState, g: FakeGame, h: Harness) {
  const p = s.plan;
  const done = g.stages + 1;
  let plan: unknown = ["none", []];
  if (p) {
    const d = p.step.development;
    const key =
      d &&
      (d.type === "class"
        ? ["class", buildOfSpec(d.spec)[0], 0]
        : [d.type, ...buildOfSpec(d.spec)]);
    if (["claim", "idle", "offer", "stats", "skills", "loadout"].includes(p.purpose))
      plan = ["chore", []];
    else if (p.purpose === "campaign") plan = ["campaign", fight(p.fight!)];
    else if (p.purpose === "revert") plan = ["revert", key];
    else if (["rebuild", "spec", "class"].includes(p.purpose)) plan = ["lever", key];
    else plan = ["daily", []];
  }
  const pulled = new Map<string, number>();
  for (const [k, basis] of Object.entries(s.pulled))
    pulled.set(JSON.stringify(leverKey(k.split("|")[1])), pwOf(basis));
  const blocked = s.blocked.flatMap((k) => {
    const [kind, , rest] = k.split(":");
    if (kind === "fight") return [["campaign", +rest, 0]];
    if (kind !== "build") return [];
    const n = +rest.slice(1);
    if (rest[0] === "L") return [["class", n, 0]];
    return [[rest[0] === "R" ? "rebuild" : "spec", ...buildOfSpec(n)]];
  });
  return {
    phase: s.phase,
    plan,
    stopReq: s.stopRequested,
    uncertain: s.uncertain,
    jstage: s.stage === null ? (h.decided ? done : 0) : s.stage - 100,
    expected: s.expected ? buildOfSpec(s.expected.spec) : [0, 0],
    stall: s.stall?.id ?? 0,
    stallId: s.stallCount,
    origin: s.stall ? buildOfSpec(s.stall.origin.spec) : [0, 0],
    basis: s.stall ? pwOf(s.stall.basis) : -1,
    tried: new TSet(s.tried.map(fight)),
    pulled: new TSet(LEVERS.map((k) => [k, pulled.get(JSON.stringify(k)) ?? -1])),
    resets: new TSet(
      s.resets.map((r) => {
        const [stall, spec] = r.split("|");
        return [+stall, buildOfSpec(+spec)];
      }),
    ),
    blocked: new TSet(blocked),
    rej: s.rejections,
    stage: g.stage,
    build: g.build,
    pw: g.pw,
    nudge: g.nudge,
    rebuilt: new TSet([...g.rebuilt].map((b) => b.split(",").map(Number))),
    chores: g.chores.length,
    dailies: g.dailies.length,
    interactive: false,
    meddled: false,
    faults: h.faults,
  };
}

function rng(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// Drives the real reducer against the fake game, recording one abstract state per transition.
function trace(seed: number, faultBudget: number) {
  const random = rng(seed);
  const game = new FakeGame(2, random() < 0.5 ? 1 : 0, random() < 0.5 ? 1 : 0);
  const initial = { chores: game.chores.length, dailies: game.dailies.length };
  const h: Harness = { decided: false, faults: 0 };
  let state = initialState(DEFAULT_PROGRESS_OPTIONS, 0);
  const states: string[] = [];
  const record = () => {
    const obs = tla(observe(state, game, h));
    if (obs !== states.at(-1)) states.push(obs);
  };
  const apply = (event: JobEvent): Command | null => {
    const before = state.phase;
    const out = reduce(state, event);
    state = out.state;
    if (
      event.type === "scanned" &&
      before === "scanning" &&
      (state.phase === "preparing" || state.phase === "waiting")
    )
      h.decided = true;
    record();
    return out.command;
  };
  const fault = () => random() < 0.15 && h.faults < faultBudget && (h.faults += 1);
  game.outcome = (step) => {
    if (fault()) return random() < 0.5 ? "reject" : "skip";
    const r = random();
    if (r < 0.01) return "unknown";
    if (r < 0.02) return "halt";
    return step.command === 5001 ? (r < 0.35 ? "win" : "lose") : "ok";
  };
  record();
  let command = apply({ type: "start" });
  while (command && command.type !== "stop" && states.length < 150) {
    if (random() < 0.01) command = apply({ type: "stopRequested" }) ?? command;
    if (state.phase === "stopped") break;
    if (random() < 0.005) {
      apply({ type: "sessionEnded" });
      break;
    }
    let event: JobEvent;
    if (command.type === "scan") {
      if (random() < 0.1 && game.pw < 3) {
        game.progress(random() < 0.5);
        record();
      }
      if (random() < 0.1 && game.nudge < 5) {
        game.smallRise();
        record();
      }
      event = fault()
        ? { type: "failed", code: "routine_clock_unavailable", sent: true }
        : { type: "scanned", scan: game.scan(), now: 0 };
    } else if (command.type === "prepare") {
      const key = command.plan.step.key;
      const review = game.review({ scanId: command.scanId, keys: [key] });
      if (fault()) {
        if (random() < 0.5) {
          game.drop(key);
          event = { type: "failed", code: "replay_unavailable", sent: false };
        } else
          event = {
            type: "prepared",
            review: { ticket: "", ...review, steps: [{ ...review.steps[0], revision: "x" }] },
          };
      } else event = { type: "prepared", review: { ticket: "", ...review } };
    } else if (command.type === "execute") {
      if (fault()) {
        game.drop(command.plan.step.key);
        event = { type: "failed", code: "routine_scan_expired", sent: true };
      } else event = { type: "executed", run: game.run(command.review.normalized) };
    } else {
      if (random() < 0.3 && game.pw < 3) {
        game.progress(random() < 0.5);
        record();
      } else if (random() < 0.5 && game.nudge < 5) {
        game.smallRise();
        record();
      }
      event = { type: "woke", now: 0 };
    }
    command = apply(event);
  }
  return { states, initial, maxPw: game.pw, maxNudge: game.nudge };
}

function traceModule(states: string[]) {
  return `---- MODULE ProgressionTrace ----
EXTENDS ProgressionJob, Sequences
VARIABLE i
Obs == [phase |-> phase, plan |-> plan, stopReq |-> stopReq, uncertain |-> uncertain,
        jstage |-> jstage, expected |-> expected, stall |-> stall, stallId |-> stallId,
        origin |-> origin, basis |-> basis, tried |-> tried,
        pulled |-> {<<k, pulled[k]>> : k \\in LeverKeys}, resets |-> resets, blocked |-> blocked,
        rej |-> rej, stage |-> stage, build |-> build, pw |-> pw, nudge |-> nudge,
        rebuilt |-> {b \\in Builds : rebuilt[b]}, chores |-> chores, dailies |-> dailies,
        interactive |-> interactive, meddled |-> meddled, faults |-> faults]
Trace == <<${states.join(",\n")}>>
TInit == Init /\\ i = 1 /\\ Obs = Trace[1]
TNext == i < Len(Trace) /\\ Next /\\ i' = i + 1 /\\ Obs' = Trace[i + 1]
TEnd == i = Len(Trace) /\\ UNCHANGED <<vars, i>>
TStep == TNext \\/ TEnd
TSpec == TInit /\\ [][TStep]_<<vars, i>>
====`;
}
// A trace that leaves the spec has a state with no successor before its end: "deadlock".
function checkTrace(states: string[], constants: Constants) {
  return check({
    source: traceModule(states),
    config: config({ ...BASE, ...constants }, "TSpec", SAFETY),
    loadModule: (name) => (name === "ProgressionJob" ? spec : undefined),
  });
}

it("the real reducer's traces are behaviours of the spec", { timeout: 120_000 }, async () => {
  let longest = 0;
  for (let seed = 1; seed <= 40; seed++) {
    const faults = seed % 3;
    const { states, initial, maxPw, maxNudge } = trace(seed, faults);
    const result = await checkTrace(states, {
      MaxPw: Math.max(1, maxPw),
      MaxNudge: maxNudge,
      Chores: initial.chores,
      Dailies: initial.dailies,
      Faults: faults,
    });
    expect({ seed, status: result.status }).toEqual({ seed, status: "success" });
    expect(result.distinctStates).toBeGreaterThanOrEqual(states.length);
    longest = Math.max(longest, states.length);
  }
  expect(longest).toBeGreaterThan(40);
});

it(
  "trace checking is not vacuous: a skipped transition is reported",
  { timeout: 60_000 },
  async () => {
    const { states, initial, maxPw, maxNudge } = trace(7, 0);
    const constants = {
      MaxPw: Math.max(1, maxPw),
      MaxNudge: maxNudge,
      Chores: initial.chores,
      Dailies: initial.dailies,
      Faults: 0,
    };
    expect((await checkTrace(states, constants)).status).toBe("success");
    const broken = [...states.slice(0, 10), ...states.slice(12)];
    expect((await checkTrace(broken, constants)).status).toBe("deadlock");
  },
);
