import { afterEach, beforeEach, expect, it, vi } from "vite-plus/test";
import type { Run, Scan, Step } from "../src/lib/game/daily-types.ts";
import { FakeGame, type Outcome } from "../src/lib/game/progression.fixture.ts";
import {
  DEFAULT_PROGRESS_OPTIONS,
  initialState,
  reduce,
  type JobState,
  type ProgressOptions,
} from "../src/lib/game/progression.ts";
import { parseOptions, ProgressionJob, type JobTransport } from "./progression-job.ts";

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
});

function harness(game: FakeGame, options: Partial<ProgressOptions> = {}) {
  const lock = { busy: false };
  const stats = { inFlight: 0, maxInFlight: 0, scans: 0, prepares: 0, executes: 0, keepalives: 0 };
  const track =
    <A extends unknown[], T>(
      name: "scans" | "prepares" | "executes" | "keepalives",
      fn: (...a: A) => T,
    ) =>
    async (...a: A) => {
      stats[name] += 1;
      stats.inFlight += 1;
      stats.maxInFlight = Math.max(stats.maxInFlight, stats.inFlight);
      // Every request is made while holding the bridge lock.
      expect(lock.busy).toBe(true);
      try {
        await Promise.resolve();
        return fn(...a);
      } finally {
        stats.inFlight -= 1;
      }
    };
  const transport: JobTransport = {
    scan: track("scans", () => game.scan()),
    prepare: track("prepares", (s) => game.review(s)),
    execute: track("executes", (s) => game.run(s)),
    keepalive: track("keepalives", () => ({ serverTime: 0 })),
  };
  const keepAlive = vi.fn();
  const job = new ProgressionJob({ ...DEFAULT_PROGRESS_OPTIONS, ...options }, transport, {
    acquire: () => (lock.busy ? false : (lock.busy = true)),
    release: () => {
      lock.busy = false;
    },
    keepAlive,
  });
  return { job, lock, stats, transport, keepAlive };
}
const run = (ms: number) => vi.advanceTimersByTimeAsync(ms);
const texts = (job: ProgressionJob) => job.lines(0).lines.map((l) => l.text);

it("defeat → rebuild → victory, then waits with nothing left", async () => {
  const game = new FakeGame(1);
  game.outcome = (s, g) => (s.command === 5001 ? (g.rebuilt.size ? "win" : "lose") : "ok");
  const { job, stats, keepAlive } = harness(game);
  await run(10_000);
  expect(game.sent).toEqual(["fight:5001:1", "build:4529:R21", "fight:5001:1"]);
  expect(job.status()).toMatchObject({ phase: "waiting", counters: { clears: 1, defeats: 1 } });
  expect(stats.maxInFlight).toBe(1);
  expect(keepAlive).toHaveBeenCalled();
  job.requestStop();
  expect(job.status().state).toBe("stopped");
});

it("every build loses → returns to the original build → waits → power rises → retries", async () => {
  const game = new FakeGame(1);
  game.outcome = (s, g) => (s.command === 5001 ? (g.pw >= 1 ? "win" : "lose") : "ok");
  const { job, stats } = harness(game);
  await run(60_000);
  expect(game.sent).toEqual([
    "fight:5001:1", // original 21
    "build:4529:R21",
    "fight:5001:1",
    "build:4523:S22",
    "fight:5001:1",
    "build:4529:R22",
    "fight:5001:1",
    "build:4521:L2",
    "fight:5001:1",
    "build:4529:R31",
    "fight:5001:1",
    "build:4521:L1", // revert: line 1 lands on spec 21, the original build
  ]);
  expect(game.build).toEqual([1, 1]);
  expect(job.status()).toMatchObject({ phase: "waiting", counters: { defeats: 6, clears: 0 } });
  // Waiting rescans periodically but sends nothing while the fingerprint is unchanged.
  const scans = stats.scans;
  await run(5 * 60_000);
  expect(stats.scans).toBeGreaterThan(scans);
  expect(game.sent).toHaveLength(12);
  game.progress();
  await run(5 * 60_000);
  expect(game.sent.at(-1)).toBe("fight:5001:1");
  expect(job.status().counters.clears).toBe(1);
  expect(texts(job).some((t) => t.includes("Power rose"))).toBe(true);
  job.requestStop();
});

it("a small power rise retries the boss on the original build only; a 3% rise re-arms levers", async () => {
  const game = new FakeGame(1);
  game.outcome = (s) => (s.command === 5001 ? "lose" : "ok");
  const { job } = harness(game);
  await run(60_000);
  expect(game.sent).toHaveLength(12);
  expect(job.status().phase).toBe("waiting");
  game.smallRise();
  await run(5 * 60_000);
  expect(game.sent.slice(12)).toEqual(["fight:5001:1"]);
  expect(game.build).toEqual([1, 1]);
  game.progress();
  await run(10 * 60_000);
  // Rebuilds stay spent for this stall; spec and class levers re-arm, then the job returns home.
  expect(game.sent.slice(13)).toEqual([
    "fight:5001:1",
    "build:4523:S22",
    "fight:5001:1",
    "build:4521:L2",
    "fight:5001:1",
    "build:4521:L1",
  ]);
  job.requestStop();
});

it("re-arms levers only at the named percentage rise", async () => {
  const { risenEnough, LEVER_REARM_PERCENT } = await import("../src/lib/game/progression.ts");
  expect(LEVER_REARM_PERCENT).toBe(3);
  expect(risenEnough("10299", "10000")).toBe(false);
  expect(risenEnough("10300", "10000")).toBe(true);
  expect(risenEnough("0", "0")).toBe(false);
  expect(risenEnough("123456789012345678901234", "119860000000000000000000")).toBe(true);
});

it("says once per stall that every rescan settles idle income", async () => {
  const game = new FakeGame(1);
  game.skillless.add("2,1");
  const { job } = harness(game);
  await run(30 * 60_000);
  const log = texts(job);
  expect(log.filter((t) => t.includes("no skills allocated"))).toHaveLength(1);
  expect(log.filter((t) => t.includes("settled by the server on every rescan"))).toHaveLength(1);
  expect(log.filter((t) => t.startsWith("Stalled")).length).toBeGreaterThan(3);
  job.requestStop();
});

it("keeps job memory bounded over a long session", async () => {
  const game = new FakeGame(400);
  game.settleEvery = 2;
  let n = 0;
  game.outcome = (s, g) => {
    if (s.kind === "claim") return Number(s.key.split(":")[1]) % 4 === 0 ? "reject" : "ok";
    if (s.command !== 5001) return "ok";
    return g.stage % 3 === 0 && !g.rebuilt.size ? "lose" : "win";
  };
  const { job } = harness(game);
  const size = () => JSON.stringify((job as unknown as { state: JobState }).state).length;
  const sizes: number[] = [];
  for (let round = 0; round < 40; round++) {
    // New claims keep appearing and some are rejected; power drifts up.
    for (let i = 0; i < 5; i++) game.chores.push(`claim:${n++}`);
    if (round % 4 === 0) game.progress(true);
    else game.smallRise();
    await run(10 * 60_000);
    sizes.push(size());
  }
  expect(job.status().counters.actions).toBeGreaterThan(300);
  expect(Math.max(...sizes.slice(20))).toBeLessThan(Math.max(...sizes.slice(0, 20)) * 1.5);
  expect(Math.max(...sizes)).toBeLessThan(20_000);
  const state = (job as unknown as { state: JobState }).state;
  expect(state.counters.rejected).toBeGreaterThan(40);
  expect(state.seen.length + state.blocked.length).toBeLessThan(20);
  job.requestStop();
});

it("after a class switch: stats → skills → loadout → boss", async () => {
  const game = new FakeGame(1);
  game.buildChores = true;
  game.outcome = (s, g) => (s.command === 5001 ? (g.build[0] === 2 ? "win" : "lose") : "ok");
  const { job } = harness(game, { specSwitch: false, statReset: false });
  await run(60_000);
  expect(game.sent).toEqual([
    "fight:5001:1",
    "build:4521:L2",
    "build:4529:A31",
    "build:4525:K31",
    "build:4533:Q31",
    "fight:5001:1",
  ]);
  expect(job.status().counters.clears).toBe(1);
  // Skills were allocated before the fight, so no zero-skill warning.
  expect(texts(job).some((t) => t.includes("no skills allocated"))).toBe(false);
  job.requestStop();
});

it("stalled: idle income settled by rescans raises power and the boss is retried", async () => {
  const game = new FakeGame(1);
  game.settleEvery = 2;
  game.outcome = (s, g) => (s.command === 5001 ? (g.pw >= 1 ? "win" : "lose") : "ok");
  game.onSettle = (g) => {
    if (g.settlements === 8) g.progress();
  };
  const { job } = harness(game);
  await run(6 * 60 * 60_000);
  expect(game.settlements).toBeGreaterThanOrEqual(8);
  expect(job.status().counters.clears).toBe(1);
  expect(game.sent.filter((k) => k.startsWith("idle:"))).toEqual([]); // no online idle claim
  const log = texts(job);
  expect(
    log.filter((t) => t.startsWith("Idle income settled by this scan: 60 s, 3 reward kinds.")),
  ).toHaveLength(game.settlements);
  job.requestStop();
});

it("nothing about idle income is logged when a scan settled none", async () => {
  const game = new FakeGame(0);
  const { job } = harness(game);
  await run(10 * 60_000);
  expect(texts(job).some((t) => t.startsWith("Idle income settled"))).toBe(false);
  job.requestStop();
});

const waits = (job: ProgressionJob) =>
  texts(job)
    .map((t) => /Rescanning in (\d+) (s|min)/.exec(t))
    .filter((m) => m !== null)
    .map((m) => Number(m![1]) * (m![2] === "min" ? 60 : 1));

it("a lost retry does not restart the short waits; a confirmed claim does", async () => {
  const game = new FakeGame(1);
  const { job } = harness(game);
  await run(10 * 60_000);
  const stalled = waits(job);
  expect(stalled.at(-1)).toBe(480);
  game.smallRise(); // new fingerprint: the boss is retried on the original build, and lost
  await run(30 * 60_000);
  expect(game.sent.at(-1)).toBe("fight:5001:1");
  expect(waits(job).slice(stalled.length)).not.toContain(30);
  const before = waits(job).length;
  game.chores.push("claim:new");
  await run(60 * 60_000);
  expect(game.sent.at(-1)).toBe("claim:new");
  expect(waits(job)[before]).toBe(30); // first wait after the confirmed claim
  job.requestStop();
});

async function until(check: () => boolean, step = 1_000, limit = 6 * 60 * 60_000) {
  for (let t = 0; t < limit && !check(); t += step) await run(step);
  expect(check()).toBe(true);
}

it("stalled waits grow to 30 minutes and stay there", async () => {
  const game = new FakeGame(0);
  const { job } = harness(game);
  await run(2 * 60 * 60_000);
  expect(waits(job).slice(0, 8)).toEqual([30, 60, 120, 240, 480, 900, 1800, 1800]);
  expect(texts(job)).toContainEqual(expect.stringContaining("Rescanning in 30 min."));
  job.requestStop();
});

it("a 30-minute wait sends one keepalive a minute and exactly one scan at the end", async () => {
  const game = new FakeGame(0);
  const { job, stats } = harness(game);
  await until(() => waits(job).at(-1) === 1800);
  const { scans, keepalives } = { ...stats };
  const due = job.status().nextScanAt!;
  expect(due - Date.now()).toBe(1_800_000);
  expect(texts(job).at(-1)).toContain("kept alive by heartbeats");
  await run(1_800_000 - 1);
  expect(stats.scans).toBe(scans);
  expect(stats.keepalives - keepalives).toBe(29); // at 1, 2, … 29 min; the 30th minute is the rescan
  await run(1 + 2_000); // the usual 2 s gap before a scan
  expect(stats.scans).toBe(scans + 1);
  expect(stats.keepalives - keepalives).toBe(29);
  expect(stats.maxInFlight).toBe(1);
  job.requestStop();
});

it("stop during a long wait returns at once and sends nothing after", async () => {
  const game = new FakeGame(0);
  const { job, stats } = harness(game);
  await until(() => waits(job).at(-1) === 1800);
  await run(10 * 60_000);
  const sent = { ...stats };
  job.requestStop();
  expect(job.status().state).toBe("stopped");
  await run(2 * 60 * 60_000);
  expect(stats).toEqual(sent);
  await job.done;
});

it("a failed keepalive ends the job as a session end, not an uncertain outcome", async () => {
  const game = new FakeGame(0);
  const { job, transport } = harness(game);
  transport.keepalive = async () => {
    throw new Error("session_lost");
  };
  await run(10 * 60_000);
  expect(job.status()).toMatchObject({ state: "stopped", uncertain: false });
  expect(job.status().stopReason).toContain("keepalive heartbeat failed (session_lost)");
});

it("a time cap wakes the job on time, not at the end of a long wait", async () => {
  const game = new FakeGame(0);
  const { job } = harness(game, { maxMinutes: 20 });
  await run(3 * 60 * 60_000);
  const status = job.status();
  expect(status.stopReason).toContain("time cap");
  expect(status.endedAt! - status.startedAt).toBeGreaterThanOrEqual(20 * 60_000);
  expect(status.endedAt! - status.startedAt).toBeLessThan(20 * 60_000 + 5_000);
});

it("the server day rollover shortens a long wait", async () => {
  const game = new FakeGame(0);
  game.dayEndAt = Date.now() + 20 * 60_000;
  const { job, stats } = harness(game);
  await until(() => texts(job).some((t) => t.includes("server day rolls over")));
  const at = stats.scans;
  await until(() => stats.scans > at, 1_000, 30 * 60_000);
  // The rescan lands just after the rollover (plus the one-minute margin), not up to 15 min later.
  expect(Date.now() - (game.dayEndAt - 86_400_000)).toBeLessThanOrEqual(61_000 + 3_000);
  job.requestStop();
});

it("a skipped step does not count toward the action cap", async () => {
  const game = new FakeGame(0, 4);
  game.outcome = (s) => (s.key === "claim:0" || s.key === "claim:1" ? "skip" : "ok");
  const { job } = harness(game, { maxActions: 2 });
  await run(60_000);
  expect(game.sent).toEqual(["claim:0", "claim:1", "claim:2", "claim:3"]);
  expect(job.status()).toMatchObject({ state: "stopped", counters: { actions: 2 } });
  expect(job.status().stopReason).toContain("action cap");
});

it("a rejected lever is not offered again and the run continues", async () => {
  const game = new FakeGame(1);
  game.outcome = (s) =>
    s.command === 5001 ? "lose" : s.key === "build:4523:S22" ? "reject" : "ok";
  const { job } = harness(game, { classSwitch: false });
  await run(60_000);
  expect(game.sent.filter((k) => k === "build:4523:S22")).toHaveLength(1);
  expect(job.status()).toMatchObject({ phase: "waiting", counters: { rejected: 1 } });
  job.requestStop();
});

it("stops after consecutive rejections", async () => {
  const game = new FakeGame(1, 4);
  game.outcome = () => "reject";
  const { job } = harness(game);
  await run(60_000);
  expect(game.sent).toEqual(["claim:0", "claim:1", "claim:2"]);
  expect(job.status()).toMatchObject({ state: "stopped", counters: { rejected: 3 } });
});

it.each<Outcome>(["unknown", "halt"])("stops at a %s receipt without retrying", async (outcome) => {
  const game = new FakeGame(1);
  game.outcome = () => outcome;
  const { job, stats } = harness(game);
  await run(60_000);
  expect(game.sent).toEqual(["fight:5001:1"]);
  expect(stats.scans).toBe(1);
  expect(job.status()).toMatchObject({ state: "stopped", uncertain: outcome === "unknown" });
});

it("a transport failure while executing is an uncertain outcome: stop, never replay", async () => {
  const game = new FakeGame(1);
  const { job, transport, stats } = harness(game);
  transport.execute = async () => {
    throw new Error("operation_timeout");
  };
  await run(60_000);
  expect(job.status()).toMatchObject({ state: "stopped", uncertain: true });
  expect(job.status().stopReason).toContain("Outcome uncertain");
  expect(stats.scans).toBe(1);
});

it("stop during a wait ends at once and sends nothing more", async () => {
  const game = new FakeGame(0);
  const { job, stats } = harness(game);
  await run(5_000);
  expect(job.status().phase).toBe("waiting");
  const scans = stats.scans;
  job.requestStop();
  expect(job.status().state).toBe("stopped");
  await run(30 * 60_000);
  expect(stats.scans).toBe(scans);
  await job.done;
});

it("stop during an in-flight action keeps its receipt and sends nothing after", async () => {
  const game = new FakeGame(1);
  const { job, transport, stats } = harness(game);
  const execute = transport.execute.bind(transport);
  transport.execute = async (s) => {
    job.requestStop();
    return execute(s);
  };
  await run(60_000);
  expect(game.sent).toEqual(["fight:5001:1"]);
  expect(job.status()).toMatchObject({ state: "stopped", counters: { actions: 1 } });
  expect(stats.scans).toBe(1);
});

it("a session end during an action stops with an uncertain outcome", async () => {
  const game = new FakeGame(1);
  const { job, transport, stats } = harness(game);
  let finish: (r: Run) => void = () => {};
  transport.execute = () => new Promise<Run>((resolve) => (finish = resolve));
  await run(1_000);
  expect(job.status().phase).toBe("executing");
  job.end();
  expect(job.status()).toMatchObject({ state: "stopped", uncertain: true });
  finish({ receipts: [{ title: "x", command: 5001, status: "confirmed", won: true }], notRun: 0 });
  await run(60_000);
  expect(stats.scans).toBe(1);
  expect(job.status().counters.actions).toBe(0);
});

it("a session that closes on its own ends the job at its next scan", async () => {
  const game = new FakeGame(0);
  const { job, transport, stats } = harness(game);
  await run(5_000);
  expect(job.status().phase).toBe("waiting");
  transport.scan = async () => {
    throw new Error("session_closed");
  };
  await run(60_000);
  expect(job.status()).toMatchObject({ state: "stopped", uncertain: false });
  expect(job.status().stopReason).toContain("session ended");
  expect(job.status().counters.rejected).toBe(0);
  expect(stats.executes).toBe(0);
});

it("never interleaves with an interactive request holding the lock", async () => {
  const game = new FakeGame(1);
  game.outcome = (s, g) => (s.command === 5001 ? (g.rebuilt.size ? "win" : "lose") : "ok");
  const { job, lock, stats } = harness(game);
  lock.busy = true; // an interactive operation is in progress
  await run(5_000);
  expect(stats.scans).toBe(0);
  lock.busy = false;
  await run(30_000);
  expect(game.sent).toHaveLength(3);
  expect(stats.maxInFlight).toBe(1);
  job.requestStop();
});

it("stops when the class changes outside the job", async () => {
  const game = new FakeGame(0);
  const { job } = harness(game);
  await run(5_000);
  game.build = [2, 1];
  await run(60_000);
  expect(job.status().stopReason).toContain("changed outside");
  expect(game.sent).toEqual([]);
});

it("stops when the game session or character changes", async () => {
  const game = new FakeGame(0);
  const { job } = harness(game);
  await run(5_000);
  game.sessionId = "other";
  await run(60_000);
  expect(job.status().stopReason).toContain("session changed");
});

it("honours optional action caps and keeps a bounded log", async () => {
  const game = new FakeGame(1, 5);
  const { job } = harness(game, { maxActions: 2 });
  await run(60_000);
  expect(game.sent).toEqual(["claim:0", "claim:1"]);
  expect(job.status().stopReason).toContain("action cap");
  const { lines, next } = job.lines(0);
  expect(lines.at(-1)?.seq).toBe(next);
  expect(job.lines(next).lines).toEqual([]);
});

it("validates start options strictly", () => {
  expect(parseOptions({})).toMatchObject({ classSwitch: true, assist: false, maxActions: null });
  expect(parseOptions({ classSwitch: false, maxMinutes: 30 })).toMatchObject({
    classSwitch: false,
    maxMinutes: 30,
  });
  for (const bad of [{ classSwitch: "yes" }, { maxActions: 0 }, { maxActions: 1.5 }, { other: 1 }])
    expect(parseOptions(bad)).toBeNull();
});

// ---- Pure decision core: cases outside the fake game's shape ----
function scanOf(steps: Step[]): Scan {
  return {
    scanId: "s",
    sessionId: "session",
    checkedAt: 86400 * 10,
    character: { id: "1", name: "F", realm: "r", level: 50, power: "1000" },
    steps,
    warnings: [],
    maxSteps: 24,
  };
}
function feed(state: JobState, scan: Scan) {
  return reduce(state, { type: "scanned", scan, now: 0 });
}
it("a lost score-based fight is not a stop condition and is not repeated that game day", () => {
  const boss: Step = {
    key: "fight:5033:x",
    revision: "a",
    kind: "fight",
    command: 5033,
    title: "Baphomet challenge",
    detail: "",
    autoGroup: "world",
    available: 1,
  };
  let out = reduce(initialState(DEFAULT_PROGRESS_OPTIONS, 0), { type: "start" });
  out = feed(out.state, scanOf([boss]));
  expect(out.command?.type).toBe("prepare");
  out = reduce(out.state, {
    type: "prepared",
    review: { ticket: "", normalized: { scanId: "s", keys: [boss.key] }, steps: [boss] },
  });
  out = reduce(out.state, {
    type: "executed",
    run: { receipts: [{ title: "b", command: 5033, status: "confirmed", won: false }], notRun: 0 },
  });
  expect(out.command?.type).toBe("scan");
  expect(feed(out.state, scanOf([{ ...boss, revision: "b" }])).command?.type).toBe("wait");
  const nextDay = { ...scanOf([{ ...boss, revision: "c" }]), checkedAt: 86400 * 11 };
  expect(feed(out.state, nextDay).command?.type).toBe("prepare");
});

it("reads each fight fingerprint from class, spec, level, power, stats and skills", async () => {
  const { fingerprint } = await import("../src/lib/game/progression.ts");
  const game = new FakeGame(1);
  const a = fingerprint(game.scan());
  game.rebuilt.add("1,1");
  expect(fingerprint(game.scan())).not.toBe(a);
});
