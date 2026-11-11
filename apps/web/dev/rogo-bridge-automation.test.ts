// Bridge routes for the progression job, with the VMOS device and the Python worker replaced by
// in-memory fakes. Nothing here touches adb, the network or a game server.
import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import path from "node:path";
import { Readable } from "node:stream";
import { afterEach, expect, it, vi } from "vite-plus/test";
import { FakeGame } from "../src/lib/game/progression.fixture.ts";

const shared = vi.hoisted(() => ({
  game: undefined as unknown as FakeGame,
  calls: [] as string[],
  inFlight: 0,
  maxInFlight: 0,
  hold: undefined as Promise<void> | undefined,
}));

vi.mock("./vmos-device.ts", () => ({
  acquireDevice: async () => ({ serial: "fake", serverId: "1321017", release: async () => {} }),
}));
vi.mock("./rogo-worker.ts", async (original) => {
  const actual = await original<typeof import("./rogo-worker.ts")>();
  class FakeWorker {
    ended = false;
    async receive() {
      return {
        serverId: "1321017",
        playerId: "1",
        name: "Fixture",
        level: 50,
        power: "1000",
        spec: 21,
        stageEntry: 101,
        cards: null,
        skills: null,
      };
    }
    async operation(mode: string, command: number, payload: never) {
      if (this.ended) throw new Error("session_closed");
      shared.calls.push(`${mode}:${command}`);
      shared.inFlight += 1;
      shared.maxInFlight = Math.max(shared.maxInFlight, shared.inFlight);
      try {
        await shared.hold;
        if (command === -9100) return shared.game.scan();
        if (command === -9101 && mode === "prepare") return shared.game.review(payload);
        if (command === -9101) return shared.game.run(payload);
        return { command, reply: command + 1, status: 0, data: {} };
      } finally {
        shared.inFlight -= 1;
      }
    }
    stop() {
      this.ended = true;
    }
  }
  return { ...actual, RogoWorker: FakeWorker };
});

const { rogoBridge } = await import("./rogo-bridge.ts");

function bridge() {
  vi.stubEnv("ROGO_CONNECT", "1");
  const plugin = rogoBridge();
  vi.unstubAllEnvs();
  const use = vi.fn();
  const server = Object.assign(new EventEmitter(), {
    address: () => ({ address: "127.0.0.1", port: 5176 }),
  });
  if (typeof plugin.configureServer !== "function") throw new Error("Missing middleware");
  Reflect.apply(plugin.configureServer, {}, [
    {
      config: { root: path.resolve(import.meta.dirname, "..") },
      httpServer: server,
      middlewares: { use },
    },
  ]);
  const handler = use.mock.calls[0][0] as (
    req: IncomingMessage,
    res: ServerResponse,
    next: () => void,
  ) => Promise<void>;
  let cookie = "";
  const call = async (url: string, json?: unknown, headers: Record<string, string> = {}) => {
    const req = Object.assign(Readable.from([Buffer.from(json ? JSON.stringify(json) : "")]), {
      url,
      method: json ? "POST" : "GET",
      socket: { remoteAddress: "127.0.0.1" },
      headers: {
        host: "127.0.0.1:5176",
        origin: "http://127.0.0.1:5176",
        "x-rogo-connect": "1",
        "content-type": "application/json",
        cookie,
        ...headers,
      },
    });
    const res = Object.assign(new EventEmitter(), {
      writeHead: vi.fn(),
      end: vi.fn(),
      setHeader: (name: string, value: string) => {
        if (name === "Set-Cookie") cookie = value.split(";")[0];
      },
      destroyed: false,
      writableEnded: false,
    });
    await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, vi.fn());
    return { code: res.writeHead.mock.calls[0][0], body: JSON.parse(res.end.mock.calls[0][0]) };
  };
  return { call, server, cookie: () => cookie };
}
const op = "/api/rogo/operations";
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
async function until(check: () => Promise<boolean>) {
  for (let i = 0; i < 200; i++) {
    if (await check()) return;
    await tick(10);
  }
  throw new Error("timed out");
}

afterEach(() => {
  shared.calls = [];
  shared.maxInFlight = 0;
  shared.hold = undefined;
});

it("starts, refuses interleaved operations, tails the log and stops", async () => {
  shared.game = new FakeGame(1);
  shared.game.outcome = (s, g) => (s.command === 5001 ? (g.rebuilt.size ? "win" : "lose") : "ok");
  const { call, server } = bridge();
  expect((await call(op, { operation: "automation.start", payload: {} })).code).toBe(403);
  expect((await call(op, { operation: "character.sync", payload: {} })).code).toBe(200);
  expect((await call(op, { operation: "automation.start", payload: {} })).code).toBe(409);
  expect(
    (
      await call(op, {
        operation: "automation.start",
        confirm: "automation.start",
        payload: { x: 1 },
      })
    ).code,
  ).toBe(400);
  let release: () => void = () => {};
  shared.hold = new Promise((r) => (release = r));
  const started = await call(op, {
    operation: "automation.start",
    confirm: "automation.start",
    payload: { dailies: false },
  });
  expect(started.code).toBe(200);
  expect(started.body.job).toMatchObject({ state: "running", options: { dailies: false } });
  await until(async () => shared.calls.length > 0);
  // While the job's request is in flight, and between its requests, interactive writes get 409.
  for (const operation of [
    "routine.scan",
    "campaign.prepare",
    "gateway.execute",
    "character.sync",
  ]) {
    const r = await call(op, { operation, payload: {}, command: 4651 });
    expect(r.code).toBe(409);
  }
  expect(
    (await call(op, { operation: "automation.start", confirm: "automation.start", payload: {} }))
      .code,
  ).toBe(409);
  release();
  shared.hold = undefined;
  await until(
    async () => (await call("/api/rogo/automation?after=0")).body.job.counters.defeats === 1,
  );
  const tail = await call("/api/rogo/automation?after=0");
  expect(tail.body.lines.map((l: { text: string }) => l.text).join("\n")).toContain("Defeat");
  const later = await call(`/api/rogo/automation?after=${tail.body.next}`);
  expect(later.body.lines).toEqual([]);
  expect((await call("/api/rogo/automation", undefined, { "x-rogo-connect": "" })).code).toBe(403);
  const stopped = await call(op, { operation: "automation.stop", payload: {} });
  expect(["stopping", "stopped"]).toContain(stopped.body.job.state);
  await until(async () => (await call("/api/rogo/automation")).body.job.state === "stopped");
  const calls = shared.calls.length;
  await tick(100);
  expect(shared.calls).toHaveLength(calls);
  expect(shared.maxInFlight).toBe(1);
  server.emit("close");
});

it("disconnecting ends the job; another browser cannot read or stop it", async () => {
  shared.game = new FakeGame(0);
  const { call, server, cookie } = bridge();
  await call(op, { operation: "character.sync", payload: {} });
  await call(op, { operation: "automation.start", confirm: "automation.start", payload: {} });
  await until(async () => (await call("/api/rogo/automation")).body.job.phase === "waiting");
  const owner = cookie();
  const stranger = { cookie: "rogo_local=" + "0".repeat(64) };
  expect((await call("/api/rogo/automation", undefined, stranger)).body.job).toBeNull();
  expect((await call(op, { operation: "automation.stop", payload: {} }, stranger)).code).toBe(404);
  expect((await call(op, { operation: "session.disconnect", payload: {} })).code).toBe(200);
  const after = await call("/api/rogo/automation", undefined, { cookie: owner });
  expect(after.body.job).toMatchObject({ state: "stopped", uncertain: false });
  expect(after.body.job.stopReason).toContain("session ended");
  server.emit("close");
});

it("the worker keepalive is not reachable as a browser gateway command", async () => {
  shared.game = new FakeGame(0);
  const { call, server } = bridge();
  await call(op, { operation: "character.sync", payload: {} });
  for (const operation of ["gateway.prepare", "gateway.execute"]) {
    const r = await call(op, { operation, command: -9102, payload: {} });
    expect(r.code).toBe(400);
  }
  expect(shared.calls).not.toContain("prepare:-9102");
  server.emit("close");
});
