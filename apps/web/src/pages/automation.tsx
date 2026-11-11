import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { Link } from "react-router";
import { toast } from "sonner";
import { PageHeader } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { localJson, type Session } from "@/lib/game/local-guide";
import {
  copyText,
  emptyFeed,
  isActive,
  LEVEL_TAGS,
  mergeFeed,
  pollDelay,
  type Feed,
  type FeedResponse,
  type LogEntry,
} from "@/lib/game/automation-feed";
import { DEFAULT_PROGRESS_OPTIONS, type ProgressOptions } from "@/lib/game/progression";

type Flag = "classSwitch" | "specSwitch" | "statReset" | "dailies" | "freeListings" | "assist";
const FLAGS: [Flag, string, string][] = [
  ["classSwitch", "Class switch", "Try other class lines through the free Job Switch when stuck."],
  ["specSwitch", "Specialization switch", "Try other unlocked specializations on the same line."],
  ["statReset", "Stat reset", "Reset and rebuild stats to the game's recommendation when stuck."],
  ["dailies", "Daily modes", "Sweeps and mode fights within the attempts you have left."],
  ["freeListings", "Free listings", "Collect zero-price shop listings."],
  ["assist", "Dungeon assist", "Accept posted public dungeon invitations (assist only)."],
];
// Tag text carries the level; colour only reinforces it.
const LEVEL_STYLE: Record<LogEntry["level"], string> = {
  info: "text-zinc-400",
  decision: "text-sky-300",
  action: "text-amber-300",
  result: "text-emerald-300",
  wait: "text-zinc-500 italic",
  warn: "text-yellow-300 font-semibold",
  error: "text-red-400 font-bold",
};

async function readFeed(after: number): Promise<FeedResponse> {
  const r = await fetch(`/api/rogo/automation?after=${after}`, {
    cache: "no-store",
    credentials: "same-origin",
    headers: { "X-Rogo-Connect": "1" },
  });
  const value = r.headers.get("content-type")?.includes("application/json") ? await r.json() : null;
  if (!r.ok || !value) throw new Error(value?.error ?? "The local helper is unavailable.");
  return value;
}

// Tails the server-side job: fast while it runs, slow once stopped, paused in a hidden tab.
function useAutomationFeed() {
  const [feed, setFeed] = useState<Feed>(emptyFeed);
  const [error, setError] = useState("");
  const ref = useRef(feed);
  const timer = useRef<number | undefined>(undefined);
  // One poll at a time: a request made meanwhile runs right after the current one.
  const busy = useRef(false);
  const again = useRef(false);
  const poll = useCallback(async () => {
    window.clearTimeout(timer.current);
    if (busy.current) {
      again.current = true;
      return;
    }
    busy.current = true;
    try {
      const next = mergeFeed(ref.current, await readFeed(ref.current.after));
      ref.current = next;
      setFeed(next);
      setError("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "The local helper is unavailable.");
    }
    busy.current = false;
    if (again.current) {
      again.current = false;
      void poll();
      return;
    }
    const delay = pollDelay(ref.current.job, document.hidden);
    if (delay !== null) timer.current = window.setTimeout(() => void poll(), delay);
  }, []);
  useEffect(() => {
    void poll();
    const visible = () => {
      if (!document.hidden) void poll();
      else window.clearTimeout(timer.current);
    };
    document.addEventListener("visibilitychange", visible);
    return () => {
      window.clearTimeout(timer.current);
      document.removeEventListener("visibilitychange", visible);
    };
  }, [poll]);
  // Applies a start/stop reply at once, then keeps polling.
  const adopt = useCallback(
    (job: FeedResponse["job"]) => {
      const next = mergeFeed(ref.current, {
        job,
        lines: [],
        next: ref.current.after,
        dropped: false,
      });
      ref.current = next;
      setFeed(next);
      void poll();
    },
    [poll],
  );
  return { feed, error, adopt };
}

function Stat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-xs text-muted-foreground uppercase">{label}</dt>
      <dd className="tabular font-semibold">{children}</dd>
    </div>
  );
}

function Console({ feed }: { feed: Feed }) {
  const box = useRef<HTMLDivElement>(null);
  const [atBottom, setAtBottom] = useState(true);
  useLayoutEffect(() => {
    if (atBottom && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [feed.items, atBottom]);
  const jump = () => {
    if (box.current) box.current.scrollTop = box.current.scrollHeight;
    setAtBottom(true);
  };
  return (
    <div className="relative">
      <div
        ref={box}
        role="log"
        aria-live="polite"
        aria-label="Automation log"
        tabIndex={0}
        onScroll={(e) => {
          const el = e.currentTarget;
          setAtBottom(el.scrollHeight - el.scrollTop - el.clientHeight < 24);
        }}
        className="h-[60vh] min-h-64 overflow-y-auto rounded-md border border-zinc-700 bg-zinc-950 p-3 font-mono text-xs leading-relaxed text-zinc-100 focus-visible:ring-3 focus-visible:ring-ring/50 focus-visible:outline-none"
      >
        {feed.items.length === 0 && (
          <p className="text-zinc-500">No log yet. Start the automation to see what it does.</p>
        )}
        {feed.items.map((item) =>
          item.kind === "gap" ? (
            <p key={item.key} className="my-1 border-y border-dashed border-zinc-700 text-zinc-500">
              … earlier lines were dropped …
            </p>
          ) : (
            <p key={item.line.seq} className="break-words whitespace-pre-wrap">
              <time className="text-zinc-500">
                {new Date(item.line.time).toLocaleTimeString(undefined, { hour12: false })}
              </time>{" "}
              <span className={LEVEL_STYLE[item.line.level]}>[{LEVEL_TAGS[item.line.level]}]</span>{" "}
              <span className={item.line.level === "error" ? "text-red-300" : undefined}>
                {item.line.text}
              </span>
            </p>
          ),
        )}
      </div>
      {!atBottom && (
        <Button size="sm" className="absolute right-4 bottom-3" onClick={jump}>
          Jump to latest
        </Button>
      )}
    </div>
  );
}

export default function AutomationPage() {
  const [session, setSession] = useState<Session | null>(null);
  const { feed, error, adopt } = useAutomationFeed();
  const [options, setOptions] = useState<ProgressOptions>(DEFAULT_PROGRESS_OPTIONS);
  const [caps, setCaps] = useState({ actions: "", minutes: "" });
  const [confirming, setConfirming] = useState(false);
  const [sending, setSending] = useState(false);
  const [actionError, setActionError] = useState("");
  const job = feed.job;
  const active = isActive(job);
  useEffect(() => {
    const read = () =>
      localJson("status")
        .then((s: Session) => setSession(s))
        .catch(() => setSession({ available: false, connected: false, serverId: "" }));
    void read();
    window.addEventListener("focus", read);
    return () => window.removeEventListener("focus", read);
  }, []);
  const blocked =
    session === null
      ? "Checking the local helper…"
      : !session.available
        ? "The local helper is off. Start the guide with the connector enabled (see Connect Rogo)."
        : !session.connected
          ? "Connect this browser to your character first."
          : active
            ? "The automation is already running."
            : "";
  const capValue = (v: string) => (v.trim() ? Number(v) : null);
  const capsValid = [caps.actions, caps.minutes].every(
    (v) => !v.trim() || (Number.isInteger(Number(v)) && Number(v) >= 1),
  );
  async function send(body: object) {
    setSending(true);
    setActionError("");
    try {
      const r = await localJson("operations", body);
      adopt(r.job);
    } catch (e) {
      setActionError(e instanceof Error ? e.message : "The local helper rejected the request.");
    } finally {
      setSending(false);
    }
  }
  const start = () =>
    send({
      operation: "automation.start",
      confirm: "automation.start",
      payload: {
        ...options,
        maxActions: capValue(caps.actions),
        maxMinutes: capValue(caps.minutes),
      },
    });
  const stop = () => send({ operation: "automation.stop", payload: {} });
  async function copy() {
    try {
      await navigator.clipboard.writeText(copyText(feed));
      toast.success("Log copied");
    } catch {
      toast.error("Couldn't copy the log.");
    }
  }
  const stateLabel = !job
    ? "Not started"
    : job.state === "running"
      ? "Running"
      : job.state === "stopping"
        ? "Stopping…"
        : "Stopped";
  return (
    <>
      <PageHeader eyebrow="Your character" title="Automation">
        A long-running job in the local helper: it keeps pushing the campaign and, when stuck, tries
        other builds, collects rewards and runs dailies. It keeps running if you close this page.
      </PageHeader>

      <section className="game-panel grid gap-4" aria-label="Automation status">
        <dl className="grid grid-cols-2 gap-x-6 gap-y-3 sm:grid-cols-4 lg:grid-cols-6">
          <Stat label="State">
            <span role="status">{stateLabel}</span>
          </Stat>
          <Stat label="Phase">{job?.phase ?? "—"}</Stat>
          <Stat label="Stage">{job?.stage ?? "—"}</Stat>
          <Stat label="Power">{job?.power ? Number(job.power).toLocaleString() : "—"}</Stat>
          <Stat label="Actions">{job?.counters.actions ?? 0}</Stat>
          <Stat label="Clears">{job?.counters.clears ?? 0}</Stat>
          <Stat label="Defeats">{job?.counters.defeats ?? 0}</Stat>
          <Stat label="Rejected">{job?.counters.rejected ?? 0}</Stat>
          {job?.stall && (
            <Stat label="Stalled">
              Stage {job.stall.stage} since{" "}
              {new Date(job.stall.since).toLocaleTimeString(undefined, { hour12: false })}
            </Stat>
          )}
          {job?.current && (
            <div className="col-span-2 grid gap-0.5 sm:col-span-3">
              <dt className="text-xs text-muted-foreground uppercase">Current step</dt>
              <dd className="font-semibold break-words">{job.current}</dd>
            </div>
          )}
        </dl>
        {job?.state === "stopped" && (
          <div
            role="alert"
            className={
              job.uncertain
                ? "rounded-md border-2 border-destructive p-3 text-destructive"
                : "rounded-md border-2 border-border p-3"
            }
          >
            <strong className="block">
              {job.uncertain ? "Stopped · outcome uncertain" : "Stopped"}
            </strong>
            <span>{job.stopReason ?? "The job has ended."}</span>
            {job.uncertain && (
              <span className="mt-1 block font-semibold">
                The last request may or may not have taken effect. Check the game before starting
                again; nothing was retried.
              </span>
            )}
          </div>
        )}
        {active && (
          <div className="flex flex-wrap items-center gap-3">
            <Button
              variant="destructive"
              disabled={sending || job?.state === "stopping"}
              onClick={() => void stop()}
            >
              {job?.state === "stopping" ? "Stopping…" : "Stop after current request"}
            </Button>
            <span className="text-sm text-muted-foreground">
              A request already sent finishes first; nothing is sent after it.
            </span>
          </div>
        )}
        {actionError && (
          <p role="alert" className="text-sm text-destructive">
            {actionError}
          </p>
        )}
      </section>

      <section className="game-panel grid gap-4" aria-label="Start the automation">
        <h2 className="font-heading text-lg font-semibold">Options</h2>
        <fieldset disabled={active || sending} className="grid gap-3 sm:grid-cols-2">
          <legend className="sr-only">What the job may do</legend>
          {FLAGS.map(([key, label, description]) => (
            <label key={key} className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
              <input
                type="checkbox"
                className="mt-0.5 size-5"
                checked={options[key]}
                onChange={(e) => setOptions({ ...options, [key]: e.target.checked })}
              />
              <span>
                <strong className="block">{label}</strong>
                <span className="text-muted-foreground">{description}</span>
              </span>
            </label>
          ))}
          <label className="grid gap-1.5 text-sm font-medium">
            Stop after this many actions (optional)
            <input
              className="h-11 w-full rounded-md border bg-background px-3 text-base"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="No limit"
              value={caps.actions}
              onChange={(e) => setCaps({ ...caps, actions: e.target.value })}
            />
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Stop after this many minutes (optional)
            <input
              className="h-11 w-full rounded-md border bg-background px-3 text-base"
              type="number"
              min={1}
              inputMode="numeric"
              placeholder="No limit"
              value={caps.minutes}
              onChange={(e) => setCaps({ ...caps, minutes: e.target.value })}
            />
          </label>
        </fieldset>
        <div className="flex flex-wrap items-center gap-3">
          <Button disabled={!!blocked || !capsValid || sending} onClick={() => setConfirming(true)}>
            Start automation
          </Button>
          {blocked && (
            <span className="text-sm text-muted-foreground">
              {blocked}{" "}
              {session && session.available && !session.connected && (
                <Link className="font-semibold underline" to="/character">
                  Connect on Character
                </Link>
              )}
            </span>
          )}
          {!capsValid && (
            <span className="text-sm text-destructive">
              Caps must be whole numbers of 1 or more.
            </span>
          )}
        </div>
      </section>

      <section className="grid gap-3" aria-label="Automation console">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="game-ribbon text-base">Console</h2>
          <Button
            variant="outline"
            size="sm"
            disabled={!feed.items.length}
            onClick={() => void copy()}
          >
            Copy log
          </Button>
        </div>
        {error && (
          <p role="status" className="text-sm text-muted-foreground">
            {error}
          </p>
        )}
        <Console feed={feed} />
      </section>

      <AlertDialog open={confirming} onOpenChange={setConfirming}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start unattended automation?</AlertDialogTitle>
            <AlertDialogDescription>
              {session?.characterName ?? "Your character"} · Realm {session?.serverId}. The job
              keeps running in the local helper until you stop it, a cap is reached, or the game
              session ends.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="list-disc space-y-1 pl-5 text-sm">
            <li>Free actions only: no premium spending, paid refills, ads or purchases.</li>
            <li>
              It collects idle income at the game's battery-saving rate and a Quick Idle only while
              a free one is left.
            </li>
            <li>
              It spends unused stat and skill points on the active build and fills empty skill
              slots; skills already learned are never lowered.
            </li>
            {(options.statReset || options.specSwitch || options.classSwitch) && (
              <li>
                It may{" "}
                {[
                  options.statReset && "reset and reallocate stats",
                  options.specSwitch && "change specialization",
                  options.classSwitch && "change class through Job Switch",
                ]
                  .filter(Boolean)
                  .join(", ")}
                , and returns to your current build if nothing else wins.
              </li>
            )}
            <li>It stops on any uncertain outcome and never resends a request.</li>
            <li>Other game actions on this site are refused while it runs.</li>
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirming(false);
                void start();
              }}
            >
              Start
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
