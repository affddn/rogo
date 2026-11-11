import { expect, it } from "vite-plus/test";
import {
  copyText,
  DOM_CAP,
  emptyFeed,
  formatLine,
  isActive,
  mergeFeed,
  pollDelay,
  POLL_ACTIVE_MS,
  POLL_IDLE_MS,
  POLL_NONE_MS,
  type FeedResponse,
  type JobStatus,
  type LogEntry,
} from "./automation-feed";
import { DEFAULT_PROGRESS_OPTIONS } from "./progression";

function job(id = "a", state: JobStatus["state"] = "running"): JobStatus {
  return {
    id,
    state,
    phase: state === "stopped" ? "stopped" : "waiting",
    startedAt: 0,
    endedAt: null,
    options: DEFAULT_PROGRESS_OPTIONS,
    counters: { actions: 0, clears: 0, defeats: 0, rejected: 0 },
    stage: 101,
    power: "1000",
    stall: null,
    current: null,
    stopReason: state === "stopped" ? "Stopped on request." : null,
    uncertain: false,
  };
}
const line = (seq: number): LogEntry => ({ seq, time: 0, level: "info", text: `line ${seq}` });
const lines = (from: number, to: number) =>
  Array.from({ length: to - from + 1 }, (_, i) => line(from + i));
const response = (r: Partial<FeedResponse>): FeedResponse => ({
  job: job(),
  lines: [],
  next: 0,
  dropped: false,
  ...r,
});
const seqs = (items: ReturnType<typeof mergeFeed>["items"]) =>
  items.map((i) => (i.kind === "line" ? i.line.seq : "gap"));

it("merges by seq without duplicates, in order, and advances the cursor", () => {
  let feed = mergeFeed(emptyFeed, response({ lines: lines(1, 3), next: 3 }));
  feed = mergeFeed(feed, response({ lines: [line(5), line(3), line(4)], next: 5 }));
  feed = mergeFeed(feed, response({ lines: lines(4, 5), next: 5 }));
  expect(seqs(feed.items)).toEqual([1, 2, 3, 4, 5]);
  expect(feed.after).toBe(5);
});

it("marks dropped lines once, including when nothing new arrived", () => {
  let feed = mergeFeed(emptyFeed, response({ lines: lines(1, 2), next: 2 }));
  feed = mergeFeed(feed, response({ lines: lines(10, 11), next: 11, dropped: true }));
  expect(seqs(feed.items)).toEqual([1, 2, "gap", 10, 11]);
  const quiet = mergeFeed(feed, response({ lines: [], next: 20, dropped: true }));
  expect(seqs(quiet.items)).toEqual([1, 2, "gap", 10, 11, "gap"]);
  expect(quiet.after).toBe(20);
  const again = mergeFeed(quiet, response({ lines: [], next: 20, dropped: true }));
  expect(again.items).toHaveLength(quiet.items.length);
});

it("keeps at most DOM_CAP items, starting with a dropped marker", () => {
  let feed = mergeFeed(emptyFeed, response({ lines: lines(1, DOM_CAP), next: DOM_CAP }));
  expect(feed.items).toHaveLength(DOM_CAP);
  feed = mergeFeed(feed, response({ lines: lines(DOM_CAP + 1, DOM_CAP + 50), next: DOM_CAP + 50 }));
  expect(feed.items).toHaveLength(DOM_CAP);
  expect(feed.items[0].kind).toBe("gap");
  expect(feed.items.at(-1)).toMatchObject({ kind: "line", line: { seq: DOM_CAP + 50 } });
  feed = mergeFeed(
    feed,
    response({ lines: lines(DOM_CAP + 51, DOM_CAP + 60), next: DOM_CAP + 60 }),
  );
  expect(feed.items.filter((i) => i.kind === "gap")).toHaveLength(1);
});

it("starts a fresh log for a new job and clears when this browser has none", () => {
  let feed = mergeFeed(emptyFeed, response({ lines: lines(1, 5), next: 5 }));
  feed = mergeFeed(feed, response({ job: job("b"), lines: lines(1, 2), next: 2 }));
  expect(seqs(feed.items)).toEqual([1, 2]);
  expect(feed.job?.id).toBe("b");
  expect(mergeFeed(feed, response({ job: null }))).toEqual(emptyFeed);
});

it("follows start and stop transitions in the job status", () => {
  let feed = mergeFeed(
    emptyFeed,
    response({ job: job("a", "running"), lines: lines(1, 1), next: 1 }),
  );
  expect(isActive(feed.job)).toBe(true);
  feed = mergeFeed(feed, response({ job: job("a", "stopping"), next: 1 }));
  expect(isActive(feed.job)).toBe(true);
  feed = mergeFeed(feed, response({ job: job("a", "stopped"), lines: lines(2, 2), next: 2 }));
  expect(isActive(feed.job)).toBe(false);
  expect(feed.job?.stopReason).toBeTruthy();
  expect(seqs(feed.items)).toEqual([1, 2]);
});

it("polls fast while active, slowly when stopped, and pauses while hidden", () => {
  expect(pollDelay(job(), false)).toBe(POLL_ACTIVE_MS);
  expect(pollDelay(job("a", "stopping"), false)).toBe(POLL_ACTIVE_MS);
  expect(pollDelay(job("a", "stopped"), false)).toBe(POLL_IDLE_MS);
  expect(pollDelay(null, false)).toBe(POLL_NONE_MS);
  expect(pollDelay(job(), true)).toBeNull();
});

it("formats copied lines with a level tag that does not rely on colour", () => {
  const feed = mergeFeed(
    emptyFeed,
    response({ lines: [{ ...line(1), level: "warn", text: "careful" }], next: 1, dropped: true }),
  );
  const text = copyText(feed, "en-GB");
  expect(text.split("\n")[0]).toContain("dropped");
  expect(text).toMatch(/WARN\s+careful$/);
  expect(formatLine({ ...line(2), level: "error" }, "en-GB")).toContain("ERROR");
});
