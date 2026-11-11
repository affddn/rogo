// The browser side of the progression job: response types and pure log-merging/polling rules.
// The job itself runs in the dev bridge (dev/progression-job.ts) and survives page reloads.
import type { JobState, LogDraft, ProgressOptions } from "./progression.ts";

export type LogEntry = LogDraft & { seq: number; time: number };
export type JobStatus = {
  id: string;
  state: "running" | "stopping" | "stopped";
  phase: JobState["phase"];
  startedAt: number;
  endedAt: number | null;
  options: ProgressOptions;
  counters: JobState["counters"];
  stage: number | null;
  power: string | null;
  stall: { stage: number; origin: { career: number; spec: number }; since: number } | null;
  current: string | null;
  // When a waiting job rescans next (ms since epoch), or null.
  nextScanAt: number | null;
  stopReason: string | null;
  uncertain: boolean;
};
export type FeedResponse = {
  job: JobStatus | null;
  lines: LogEntry[];
  next: number;
  dropped: boolean;
};
export type FeedItem = { kind: "line"; line: LogEntry } | { kind: "gap"; key: string };
export type Feed = { job: JobStatus | null; items: FeedItem[]; after: number };

// Lines kept in the DOM; the server keeps its own, longer buffer.
export const DOM_CAP = 2000;
export const POLL_ACTIVE_MS = 1500;
export const POLL_IDLE_MS = 10_000;
export const POLL_NONE_MS = 5000;

export const emptyFeed: Feed = { job: null, items: [], after: 0 };

export function isActive(job: JobStatus | null) {
  return !!job && job.state !== "stopped";
}

// Merge one GET /api/rogo/automation response. Lines are keyed by seq, so a repeated or
// overlapping poll never duplicates a line; a different job id starts a fresh log.
export function mergeFeed(feed: Feed, response: FeedResponse): Feed {
  const job = response.job;
  if (!job) return emptyFeed;
  const same = feed.job?.id === job.id;
  let items = same ? feed.items : [];
  const after = same ? feed.after : 0;
  const fresh = response.lines.filter((l) => l.seq > after).sort((a, b) => a.seq - b.seq);
  if (response.dropped && items.at(-1)?.kind !== "gap")
    items = [...items, { kind: "gap", key: `gap-${fresh[0]?.seq ?? response.next}` }];
  items = [...items, ...fresh.map((line) => ({ kind: "line" as const, line }))];
  if (items.length > DOM_CAP) {
    const kept = items.slice(items.length - (DOM_CAP - 1));
    items =
      kept[0].kind === "gap" ? kept : [{ kind: "gap", key: `gap-${kept[0].line.seq}` }, ...kept];
  }
  // After a drop with nothing new, skip to the server's newest seq so the marker isn't repeated.
  const last = fresh.at(-1)?.seq ?? (response.dropped ? response.next : after);
  return { job, items, after: Math.max(after, last) };
}

// Poll quickly while a job runs, slowly once it stopped, and not at all while the tab is hidden
// (the server keeps the buffer, so the next poll catches up).
export function pollDelay(job: JobStatus | null, hidden: boolean): number | null {
  if (hidden) return null;
  if (isActive(job)) return POLL_ACTIVE_MS;
  return job ? POLL_IDLE_MS : POLL_NONE_MS;
}

export const LEVEL_TAGS: Record<LogEntry["level"], string> = {
  info: "INFO",
  decision: "DECIDE",
  action: "ACTION",
  result: "RESULT",
  wait: "WAIT",
  warn: "WARN",
  error: "ERROR",
};

export function formatLine(line: LogEntry, locale?: string) {
  const time = new Date(line.time).toLocaleTimeString(locale, { hour12: false });
  return `${time} ${LEVEL_TAGS[line.level].padEnd(6)} ${line.text}`;
}

export function copyText(feed: Feed, locale?: string) {
  return feed.items
    .map((i) => (i.kind === "gap" ? "… earlier lines were dropped …" : formatLine(i.line, locale)))
    .join("\n");
}
