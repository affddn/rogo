import { EventEmitter } from "node:events";
import type { IncomingMessage, ServerResponse } from "node:http";
import { Readable } from "node:stream";
import path from "node:path";
import { expect, it, vi } from "vite-plus/test";
import { OperationReview } from "./operation-review.ts";
import { rogoBridge } from "./rogo-bridge.ts";

it("binds reviews to one command, payload, active session and two-minute window", () => {
  vi.useFakeTimers();
  try {
    const review = new OperationReview();
    const payload = { id: "9007199254740993" };
    const old = review.issue(4043, payload);
    const fresh = review.issue(4043, payload);
    expect(review.consume(old, 4043, payload)).toBe(false);
    expect(review.consume(fresh, 4049, payload)).toBe(false);
    expect(review.consume(fresh, 4043, {})).toBe(false);
    expect(review.consume(fresh, 4043, payload)).toBe(true);
    expect(review.consume(fresh, 4043, payload)).toBe(false);
    const stale = review.issue(4043, payload);
    vi.advanceTimersByTime(120000);
    expect(review.consume(stale, 4043, payload)).toBe(false);
    const ended = review.issue(4043, payload);
    review.clear();
    expect(review.consume(ended, 4043, payload)).toBe(false);
  } finally {
    vi.useRealTimers();
  }
});

function route(enabled: boolean, bind = "127.0.0.1") {
  vi.stubEnv("ROGO_CONNECT", enabled ? "1" : "");
  const plugin = rogoBridge();
  vi.unstubAllEnvs();
  const use = vi.fn();
  const server = Object.assign(new EventEmitter(), {
    address: () => ({ address: bind, port: 5176 }),
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
  return async (url: string, method = "GET", json = "", headers: Record<string, string> = {}) => {
    const req = Object.assign(Readable.from([Buffer.from(json)]), {
      url,
      method,
      socket: { remoteAddress: "127.0.0.1" },
      headers: {
        host: "127.0.0.1:5176",
        origin: "http://127.0.0.1:5176",
        "x-rogo-connect": "1",
        "content-type": "application/json",
        ...headers,
      },
    });
    const res = { writeHead: vi.fn(), end: vi.fn() };
    await handler(req as unknown as IncomingMessage, res as unknown as ServerResponse, vi.fn());
    return { code: res.writeHead.mock.calls[0][0], body: JSON.parse(res.end.mock.calls[0][0]) };
  };
}

it("requires opt-in, a loopback listener and the exact origin; rejects foreign and unowned requests", async () => {
  const op = "/api/rogo/operations",
    read = JSON.stringify({ operation: "gateway.execute", command: 4651, payload: {} });
  expect((await route(false)(op, "POST", read)).code).toBe(503);
  expect((await route(true, "0.0.0.0")(op, "POST", read)).code).toBe(403);
  const call = route(true);
  expect((await call(op, "POST", read, { origin: "http://localhost:5175" })).code).toBe(403);
  expect((await call(op, "POST", read, { "x-forwarded-for": "127.0.0.1" })).code).toBe(403);
  expect((await call(op, "POST", read, { "x-rogo-connect": "" })).code).toBe(403);
  expect((await call(op, "POST", read)).code).toBe(403);
  expect(
    (await call(op, "POST", '{"operation":"gateway.prepare","payload":{"id":9007199254740993}}'))
      .code,
  ).toBe(400);
  const catalog = await call("/api/rogo/catalog");
  expect(catalog.body.actions).toHaveLength(260);
  expect(
    catalog.body.actions.filter((a: { availability: string }) => a.availability === "blocked"),
  ).toHaveLength(40);
});
