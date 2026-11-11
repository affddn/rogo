import { useState } from "react";
import { AutomationRunningNote } from "@/components/automation-note";
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
import {
  makeAutoPlan,
  previewAuto,
  MAX_AUTO_ACTIONS,
  MAX_CAMPAIGN_STAGES,
  type AutoOptions,
  type AutoPlan,
  type AutoProgress,
} from "@/lib/game/daily-autorun";
import type { Scan } from "@/lib/game/daily-types";

export function DailyAutoRun({
  scan,
  busy,
  progress,
  stopping,
  onStart,
  onStop,
}: {
  scan: Scan | null;
  busy: boolean;
  progress: AutoProgress | null;
  stopping: boolean;
  onStart: (plan: AutoPlan) => void;
  onStop: () => void;
}) {
  const [options, setOptions] = useState<AutoOptions>({
    mode: "fights",
    shops: true,
    maxActions: 40,
    campaignStages: 5,
    stats: "unused",
    advanceClass: true,
    targetSpec: 0,
    assist: true,
  });
  const [review, setReview] = useState<AutoPlan | null>(null);
  const [error, setError] = useState("");
  const running = progress?.status === "running";
  const rows = review ? previewAuto(review) : [];
  return (
    <section className="game-panel grid gap-4" aria-label="Auto run">
      <div>
        <h2 className="font-heading text-xl font-semibold">Auto run</h2>
        <p className="mt-1 max-w-2xl text-sm text-muted-foreground">
          Collect rewards, revise your build, then challenge bosses and run the modes you approve.
          The guide checks the account between every action. No premium spending, paid refills, or
          ads.
        </p>
      </div>
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          if (!scan || busy) return;
          setError("");
          try {
            setReview(makeAutoPlan(scan, options));
          } catch (e) {
            setError(e instanceof Error ? e.message : "Scan again before reviewing this run.");
          }
        }}
      >
        <fieldset disabled={busy} className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_9rem]">
          <legend className="sr-only">Run settings</legend>
          <label className="grid gap-1.5 text-sm font-medium">
            Daily activities
            <select
              className="h-11 rounded-md border bg-background px-3 text-base"
              value={options.mode}
              onChange={(e) =>
                setOptions({ ...options, mode: e.target.value as AutoOptions["mode"] })
              }
            >
              <option value="rewards">Free rewards only</option>
              <option value="sweeps">Free rewards and sweeps</option>
              <option value="fights">Free rewards, fights and sweeps</option>
            </select>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Action limit
            <input
              className="h-11 w-full rounded-md border bg-background px-3 text-base"
              type="number"
              min={1}
              max={MAX_AUTO_ACTIONS}
              required
              value={options.maxActions}
              onChange={(e) => setOptions({ ...options, maxActions: Number(e.target.value) })}
            />
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm sm:col-span-2">
            <input
              type="checkbox"
              className="size-5"
              checked={options.shops}
              onChange={(e) => setOptions({ ...options, shops: e.target.checked })}
            />
            Include zero-price shop listings
          </label>
        </fieldset>
        <fieldset disabled={busy} className="grid gap-4 border-t pt-4 sm:grid-cols-2">
          <legend className="font-medium">Boss progression and build</legend>
          {scan?.character.build && (
            <p className="text-sm text-muted-foreground sm:col-span-2">
              Current: {scan.character.build.className} · {scan.character.build.specName} ·{" "}
              {scan.character.build.freePoints} unused stat points
            </p>
          )}
          <label className="grid gap-1.5 text-sm font-medium">
            Campaign boss limit
            <input
              className="h-11 w-full rounded-md border bg-background px-3 text-base"
              type="number"
              min={0}
              max={MAX_CAMPAIGN_STAGES}
              required
              value={options.campaignStages}
              onChange={(e) => setOptions({ ...options, campaignStages: Number(e.target.value) })}
            />
            <span className="font-normal text-muted-foreground">
              0 disables campaign. Each victory can advance to the next boss.
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Stat allocation
            <select
              className="h-11 rounded-md border bg-background px-3 text-base"
              value={options.stats}
              onChange={(e) =>
                setOptions({ ...options, stats: e.target.value as AutoOptions["stats"] })
              }
            >
              <option value="off">Leave stats unchanged</option>
              <option value="unused">Use unused points — recommended ratios</option>
              <option value="rebuild">Reset once and rebuild — recommended ratios</option>
            </select>
            <span className="font-normal text-muted-foreground">
              Uses the selected build's in-game recommendation, not a promised optimal build.
            </span>
          </label>
          <label className="grid gap-1.5 text-sm font-medium">
            Class branch
            <select
              className="h-11 rounded-md border bg-background px-3 text-base"
              value={options.targetSpec}
              onChange={(e) => setOptions({ ...options, targetSpec: Number(e.target.value) })}
            >
              <option value={0}>Keep my current branch</option>
              {scan?.character.build?.choices.map((c) => (
                <option key={c.spec} value={c.spec} disabled={!c.available}>
                  {c.name}
                  {!c.available ? " — locked" : ""}
                </option>
              ))}
            </select>
            <span className="font-normal text-muted-foreground">
              A different branch authorizes its class and specialization switches. Saved skills are
              not reallocated.
            </span>
          </label>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={options.advanceClass}
              onChange={(e) => setOptions({ ...options, advanceClass: e.target.checked })}
            />
            Advance the selected class when all transfer quests are claimed
          </label>
        </fieldset>
        <fieldset disabled={busy} className="grid gap-2 border-t pt-4">
          <legend className="font-medium">Dungeon assistance</legend>
          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              className="size-5"
              checked={options.assist}
              onChange={(e) => setOptions({ ...options, assist: e.target.checked })}
            />
            Accept posted dungeon invites — up to 5 assists per game day
          </label>
          <p className="max-w-2xl text-sm text-muted-foreground">
            Joins recent, unlocked, power-matched public invites. Uses Assist-only mode, waits for
            the host, completes the fight and leaves. Never hosts, invites others, or spends normal
            clear attempts. If no invite is available, waits within this run's 10-minute limit.
          </p>
          {scan?.dungeon && (
            <p className="text-sm" role="status">
              {scan.dungeon.eligible
                ? `${scan.dungeon.used}/5 server-confirmed today · ${scan.dungeon.reserved} reserved · ${scan.dungeon.remaining} remaining`
                : scan.dungeon.reason}
            </p>
          )}
          <p className="max-w-2xl text-xs text-muted-foreground">
            The cap survives reloads and reconnects. Accepted invites that time out and uncertain
            attempts keep a reservation; joining is not counted as a completed assist.
          </p>
        </fieldset>
        <p className="max-w-2xl text-sm text-muted-foreground">
          {options.mode === "fights"
            ? "At most one fight per reviewed daily mode, then sweeps using up to the currently available attempts. Power-matched fights are preferred; power is not a win guarantee. "
            : options.mode === "sweeps"
              ? "Sweeps use up to the currently available attempts at the highest cleared difficulty. "
              : "Daily modes are off; progression settings above still apply. "}
          Each run ends at its action limit or after 10 minutes. Keep this page open; leaving it
          stops after the in-flight request. No schedule or automatic resume.
        </p>
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={busy || !scan}>
            Review auto run
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={busy || !scan}
            onClick={() => {
              if (!scan) return;
              setError("");
              try {
                setReview(
                  makeAutoPlan(scan, {
                    mode: "rewards",
                    shops: false,
                    maxActions: 40,
                    campaignStages: 0,
                    stats: "off",
                    advanceClass: false,
                    targetSpec: 0,
                    assist: true,
                  }),
                );
              } catch (e) {
                setError(e instanceof Error ? e.message : "Scan again before watching invites.");
              }
            }}
          >
            Review dungeon-assist watch
          </Button>
          {running && (
            <Button type="button" variant="outline" onClick={onStop} disabled={stopping}>
              {stopping ? "Stopping after current request…" : "Stop after current request"}
            </Button>
          )}
          {!scan && !running && (
            <span className="text-sm text-muted-foreground">
              Scan your account first to build the plan.
            </span>
          )}
        </div>
      </form>
      {progress && (
        <div className="border-t pt-3" role="status" aria-live="polite">
          <p className="font-semibold">
            {running
              ? "Auto run in progress"
              : progress.status === "complete"
                ? "Auto run finished"
                : "Auto run stopped"}
          </p>
          <p className="mt-1 text-sm">
            {stopping && running
              ? "Waiting for the current request's receipt. No next action will be sent."
              : progress.message}
          </p>
          <AutomationRunningNote message={progress.message} />
          <p className="mt-1 text-sm text-muted-foreground">
            {progress.receipts.filter((r) => r.status === "confirmed").length} confirmed ·{" "}
            {progress.receipts.filter((r) => r.status === "skipped").length} skipped
          </p>
        </div>
      )}
      <AlertDialog
        open={!!review}
        onOpenChange={(open) => {
          if (!open) setReview(null);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Start this auto run?</AlertDialogTitle>
            <AlertDialogDescription>
              {review?.initial.character.name} · Realm {review?.initial.character.realm}. Up to{" "}
              {review?.options.maxActions} actions over 10 minutes. Newly earned free rewards can be
              collected after each rescan; mode attempts stay within the budgets below. Build
              changes run before combat. A defeat, rejection, session change or uncertain outcome
              stops the run. Nothing is retried automatically.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="grid gap-1 text-sm">
            {review?.options.assist && (
              <p>
                <strong>Dungeon assist:</strong>{" "}
                {review.assistDay
                  ? `Accept eligible public invites with Assist-only mode, up to ${review.initial.dungeon?.remaining ?? 0} remaining reservations today. Wait for new invites while this run is active, then leave each room after the result.`
                  : `Not available: ${review.initial.dungeon?.reason ?? "daily allowance unavailable"}`}
              </p>
            )}
            <p>
              <strong>Campaign:</strong> up to {review?.options.campaignStages ?? 0} consecutive
              bosses, one attempt per stage. No retry after defeat.
            </p>
            {review?.buildGoal && (
              <p>
                <strong>Target branch:</strong> {review.buildGoal.name}
                {review.options.advanceClass ? ", with eligible class advancement" : ""}.
              </p>
            )}
            <p>
              <strong>Stats:</strong>{" "}
              {review?.options.stats === "rebuild"
                ? "Reset the target build once, then allocate its points with the game's recommended ratios. New points are allocated after later rescans."
                : review?.options.stats === "unused"
                  ? "Allocate unused points only, using the target build's recommended ratios."
                  : "Unchanged."}
            </p>
            {review?.buildGoal && (
              <p className="text-muted-foreground">
                After a class switch or level-up, the next stat proposal is calculated from the
                fresh build. Skills stay as saved for that branch.
              </p>
            )}
          </div>
          <ul className="max-h-64 space-y-3 overflow-y-auto text-sm">
            {rows.length ? (
              rows.map((s) => (
                <li key={s.key}>
                  <strong>{s.title}</strong>
                  <p className="text-muted-foreground">{s.detail}</p>
                  {s.kind === "sweep" && (
                    <p>
                      Up to {review?.sweepLimits[s.autoGroup!]} sweeps; fewer if attempts are used
                      by a fight.
                    </p>
                  )}
                  {(s.kind === "fight" || s.kind === "duel") && (
                    <p>
                      {s.autoGroup === "campaign"
                        ? `Up to ${review?.options.campaignStages} successive bosses; no repeat of a stage.`
                        : "One fight maximum in this mode."}
                    </p>
                  )}
                </li>
              ))
            ) : (
              <li>
                No matching actions in the current scan. Starting will recheck once without
                inventing an action.
              </li>
            )}
          </ul>
          <p className="text-sm text-muted-foreground">
            No currency purchases or ads. Stat points may be committed; a stat rebuild sends a reset
            and an allocation as one step. Dungeon assistance uses the server daily count plus a
            durable local reservation. Hosting dungeons and full Tower climbing are not included.
          </p>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (review) {
                  const approved = review;
                  setReview(null);
                  onStart(approved);
                }
              }}
            >
              Start auto run
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
