import { randomUUID } from "node:crypto";
import type { JobStatus, LogEntry } from "../src/lib/game/automation-feed.ts";
import type { Run, Scan, Selection, Step } from "../src/lib/game/daily-types.ts";
import {
  initialState,
  KEEPALIVE_MS,
  MIN_ACTION_GAP_MS,
  reduce,
  type Command,
  type JobEvent,
  type JobState,
  type LogDraft,
  type ProgressOptions,
} from "../src/lib/game/progression.ts";

// The session worker commands the bridge already uses: -9100 scan, -9101 prepare/run.
export type JobTransport = {
  scan(): Promise<Scan>;
  prepare(selection: Selection): Promise<{ steps: Step[]; normalized: Selection }>;
  execute(selection: Selection): Promise<Run>;
  // One heartbeat through the session worker; keeps it and the game session alive during waits.
  keepalive(): Promise<unknown>;
};
export type JobHooks = {
  // Shares the bridge's single-operation lock; false while an interactive request holds it.
  acquire(): boolean;
  release(): void;
  keepAlive(): void;
  now?: () => number;
};
export type { JobStatus, LogEntry };
export const LOG_LIMIT = 3000;
const LOCK_POLL_MS = 250;
const LOCK_WAIT_MS = 60_000;

export class ProgressionJob {
  readonly id = randomUUID();
  private state: JobState;
  private entries: LogEntry[] = [];
  private seq = 0;
  private endedAt: number | null = null;
  private stallSince = 0;
  private wake?: () => void;
  private timer?: NodeJS.Timeout;
  private inFlight = 0;
  private nextScanAt: number | null = null;
  // Keepalives sent during waits (tests read this).
  keepalives = 0;
  readonly done: Promise<void>;
  private now: () => number;
  private transport: JobTransport;
  private hooks: JobHooks;

  constructor(options: ProgressOptions, transport: JobTransport, hooks: JobHooks) {
    this.transport = transport;
    this.hooks = hooks;
    this.now = hooks.now ?? Date.now;
    this.state = initialState(options, this.now());
    this.done = this.loop();
  }

  get active() {
    return this.state.phase !== "stopped";
  }
  // Never more than one transport request at a time; tests assert on this.
  get requestsInFlight() {
    return this.inFlight;
  }

  requestStop() {
    this.apply({ type: "stopRequested" });
    if (!this.active) this.interrupt();
  }
  // The owning game session ended (idle, disconnect, reconnect or server close).
  end() {
    this.apply({ type: "sessionEnded" });
    this.interrupt();
  }

  status(): JobStatus {
    const s = this.state;
    return {
      id: this.id,
      state: s.phase === "stopped" ? "stopped" : s.stopRequested ? "stopping" : "running",
      phase: s.phase,
      startedAt: s.startedAt,
      endedAt: this.endedAt,
      options: s.options,
      counters: { ...s.counters },
      stage: s.stage,
      power: s.power,
      stall: s.stall
        ? {
            stage: s.stall.stage,
            origin: { career: s.stall.origin.career, spec: s.stall.origin.spec },
            since: this.stallSince,
          }
        : null,
      current: s.plan?.step.title ?? null,
      nextScanAt: this.nextScanAt,
      stopReason: s.stopReason,
      uncertain: s.uncertain,
    };
  }

  lines(after: number) {
    const first = this.entries[0]?.seq ?? this.seq + 1;
    return {
      lines: this.entries.filter((e) => e.seq > after),
      next: this.seq,
      dropped: after + 1 < first && this.seq > 0,
    };
  }

  private write(drafts: LogDraft[]) {
    for (const d of drafts) {
      this.entries.push({ ...d, seq: ++this.seq, time: this.now() });
      if (this.entries.length > LOG_LIMIT) this.entries.shift();
    }
  }

  private apply(event: JobEvent): Command | null {
    const hadStall = this.state.stall?.id;
    const out = reduce(this.state, event);
    this.state = out.state;
    if (out.state.stall && out.state.stall.id !== hadStall) this.stallSince = this.now();
    this.write(out.log);
    if (!this.active && this.endedAt === null) this.endedAt = this.now();
    return out.command;
  }

  private interrupt() {
    clearTimeout(this.timer);
    this.wake?.();
  }

  // Resolves after ms, or early when the job stops.
  private sleep(ms: number) {
    return new Promise<void>((resolve) => {
      if (!this.active) return resolve();
      this.wake = () => {
        clearTimeout(this.timer);
        this.wake = undefined;
        resolve();
      };
      this.timer = setTimeout(() => this.wake?.(), ms);
    });
  }

  private async lock() {
    const deadline = this.now() + LOCK_WAIT_MS;
    while (this.active) {
      if (this.hooks.acquire()) return true;
      if (this.now() >= deadline) return false;
      await this.sleep(LOCK_POLL_MS);
    }
    return false;
  }

  // One request, holding the bridge lock. `sent` is false only when the transport was never called.
  private async request<T>(
    call: () => Promise<T>,
    ok: (value: T) => JobEvent,
  ): Promise<JobEvent | null> {
    if (!(await this.lock()))
      return this.active ? { type: "failed", code: "bridge_busy", sent: false } : null;
    this.hooks.keepAlive();
    this.inFlight += 1;
    try {
      return ok(await call());
    } catch (e) {
      const code =
        e instanceof Error && /^[a-z][a-z_0-9]{1,65}$/.test(e.message)
          ? e.message
          : "operation_failed";
      return { type: "failed", code, sent: true };
    } finally {
      this.inFlight -= 1;
      this.hooks.release();
      this.hooks.keepAlive();
    }
  }

  // Sleeps until the rescan is due, sending a keepalive every KEEPALIVE_MS. Stop interrupts at once;
  // a failed keepalive is a session end (only a heartbeat was sent, so nothing is uncertain).
  private async wait(ms: number): Promise<JobEvent | null> {
    const until = this.now() + ms;
    this.nextScanAt = until;
    this.hooks.keepAlive();
    try {
      while (this.active) {
        const left = until - this.now();
        if (left <= 0) break;
        await this.sleep(Math.min(KEEPALIVE_MS, left));
        if (!this.active) return null;
        if (until - this.now() <= 0) break;
        if (!(await this.lock())) {
          if (!this.active) return null;
          continue; // the lock stayed busy: skip this keepalive, the next one is a minute away
        }
        this.inFlight += 1;
        this.hooks.keepAlive();
        try {
          await this.transport.keepalive();
          this.keepalives += 1;
        } catch (e) {
          const code =
            e instanceof Error && /^[a-z][a-z_0-9]{1,65}$/.test(e.message)
              ? e.message
              : "keepalive_failed";
          return {
            type: "sessionEnded",
            reason: `The game session ended while waiting: the keepalive heartbeat failed (${code}).`,
          };
        } finally {
          this.inFlight -= 1;
          this.hooks.release();
          this.hooks.keepAlive();
        }
      }
      return this.active ? { type: "woke", now: this.now() } : null;
    } finally {
      this.nextScanAt = null;
    }
  }

  private async loop() {
    await Promise.resolve();
    let command = this.apply({ type: "start" });
    let first = true;
    while (command && command.type !== "stop" && this.active) {
      let event: JobEvent | null = null;
      if (command.type === "scan") {
        if (!first) await this.sleep(MIN_ACTION_GAP_MS);
        first = false;
        if (!this.active) break;
        event = await this.request(
          () => this.transport.scan(),
          (scan) => ({ type: "scanned", scan, now: this.now() }),
        );
      } else if (command.type === "prepare") {
        const selection = { scanId: command.scanId, keys: [command.plan.step.key] };
        event = await this.request(
          () => this.transport.prepare(selection),
          (review) => ({ type: "prepared", review: { ticket: "", ...review } }),
        );
      } else if (command.type === "execute") {
        const selection = command.review.normalized;
        event = await this.request(
          () => this.transport.execute(selection),
          (run) => ({ type: "executed", run }),
        );
      } else if (command.type === "wait") {
        event = await this.wait(command.ms);
      }
      if (!event || !this.active) break;
      command = this.apply(event);
      // A stop requested while the request was in flight is applied by the reducer above.
    }
    clearTimeout(this.timer);
  }
}

const bool = (v: unknown, fallback: boolean) => (v === undefined ? fallback : v);
// Accepts only the documented option fields; anything else is a 400.
export function parseOptions(input: Record<string, unknown>): ProgressOptions | null {
  const allowed = [
    "classSwitch",
    "specSwitch",
    "statReset",
    "dailies",
    "freeListings",
    "assist",
    "maxActions",
    "maxMinutes",
  ];
  if (Object.keys(input).some((k) => !allowed.includes(k))) return null;
  const flags = ["classSwitch", "specSwitch", "statReset", "dailies", "freeListings", "assist"];
  if (flags.some((k) => input[k] !== undefined && typeof input[k] !== "boolean")) return null;
  const cap = (v: unknown, max: number) =>
    v === undefined || v === null
      ? null
      : typeof v === "number" && Number.isInteger(v) && v >= 1 && v <= max
        ? v
        : undefined;
  const maxActions = cap(input.maxActions, 100_000);
  const maxMinutes = cap(input.maxMinutes, 7 * 24 * 60);
  if (maxActions === undefined || maxMinutes === undefined) return null;
  return {
    classSwitch: bool(input.classSwitch, true) as boolean,
    specSwitch: bool(input.specSwitch, true) as boolean,
    statReset: bool(input.statReset, true) as boolean,
    dailies: bool(input.dailies, true) as boolean,
    freeListings: bool(input.freeListings, true) as boolean,
    assist: bool(input.assist, false) as boolean,
    maxActions,
    maxMinutes,
  };
}
