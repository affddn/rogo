import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router";
import { PageHeader, SectionTitle } from "@/components/page-header";
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
import { useItems } from "@/lib/game/extra-data";
import { DailyAutoRun } from "@/components/daily-auto-run";
import { runAuto, type AutoPlan, type AutoProgress } from "@/lib/game/daily-autorun";
import type { Receipt, Review, Run, Scan } from "@/lib/game/daily-types";

const modeLinks: [string, string][] = [
  ["Campaign boss", "/operations?action=campaign"],
  ["Resource realms", "/operations?area=Resource%20realms"],
  ["MVP", "/operations?area=MVP"],
  ["Endless Tower", "/operations?area=Endless%20Tower"],
  ["Baphomet", "/operations?area=World%20boss"],
  ["Arena", "/operations?area=Arena"],
  ["Guild Hunt", "/operations?area=Guild%20boss"],
  ["Team dungeons", "/operations?area=Team%20dungeons"],
];
const otherRewards: [number, string, string][] = [
  [4063, "Elite summon reward", "Schema only; ordinary gear drops arrive with the summon."],
  [4089, "Online idle income", "Requires kills actually recorded during idle gameplay."],
  [4179, "Exchange code", "Supply your own code."],
  [
    4207,
    "Cumulative recharge milestone",
    "Requires a qualifying grade; never place a recharge order here.",
  ],
  [4727, "Rating reward", "Requires the publisher’s rating flow."],
  [7005, "Activity reward", "Arguments depend on the specific event."],
  [7027, "Film summon draw", "An ad or entitlement is not an earned milestone."],
];
const statusWords = {
  confirmed: "Confirmed",
  skipped: "Skipped",
  rejected: "Rejected",
  stopped: "Stopped",
  unknown: "Outcome unknown",
};

function Results({ run, title = "Last run" }: { run: Run; title?: string }) {
  const items = useItems();
  function describe(receipt: Receipt) {
    const totals = new Map<number, bigint>();
    const other = new Map<string, number>();
    for (const reward of Object.values(receipt.rewards ?? {})) {
      for (const i of reward.items ?? [])
        totals.set(i.entry, (totals.get(i.entry) ?? 0n) + BigInt(i.count ?? "0"));
      for (const [kind, rows] of Object.entries(reward))
        if (kind !== "items" && Array.isArray(rows) && rows.length)
          other.set(kind, (other.get(kind) ?? 0) + rows.length);
    }
    return [
      ...Array.from(
        totals,
        ([id, amount]) =>
          `${items?.items.find((i) => i.asset === "item" && i.id === id)?.name ?? "Item " + id} ×${amount.toLocaleString()}`,
      ),
      ...Array.from(other, ([kind, n]) => `${n} ${kind.replaceAll("_", " ")}`),
    ].join(" · ");
  }
  return (
    <section className="grid gap-3" aria-label="Run results" aria-live="polite">
      <SectionTitle
        aside={`${run.receipts.filter((r) => r.status === "confirmed").length} confirmed`}
      >
        {title}
      </SectionTitle>
      <ul className="game-panel divide-y">
        {run.receipts.map((r, i) => (
          <li key={i} className="grid gap-1 py-3">
            <strong>
              {r.title} · {statusWords[r.status]}
              {r.won != null ? (r.won ? " · Victory" : " · Defeat") : ""}
            </strong>
            <span className="text-sm text-muted-foreground">
              {r.note || describe(r) || (r.reply ? `Server reply ${r.reply}` : "")}
              {r.score ? ` · Score ${r.score}` : ""}
              {r.rank ? ` · Rank ${r.rank}` : ""}
            </span>
            {r.assists != null && (
              <span className="text-sm">Server-confirmed dungeon assists today: {r.assists}/5</span>
            )}
            {r.substeps?.length ? (
              <ul className="text-xs text-muted-foreground" aria-label="Confirmed substeps">
                {r.substeps.map((step, n) => (
                  <li key={n}>
                    {(
                      {
                        4531: "Stat reset",
                        4529: "Stat allocation",
                        4303: "Room joined",
                        4325: "Assist-only mode",
                        4321: "Match accepted",
                        6005: "Dungeon settlement",
                        4305: "Room left",
                      } as Record<number, string>
                    )[step.command] ?? `Request ${step.command}`}
                    : confirmed
                  </li>
                ))}
              </ul>
            ) : null}
            {r.cleanupUncertain && (
              <span className="text-sm text-destructive">
                Room cleanup is unconfirmed. Check the party before continuing.
              </span>
            )}
          </li>
        ))}
      </ul>
      {run.notRun > 0 && <p>{run.notRun} remaining actions were not sent.</p>}
    </section>
  );
}

export default function DailyPage() {
  const [session, setSession] = useState<Session | null>(null);
  const [scan, setScan] = useState<Scan | null>(null);
  const [keys, setKeys] = useState<string[]>([]);
  const [review, setReview] = useState<Review | null>(null);
  const [packed, setPacked] = useState<Run | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const lock = useRef(false);
  const autoStop = useRef<AbortController | null>(null);
  const [autoProgress, setAutoProgress] = useState<AutoProgress | null>(null);
  const [stopping, setStopping] = useState(false);
  useEffect(() => {
    const stop = () => autoStop.current?.abort();
    const warn = (event: BeforeUnloadEvent) => {
      if (autoStop.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("pagehide", stop);
    window.addEventListener("beforeunload", warn);
    return () => {
      stop();
      window.removeEventListener("pagehide", stop);
      window.removeEventListener("beforeunload", warn);
    };
  }, []);
  const status = useCallback(async () => {
    try {
      const s: Session = await localJson("status");
      setSession(s);
      if (!s.connected) {
        setScan(null);
        setReview(null);
      }
    } catch {
      setSession({ available: false, connected: false, serverId: "" });
      setScan(null);
      setReview(null);
    }
  }, []);
  useEffect(() => {
    void status();
    const focus = () => {
      if (!lock.current) void status();
    };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, [status]);
  async function operation(op: "scan" | "prepare" | "run", selected: string[] = []) {
    if (lock.current) return;
    if (op !== "scan" && !scan) return;
    if (op === "run" && !review) return;
    lock.current = true;
    setError("");
    setBusy(
      op === "scan"
        ? "Checking the account…"
        : op === "run"
          ? "Running reviewed actions…"
          : "Checking your selection…",
    );
    async function read() {
      setScan(null);
      setKeys([]);
      setReview(null);
      const r = await localJson("operations", { operation: "routine.scan", payload: {} });
      setScan(r.result); // no automatic selection or sending of newly available claims
    }
    try {
      if (op === "scan") {
        await read();
      } else if (op === "prepare") {
        const r = await localJson("operations", {
          operation: "routine.prepare",
          payload: { scanId: scan!.scanId, keys: selected },
        });
        setReview({ ticket: r.ticket, ...r.result });
      } else {
        const r = await localJson("operations", {
          operation: "routine.run",
          payload: review!.normalized,
          ticket: review!.ticket,
          confirm: "routine.run",
        });
        const run: Run = r.result;
        setPacked(run);
        setReview(null);
        setScan(null);
        setKeys([]);
        if (run.receipts.every((v) => v.status === "confirmed" || v.status === "skipped")) {
          setBusy("Refreshing available actions…");
          await read();
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "The local helper could not finish the request.");
      setReview(null);
      if (op !== "prepare") {
        setScan(null);
        setKeys([]);
      }
    } finally {
      await status();
      lock.current = false;
      setBusy("");
    }
  }
  async function startAuto(plan: AutoPlan) {
    if (lock.current) return;
    lock.current = true;
    const controller = new AbortController();
    autoStop.current = controller;
    setStopping(false);
    setPacked(null);
    setReview(null);
    setKeys([]);
    setError("");
    setBusy("Starting auto run…");
    try {
      await runAuto(
        plan,
        {
          scan: async () =>
            (await localJson("operations", { operation: "routine.scan", payload: {} })).result,
          prepare: async (latest, step) => {
            const response = await localJson("operations", {
              operation: "routine.prepare",
              payload: { scanId: latest.scanId, keys: [step.key] },
            });
            return { ticket: response.ticket, ...response.result };
          },
          execute: async (approved) =>
            (
              await localJson("operations", {
                operation: "routine.run",
                payload: approved.normalized,
                ticket: approved.ticket,
                confirm: "routine.run",
              })
            ).result,
        },
        controller.signal,
        (progress) => {
          setAutoProgress(progress);
          setScan(progress.status === "stopped" ? null : progress.scan);
          setBusy(progress.status === "running" ? progress.message : "");
        },
      );
    } finally {
      autoStop.current = null;
      lock.current = false;
      setBusy("");
      setStopping(false);
      await status();
    }
  }
  const claims = scan?.steps.filter((s) => s.kind === "claim") ?? [];
  const modes =
    scan?.steps.filter((s) => s.kind === "fight" || s.kind === "duel" || s.kind === "sweep") ?? [];
  const offers = scan?.steps.filter((s) => s.kind === "offer") ?? [];
  const limit = scan?.maxSteps ?? 24;
  const bestChallenge = modes
    .filter((s) => s.kind === "fight" && s.powerRatio != null)
    .sort((a, b) => b.powerRatio! - a.powerRatio!)[0];
  const bestSweep = modes.find((s) => s.kind === "sweep");
  const advice = claims.length
    ? "Collect earned rewards first. They may unlock another milestone or change which challenges are within reach."
    : bestChallenge && bestChallenge.powerRatio! >= 1
      ? `Try ${bestChallenge.title} before sweeping: clearing a higher difficulty can improve future sweep rewards.`
      : bestSweep
        ? `Start with ${bestSweep.title}. A cleared stage gives a predictable payout without risking a failed challenge.`
        : bestChallenge
          ? `${bestChallenge.title} is the closest match by suggested power. Power is only a guide, not a guaranteed win.`
          : "Check the remaining mode options below; no power-based recommendation is available.";
  return (
    <>
      <PageHeader
        eyebrow="Your character"
        title="Daily optimizer"
        actions={
          <Button asChild variant="outline">
            <Link to="/operations">All game actions</Link>
          </Button>
        }
      >
        Collect earned rewards, revise stats and class, and push campaign bosses or daily modes. A
        scan sends read requests only.
      </PageHeader>
      <div className="game-panel flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="font-heading text-lg font-semibold">
            {session?.connected ? session.characterName : "Character connection"}
          </h2>
          <p className="text-sm text-muted-foreground">
            {session?.connected
              ? scan
                ? `Realm ${scan.character.realm} · Checked ${new Date(scan.checkedAt * 1000).toLocaleTimeString()}`
                : `Realm ${session.serverId} · Ready to check`
              : session === null
                ? "Checking local helper…"
                : "Connect your character to scan its current game state."}
          </p>
        </div>
        {session?.connected ? (
          <Button disabled={!!busy} onClick={() => void operation("scan")}>
            {scan ? "Scan again" : "Scan account"}
          </Button>
        ) : (
          <Button asChild>
            <Link to="/character">Connect character</Link>
          </Button>
        )}
      </div>
      {busy && !autoStop.current && <p role="status">{busy}</p>}
      {error && (
        <p role="alert" className="text-destructive">
          {error}
        </p>
      )}
      <DailyAutoRun
        scan={scan}
        busy={!!busy}
        progress={autoProgress}
        stopping={stopping}
        onStart={(plan) => void startAuto(plan)}
        onStop={() => {
          autoStop.current?.abort();
          setStopping(true);
        }}
      />
      {!!autoProgress?.receipts.length && (
        <Results title="Auto run receipts" run={{ receipts: autoProgress.receipts, notRun: 0 }} />
      )}
      {packed && <Results run={packed} />}
      {scan && (
        <>
          <div className="game-panel">
            <h2 className="font-heading text-lg font-semibold">Suggested next step</h2>
            <p className="measure text-sm">{advice}</p>
          </div>
          {scan.warnings.map((w) => (
            <p key={w} role="status" className="text-sm text-muted-foreground">
              {w}
            </p>
          ))}
          <section className="grid gap-3">
            <SectionTitle aside={`${claims.length} ready`}>Earned rewards</SectionTitle>
            <p className="measure text-sm text-muted-foreground">
              Only verified, no-cost claims appear here. Conditional purchases, paid catch-up, ads,
              and unverified triggers are excluded.
            </p>
            {claims.length > 0 ? (
              <>
                <div className="flex flex-wrap gap-2">
                  <Button
                    disabled={!!busy}
                    onClick={() =>
                      void operation(
                        "prepare",
                        claims.slice(0, limit).map((s) => s.key),
                      )
                    }
                  >
                    {claims.length > limit
                      ? `Review first ${limit} claims`
                      : "Review all ready claims"}
                  </Button>
                  <Button
                    variant="outline"
                    disabled={!keys.length || !!busy}
                    onClick={() => void operation("prepare", keys)}
                  >
                    Review selected ({keys.length})
                  </Button>
                </div>
                <ul className="game-panel divide-y">
                  {claims.map((step) => (
                    <li key={step.key}>
                      <label className="flex cursor-pointer items-start gap-3 py-3">
                        <input
                          type="checkbox"
                          className="mt-1 size-5"
                          disabled={!!busy || (!keys.includes(step.key) && keys.length >= limit)}
                          checked={keys.includes(step.key)}
                          onChange={(e) =>
                            setKeys((prev) =>
                              e.target.checked
                                ? [...prev, step.key]
                                : prev.filter((k) => k !== step.key),
                            )
                          }
                        />
                        <span>
                          <strong className="block">{step.title}</strong>
                          <span className="text-sm text-muted-foreground">{step.detail}</span>
                        </span>
                      </label>
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <p className="game-panel">No verified free claims are ready in this scan.</p>
            )}
          </section>
          {offers.length > 0 && (
            <section className="grid gap-3">
              <SectionTitle>Free shop listings</SectionTitle>
              <ul className="game-panel divide-y">
                {offers.map((s) => (
                  <li
                    key={s.key}
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                  >
                    <span>{s.title}</span>
                    <Button
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => void operation("prepare", [s.key])}
                    >
                      Review free item
                    </Button>
                  </li>
                ))}
              </ul>
            </section>
          )}
          <section className="grid gap-3">
            <SectionTitle aside={`${modes.length} options`}>Mode attempts</SectionTitle>
            <p className="measure text-sm text-muted-foreground">
              Sweeps target your highest cleared difficulty. Challenges target the next one. Choose
              one at a time; none are included in Claim all.
            </p>
            {modes.length ? (
              <ul className="game-panel divide-y">
                {modes.map((s) => (
                  <li
                    className="flex flex-wrap items-center justify-between gap-3 py-3"
                    key={s.key}
                  >
                    <div>
                      <strong>{s.title}</strong>
                      <p className="text-sm text-muted-foreground">{s.detail}</p>
                    </div>
                    <Button
                      variant="outline"
                      disabled={!!busy}
                      onClick={() => void operation("prepare", [s.key])}
                    >
                      Review {s.kind === "sweep" ? "sweep" : "fight"}
                    </Button>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="game-panel">
                No supported attempts were identified from this account state.
              </p>
            )}
          </section>
        </>
      )}
      <section className="grid gap-3">
        <SectionTitle>Other actions</SectionTitle>
        <p className="measure text-sm text-muted-foreground">
          Inspect every mapped action, including rewards needing a code, event-specific input, or an
          eligibility rule not covered by the scan. Team dungeons require a party; a start packet
          alone does not complete a fight.
        </p>
        <div className="flex flex-wrap gap-2">
          {[["All reward commands", "/operations?effect=claim"], ...modeLinks].map(
            ([label, to]) => (
              <Button variant="outline" size="sm" key={to} asChild>
                <Link to={to}>{label}</Link>
              </Button>
            ),
          )}
        </div>
        <details className="game-panel text-sm">
          <summary>Reward commands not included in Claim all</summary>
          <ul className="mt-3 grid gap-2">
            {otherRewards.map(([cmd, label, reason]) => (
              <li key={cmd}>
                <Link className="font-semibold underline" to={`/operations?command=${cmd}`}>
                  {label}
                </Link>{" "}
                · {reason}
              </li>
            ))}
          </ul>
        </details>
      </section>
      <AlertDialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open && !lock.current) setReview(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {review?.steps[0]?.kind === "claim"
                ? "Collect reviewed rewards?"
                : review?.steps[0]?.kind === "offer"
                  ? "Collect this free shop listing?"
                  : "Use this mode attempt?"}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {scan?.character.name} · Realm {scan?.character.realm}. The helper rechecks
              eligibility before sending. Nothing is retried automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="max-h-60 space-y-2 overflow-y-auto">
            {review?.steps.map((s) => (
              <li key={s.key}>
                <strong>{s.title}</strong>
                <div className="text-sm">{s.detail}</div>
              </li>
            ))}
          </ul>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={!!busy} onClick={() => void operation("run")}>
              {busy
                ? "Working…"
                : review?.steps[0]?.kind === "claim"
                  ? `Claim ${review.steps.length} now`
                  : "Run once"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
