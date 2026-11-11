import { expect, it, vi } from "vite-plus/test";
import {
  makeAutoPlan,
  previewAuto,
  runAuto,
  MAX_AUTO_MS,
  type AutoTransport,
} from "./daily-autorun";
import type { Run, Scan, Step } from "./daily-types";

function step(key: string, kind: Step["kind"] = "claim", extra: Partial<Step> = {}): Step {
  return {
    key,
    revision: "a",
    kind,
    command: kind === "claim" ? 4223 : kind === "offer" ? 4191 : kind === "sweep" ? 5011 : 5013,
    title: key,
    detail: key,
    ...extra,
  };
}
function scan(steps: Step[], extra: Partial<Scan> = {}): Scan {
  return {
    scanId: "scan",
    sessionId: "session",
    checkedAt: 100,
    character: { id: "1", name: "Fixture", realm: "realm", level: 50, power: "1000" },
    steps,
    warnings: [],
    maxSteps: 24,
    ...extra,
  };
}
function harness(scans: Scan[], receipt: Partial<Run["receipts"][number]> = {}) {
  let selected: Step;
  const api: AutoTransport = {
    scan: vi.fn(async () => scans.shift()!),
    prepare: vi.fn(async (s, row) => {
      selected = row;
      return { ticket: "ticket", normalized: { scanId: s.scanId, keys: [row.key] }, steps: [row] };
    }),
    execute: vi.fn(
      async (): Promise<Run> => ({
        receipts: [
          { title: selected.title, command: selected.command, status: "confirmed", ...receipt },
        ],
        notRun: 0,
      }),
    ),
  };
  return api;
}
const rewards = { mode: "rewards" as const, shops: false, maxActions: 40 };
const signal = () => new AbortController().signal;

it("rescans each action and collects newly unlocked claim revisions, not modes or shops by default", async () => {
  const a = step("album"),
    next = { ...a, revision: "b" },
    offer = step("shop", "offer");
  const sweep = step("realm", "sweep", { autoGroup: "realm:1", available: 3 });
  const initial = scan([a, offer, sweep]),
    api = harness([initial, scan([next, offer, sweep]), scan([offer, sweep])]);
  const out = await runAuto(makeAutoPlan(initial, rewards), api, signal(), vi.fn());
  expect(out.status).toBe("complete");
  expect(out.receipts).toHaveLength(2);
  expect(api.scan).toHaveBeenCalledTimes(3);
  expect(api.execute).toHaveBeenCalledTimes(2);
});
it("does not replay a confirmed claim that still appears unchanged", async () => {
  const initial = scan([step("claim")]),
    api = harness([initial, initial]);
  const out = await runAuto(makeAutoPlan(initial, rewards), api, signal(), vi.fn());
  expect(api.execute).toHaveBeenCalledTimes(1);
  expect(out.message).toContain("not repeated");
});
it("a stop during an in-flight write preserves its receipt but sends nothing else", async () => {
  const initial = scan([step("one"), step("two")]),
    controller = new AbortController(),
    api = harness([initial]);
  api.execute = vi.fn(async (): Promise<Run> => {
    controller.abort();
    return { receipts: [{ command: 4223, title: "one", status: "confirmed" }], notRun: 0 };
  });
  const out = await runAuto(makeAutoPlan(initial, rewards), api, controller.signal, vi.fn());
  expect(out.status).toBe("stopped");
  expect(out.receipts).toHaveLength(1);
  expect(api.scan).toHaveBeenCalledTimes(1);
});
it("a stop during prepare never sends the prepared write", async () => {
  const initial = scan([step("one")]),
    controller = new AbortController(),
    api = harness([initial]);
  const prepare = api.prepare;
  api.prepare = async (...args) => {
    const review = await prepare(...args);
    controller.abort();
    return review;
  };
  await runAuto(makeAutoPlan(initial, rewards), api, controller.signal, vi.fn());
  expect(api.execute).not.toHaveBeenCalled();
});
it.each(["rejected", "unknown", "stopped"] as const)("stops at a %s receipt", async (status) => {
  const initial = scan([step("one"), step("two")]),
    api = harness([initial], { status });
  expect((await runAuto(makeAutoPlan(initial, rewards), api, signal(), vi.fn())).status).toBe(
    "stopped",
  );
  expect(api.execute).toHaveBeenCalledTimes(1);
});
it("does not retry or reconnect after an uncertain transport failure", async () => {
  const initial = scan([step("one")]),
    api = harness([initial]);
  api.execute = vi.fn(async (): Promise<Run> => {
    throw new Error("lost connection");
  });
  const out = await runAuto(makeAutoPlan(initial, rewards), api, signal(), vi.fn());
  expect(out.message).toContain("Outcome uncertain");
  expect(api.execute).toHaveBeenCalledTimes(1);
  expect(api.scan).toHaveBeenCalledTimes(1);
});
it("binds to the original session and character, even for the same nickname", async () => {
  const initial = scan([step("one")]);
  for (const changed of [
    scan(initial.steps, { sessionId: "new" }),
    scan(initial.steps, { character: { ...initial.character, id: "2" } }),
  ]) {
    const api = harness([changed]);
    expect((await runAuto(makeAutoPlan(initial, rewards), api, signal(), vi.fn())).status).toBe(
      "stopped",
    );
    expect(api.prepare).not.toHaveBeenCalled();
  }
});
it("does not send when the prepared revision changes", async () => {
  const a = step("one"),
    initial = scan([a]),
    api = harness([initial]);
  api.prepare = async () => ({
    ticket: "t",
    normalized: { scanId: initial.scanId, keys: [a.key] },
    steps: [{ ...a, revision: "new" }],
  });
  await runAuto(makeAutoPlan(initial, rewards), api, signal(), vi.fn());
  expect(api.execute).not.toHaveBeenCalled();
});
it("enforces action and elapsed-time limits", async () => {
  const initial = scan([step("one"), step("two")]),
    api = harness([initial]);
  expect(
    (await runAuto(makeAutoPlan(initial, { ...rewards, maxActions: 1 }), api, signal(), vi.fn()))
      .message,
  ).toContain("action limit");
  const clock = vi.fn().mockReturnValueOnce(0).mockReturnValue(MAX_AUTO_MS),
    timed = harness([]);
  expect(
    (await runAuto(makeAutoPlan(initial, rewards), timed, signal(), vi.fn(), clock)).message,
  ).toContain("10-minute");
  expect(timed.scan).not.toHaveBeenCalled();
});
it("selects one weaker Arena opponent and excludes over-power fights", () => {
  const initial = scan([
    step("hard", "fight", { autoGroup: "mvp:1", powerRatio: 0.7, available: 1 }),
    step("arena-strong", "duel", { autoGroup: "arena", powerRatio: 1.1, available: 5 }),
    step("arena-weak", "duel", { autoGroup: "arena", powerRatio: 4, available: 5 }),
    step("realm", "sweep", { autoGroup: "realm:1", available: 8 }),
  ]);
  const plan = makeAutoPlan(initial, { ...rewards, mode: "fights" });
  expect(previewAuto(plan).map((s) => s.key)).toEqual(["arena-weak", "realm"]);
  expect(plan.sweepLimits).toEqual({ "realm:1": 8 });
});
it("does not include newly unlocked mode families", async () => {
  const initial = scan([]),
    api = harness([scan([step("new", "sweep", { autoGroup: "realm:new", available: 5 })])]);
  await runAuto(makeAutoPlan(initial, { ...rewards, mode: "sweeps" }), api, signal(), vi.fn());
  expect(api.execute).not.toHaveBeenCalled();
});
it("stops after defeat without another attempt", async () => {
  const initial = scan([
      step("boss", "fight", { autoGroup: "mvp:1", powerRatio: 2, available: 1 }),
    ]),
    api = harness([initial], { won: false });
  expect(
    (await runAuto(makeAutoPlan(initial, { ...rewards, mode: "fights" }), api, signal(), vi.fn()))
      .message,
  ).toContain("defeat");
  expect(api.execute).toHaveBeenCalledTimes(1);
});
it("sweeps only against decreasing fresh attempt counts and within the original budget", async () => {
  const row = step("sweep", "sweep", { autoGroup: "realm:1", available: 2 }),
    initial = scan([row]);
  const api = harness([initial, scan([{ ...row, available: 1 }]), scan([])]);
  expect(
    (await runAuto(makeAutoPlan(initial, { ...rewards, mode: "sweeps" }), api, signal(), vi.fn()))
      .receipts,
  ).toHaveLength(2);
  const stale = harness([initial, initial]);
  await runAuto(makeAutoPlan(initial, { ...rewards, mode: "sweeps" }), stale, signal(), vi.fn());
  expect(stale.execute).toHaveBeenCalledTimes(1);
});
it("rejects old helper snapshots and invalid action limits", () => {
  expect(() => makeAutoPlan(scan([], { sessionId: "" }), rewards)).toThrow("Reconnect");
  for (const maxActions of [0, 41, 1.5, NaN])
    expect(() => makeAutoPlan(scan([]), { ...rewards, maxActions })).toThrow("action limit");
});

function buildScan(steps: Step[], spec = 21, career = 221) {
  const base = scan(steps);
  return {
    ...base,
    character: {
      ...base.character,
      build: {
        career,
        spec,
        line: spec < 30 ? 200 : 300,
        className: "Class",
        specName: "Branch",
        freePoints: 20,
        choices: [
          { spec: 21, line: 200, name: "Sword", available: true },
          { spec: 32, line: 300, name: "Ice", available: true },
        ],
      },
    },
  };
}
function boss(entry: number): Step {
  return step(`boss:${entry}`, "fight", {
    command: 5001,
    autoGroup: "campaign",
    stageEntry: entry,
    nextStage: entry + 1,
  });
}
function development(
  type: "class" | "spec" | "stats" | "rebuild",
  spec: number,
  career: number,
): Step {
  return step(`${type}:${spec}`, "build", {
    command: type === "class" ? 4521 : type === "spec" ? 4523 : 4529,
    development: { type, spec, career, line: spec < 30 ? 200 : 300 },
  });
}
it("pushes only the reviewed number of consecutive campaign bosses", async () => {
  const initial = scan([boss(101)]),
    api = harness([initial, scan([boss(102)]), scan([boss(103)])], { won: true });
  const out = await runAuto(
    makeAutoPlan(initial, { ...rewards, campaignStages: 2 }),
    api,
    new AbortController().signal,
    vi.fn(),
  );
  expect(out.status).toBe("complete");
  expect(api.execute).toHaveBeenCalledTimes(2);
});
it("never retries an unchanged campaign boss after a confirmed fight", async () => {
  const initial = scan([boss(101)]),
    api = harness([initial, initial], { won: true });
  await runAuto(
    makeAutoPlan(initial, { ...rewards, campaignStages: 5 }),
    api,
    new AbortController().signal,
    vi.fn(),
  );
  expect(api.execute).toHaveBeenCalledTimes(1);
});
it("revises stats before starting campaign combat", async () => {
  const stats = development("stats", 21, 221),
    initial = buildScan([boss(101), stats]);
  const api = harness([initial, buildScan([boss(101)]), buildScan([boss(102)])], { won: true });
  const out = await runAuto(
    makeAutoPlan(initial, { ...rewards, campaignStages: 1, stats: "unused" }),
    api,
    new AbortController().signal,
    vi.fn(),
  );
  expect(out.receipts.map((r) => r.command)).toEqual([4529, 5001]);
});
it("switches only to the selected class and spec, then allocates its points", async () => {
  const change = development("class", 31, 321),
    spec = development("spec", 32, 321),
    stats = development("stats", 32, 321);
  const initial = buildScan([change, development("stats", 21, 221), boss(101)]);
  const api = harness([
    initial,
    buildScan([spec, boss(101)], 31, 321),
    buildScan([stats, boss(101)], 32, 321),
    buildScan([boss(101)], 32, 321),
    buildScan([], 32, 321),
  ]);
  let selected: Step;
  const prepare = api.prepare;
  api.prepare = async (s, row) => {
    selected = row;
    return prepare(s, row);
  };
  api.execute = vi.fn(
    async (): Promise<Run> => ({
      receipts: [
        {
          title: selected.title,
          command: selected.command,
          status: "confirmed",
          won: true,
          ...(selected.command === 4521 || selected.command === 4523
            ? {
                buildState: {
                  career: selected.development!.career,
                  spec: selected.development!.spec,
                },
              }
            : {}),
        },
      ],
      notRun: 0,
    }),
  );
  const out = await runAuto(
    makeAutoPlan(initial, { ...rewards, targetSpec: 32, stats: "unused", campaignStages: 1 }),
    api,
    new AbortController().signal,
    vi.fn(),
  );
  expect(out.receipts.map((r) => r.command)).toEqual([4521, 4523, 4529, 5001]);
});
it("stops before any action on an externally changed class", async () => {
  const initial = buildScan([boss(101)]),
    api = harness([buildScan([boss(101)], 32, 321)]);
  const out = await runAuto(
    makeAutoPlan(initial, { ...rewards, campaignStages: 1 }),
    api,
    new AbortController().signal,
    vi.fn(),
  );
  expect(out.status).toBe("stopped");
  expect(api.execute).not.toHaveBeenCalled();
});
it("does not reset the same build repeatedly within a run", async () => {
  const reset = development("rebuild", 21, 221),
    initial = buildScan([reset]);
  const api = harness([initial, buildScan([{ ...reset, revision: "new" }])]);
  const out = await runAuto(
    makeAutoPlan(initial, { ...rewards, stats: "rebuild" }),
    api,
    new AbortController().signal,
    vi.fn(),
  );
  expect(out.receipts).toHaveLength(1);
});
it("does not silently switch when no target branch was selected", () => {
  const initial = buildScan([development("class", 31, 321)]);
  expect(
    previewAuto(makeAutoPlan(initial, { ...rewards, stats: "unused", advanceClass: true })),
  ).toHaveLength(0);
});
it("rejects locked branches and unreasonable campaign budgets", () => {
  const initial = buildScan([boss(101)]);
  initial.character.build.choices[1].available = false;
  expect(() => makeAutoPlan(initial, { ...rewards, targetSpec: 32 })).toThrow("not unlocked");
  expect(() => makeAutoPlan(initial, { ...rewards, campaignStages: 11 })).toThrow(
    "campaign bosses",
  );
});

function dungeonScan(steps: Step[], used = 0, day = "1000", watching = true): Scan {
  return scan(steps, {
    dungeon: { day, used, reserved: 0, remaining: 5 - used, eligible: true, watching },
  });
}
function invite(team: string, type: "join" | "watch" = "join"): Step {
  return step(team, "assist", {
    command: type === "join" ? 4303 : 4343,
    autoGroup: "dungeon",
    assist: { type, day: "1000", used: 0 },
  });
}
it("waits for newly posted invitations and stops when the daily quota is reached", async () => {
  const initial = dungeonScan([], 4);
  const api = harness([initial, dungeonScan([invite("room")], 4), dungeonScan([], 5)], {
    substeps: [{ command: 4303, reply: 4304, status: "confirmed" }],
  });
  const wait = vi.fn(async () => {});
  const out = await runAuto(
    makeAutoPlan(initial, { ...rewards, assist: true }),
    api,
    new AbortController().signal,
    vi.fn(),
    Date.now,
    wait,
  );
  expect(wait).toHaveBeenCalledTimes(1);
  expect(api.execute).toHaveBeenCalledTimes(1);
  expect(out.status).toBe("complete");
});
it("stops waiting immediately when the user cancels", async () => {
  const initial = dungeonScan([]),
    api = harness([initial]),
    controller = new AbortController();
  const out = await runAuto(
    makeAutoPlan(initial, { ...rewards, assist: true }),
    api,
    controller.signal,
    vi.fn(),
    Date.now,
    async () => {
      controller.abort();
    },
  );
  expect(out.status).toBe("stopped");
  expect(api.execute).not.toHaveBeenCalled();
});
it("never accepts a new game's daily quota without another review", async () => {
  const initial = dungeonScan([]),
    api = harness([dungeonScan([invite("room")], 0, "2000")]);
  const out = await runAuto(
    makeAutoPlan(initial, { ...rewards, assist: true }),
    api,
    new AbortController().signal,
    vi.fn(),
  );
  expect(out.status).toBe("stopped");
  expect(out.message).toContain("day changed");
  expect(api.execute).not.toHaveBeenCalled();
});
it("does not join or wait when assistance is disabled", async () => {
  const initial = dungeonScan([invite("room")]),
    api = harness([initial]),
    wait = vi.fn();
  const out = await runAuto(
    makeAutoPlan(initial, rewards),
    api,
    new AbortController().signal,
    vi.fn(),
    Date.now,
    wait,
  );
  expect(out.status).toBe("complete");
  expect(api.execute).not.toHaveBeenCalled();
  expect(wait).not.toHaveBeenCalled();
});
it("uses at most the remaining invitations reviewed even if a later scan reports more", async () => {
  const initial = dungeonScan([invite("one")], 4),
    api = harness([initial, dungeonScan([invite("two")], 0)], {
      substeps: [{ command: 4303, reply: 4304, status: "confirmed" }],
    });
  const wait = vi.fn();
  await runAuto(
    makeAutoPlan(initial, { ...rewards, assist: true }),
    api,
    new AbortController().signal,
    vi.fn(),
    Date.now,
    wait,
  );
  expect(api.execute).toHaveBeenCalledTimes(1);
  expect(wait).not.toHaveBeenCalled();
});
it("never offers skill allocation or loadout changes, which belong to the progression job", () => {
  const skills = step("skills:21", "build", {
    command: 4525,
    development: { type: "skills", spec: 21, career: 221, line: 200 },
  });
  const loadout = step("loadout:21", "build", {
    command: 4533,
    development: { type: "loadout", spec: 21, career: 221, line: 200 },
  });
  const stats = development("stats", 21, 221);
  const initial = buildScan([skills, loadout, stats, boss(101)]);
  const plan = makeAutoPlan(initial, {
    ...rewards,
    stats: "rebuild",
    advanceClass: true,
    campaignStages: 1,
  });
  const keys = previewAuto(plan).map((s) => s.key);
  expect(keys).toContain(stats.key);
  expect(keys).not.toContain(skills.key);
  expect(keys).not.toContain(loadout.key);
});
it("leaves the free Quick Idle to the progression job", () => {
  const fast = step("idle:4095", "idle", {
    command: 4095,
    idle: { type: "fast", freeBefore: 0, paidBefore: 0 },
  });
  const plan = makeAutoPlan(scan([fast, step("claim")]), { ...rewards, mode: "fights" });
  expect(previewAuto(plan).map((s) => s.key)).toEqual(["claim"]);
});
