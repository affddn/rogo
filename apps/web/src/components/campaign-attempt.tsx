import { useState, useRef } from "react";
import { AutomationRunningNote } from "@/components/automation-note";
import { Link } from "react-router";
import { useGame } from "@/lib/game/game-data-context";
import { localJson, type Session } from "@/lib/game/local-guide";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
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

export function CampaignAttempt({
  session,
  refresh,
}: {
  session: Session;
  refresh: () => Promise<void>;
}) {
  const { data } = useGame();
  const lock = useRef(false);
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState<{ ticket: string; stage: number } | null>(null);
  const [error, setError] = useState("");
  const [outcome, setOutcome] = useState<{ won: boolean; stage: number; data: unknown } | null>(
    null,
  );
  function stageName(entry: number) {
    return data.stages.find((s) => s.entry === entry)?.id ?? String(entry);
  }
  async function send(execute: boolean) {
    if (lock.current || (execute && !review)) return;
    lock.current = true;
    setBusy(true);
    setError("");
    setOutcome(null);
    try {
      const resp = await localJson(
        "operations",
        execute
          ? {
              operation: "campaign.retry",
              confirm: "campaign.retry",
              ticket: review!.ticket,
              payload: { stage_entry: review!.stage },
            }
          : { operation: "campaign.prepare", payload: {} },
      );
      if (execute) {
        setOutcome({ won: resp.result.won, stage: resp.result.stageEntry, data: resp.result.data });
        setReview(null);
      } else setReview({ stage: resp.result.normalized.stage_entry, ticket: resp.ticket });
    } catch (e) {
      setReview(null);
      setError(
        e instanceof Error ? e.message : "The local helper could not complete this request.",
      );
    } finally {
      await refresh();
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <Card>
      <CardContent className="grid gap-3">
        <h2 className="font-heading text-xl font-semibold">Retry campaign boss</h2>
        <p>
          Play the connected character’s current stage once. The local helper runs the fight without
          phone taps or manual dodges. The game server decides progress and rewards.
        </p>
        <Button
          className="justify-self-start"
          disabled={!session.connected || busy}
          onClick={() => void send(false)}
        >
          {busy ? "Waiting for the helper…" : "Review boss attempt"}
        </Button>
        {!session.connected && (
          <Link className="underline" to="/character">
            Connect your character first
          </Link>
        )}
        <AlertDialog
          open={!!review}
          onOpenChange={(open) => {
            if (!open && !lock.current) setReview(null);
          }}
        >
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                Fight stage {review ? stageName(review.stage) : ""}?
              </AlertDialogTitle>
              <AlertDialogDescription>
                {session.characterName} · Realm {session.serverId}. Run one campaign attempt. A win
                may advance the stage and award items. There is no automatic retry.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
              <AlertDialogAction disabled={busy} onClick={() => void send(true)}>
                Fight once
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <AutomationRunningNote message={error} />
        {outcome && (
          <div role="status">
            <h3 className="font-semibold">
              Stage {stageName(outcome.stage)} · {outcome.won ? "Victory" : "Defeat"}
            </h3>
            <p className="text-sm">Result confirmed by the game server.</p>
            <details>
              <summary>Settlement and rewards</summary>
              <pre className="max-h-72 overflow-auto text-xs">
                {JSON.stringify(outcome.data, null, 2)}
              </pre>
            </details>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
