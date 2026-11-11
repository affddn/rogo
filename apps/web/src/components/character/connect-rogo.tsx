import { useEffect, useRef, useState } from "react";
import { Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Card, CardContent } from "@/components/ui/card";
import { useGame } from "@/lib/game/game-data-context";
import { useProfile } from "@/lib/game/profile-context";
import { createCharacter } from "@/lib/game/characters";
import {
  plannerIdFor,
  readCharacter,
  saveSnapshot,
  savedSnapshot,
  type Snapshot,
} from "@/lib/game/connected-character";
import { specInfo } from "@rogo/game/classes";
import { Link, useNavigate } from "react-router";

function SnapshotFields({ snapshot }: { snapshot: Snapshot }) {
  const c = snapshot.character;
  const { data } = useGame();
  const { add, select, characters } = useProfile();
  const navigate = useNavigate();
  const stage = data.stages.find((s) => s.entry === c.stageEntry);
  const build = c.spec === null ? undefined : specInfo(c.spec);
  const power = c.power !== null ? Number(c.power) : NaN;
  const canPlan = !!build && Number.isSafeInteger(power) && power > 0;
  const importing = useRef(false);
  async function openInPlanner() {
    if (!canPlan || !build || importing.current) return;
    importing.current = true;
    try {
      const id = await plannerIdFor(c);
      if (characters.some((character) => character.id === id)) {
        select(id);
      } else {
        const model = createCharacter(
          { name: c.name, level: c.level, spec: build.id, power, cleared: stage?.id ?? "" },
          data.battleRate,
          data.attrTransfer,
        );
        add({ ...model, id, cards: c.cards ?? {}, skills: c.skills ?? {} });
      }
      await navigate("/planner");
    } catch {
      toast.error("Couldn't open a planner profile in this browser.");
    } finally {
      importing.current = false;
    }
  }
  const facts = [
    ["Level", c.level],
    ["Power", c.power === null ? "Not reported" : BigInt(c.power).toLocaleString("en")],
    ["Build", build?.name ?? (c.spec === null ? "Not reported" : `Build ${c.spec}`)],
    [
      "Campaign stage",
      stage?.id ?? (c.stageEntry === null ? "Not reported" : `Entry ${c.stageEntry}`),
    ],
    ["Cards", c.cards === null ? "Not reported" : Object.keys(c.cards).length],
    ["Skills", c.skills === null ? "Not reported" : Object.keys(c.skills).length],
  ];
  return (
    <div data-testid="rogo-snapshot" className="grid gap-4 border-t border-border pt-4">
      <div>
        <h3
          data-testid="rogo-character-name"
          className="break-words font-heading text-xl font-semibold"
        >
          {c.name}
        </h3>
        <p className="break-all text-sm text-muted-foreground">
          Realm {c.serverId} · Character {c.playerId}
        </p>
      </div>
      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-3">
        {facts.map(([key, value]) => (
          <div key={key} className="min-w-0">
            <dt className="text-xs text-muted-foreground">{key}</dt>
            <dd className="tabular break-words font-semibold">{value}</dd>
          </div>
        ))}
      </dl>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {canPlan && (
          <Button variant="secondary" onClick={() => void openInPlanner()}>
            Use in planner
          </Button>
        )}
        <p className="text-xs text-muted-foreground">
          {canPlan
            ? "Opens a separate planner profile. Its stats are estimated; refreshing this snapshot won't replace your edits."
            : "This snapshot can’t seed a planner estimate without a supported build and a power within the planner’s range."}
        </p>
      </div>
    </div>
  );
}

export function ConnectRogo() {
  const [snapshot, setSnapshot] = useState(savedSnapshot);
  const [available, setAvailable] = useState<boolean | null>(null);
  const [realm, setRealm] = useState("");
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);
  const [error, setError] = useState("");
  const [saveWarning, setSaveWarning] = useState("");

  useEffect(() => {
    const abort = new AbortController();
    async function status() {
      try {
        const res = await fetch("/api/rogo/status", { cache: "no-store", signal: abort.signal });
        const body =
          res.ok && res.headers.get("content-type")?.includes("application/json")
            ? await res.json()
            : null;
        if (!abort.signal.aborted) {
          setAvailable(body?.available === true);
          setRealm(
            typeof body?.serverId === "string" && /^\d+$/.test(body.serverId) ? body.serverId : "",
          );
        }
      } catch {
        if (!abort.signal.aborted) setAvailable(false);
      }
    }
    void status();
    return () => abort.abort();
  }, []);

  async function connect() {
    if (inFlight.current || !available) return;
    inFlight.current = true;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/rogo/operations", {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json", "X-Rogo-Connect": "1" },
        body: JSON.stringify({ operation: "character.sync" }),
      });
      const body = res.headers.get("content-type")?.includes("application/json")
        ? await res.json()
        : null;
      if (!res.ok) {
        setError(
          typeof body?.error === "string"
            ? body.error
            : "The local helper could not connect. Check VMOS and try again.",
        );
        return;
      }
      const next = { character: readCharacter(body?.character), capturedAt: Date.now() };
      setSnapshot(next);
      try {
        saveSnapshot(next);
        setSaveWarning("");
      } catch {
        setSaveWarning("Browser storage is unavailable. This snapshot will not survive a reload.");
      }
    } catch {
      setError(
        "No character snapshot was received. Check the local helper and VMOS before trying again.",
      );
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  }

  function forget() {
    try {
      saveSnapshot(null);
      setSnapshot(null);
      setSaveWarning("");
      setError("");
    } catch {
      setSaveWarning(
        "Could not clear the saved snapshot. Clear this site's storage in browser settings.",
      );
    }
  }

  return (
    <Card aria-label="Connected character">
      <CardContent className="grid gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="grid gap-1">
            <h2 className="font-heading text-base font-semibold">VMOS character</h2>
            <p className="text-sm text-muted-foreground">
              {busy
                ? "Waiting for VMOS sign-in and character data. Keep this page open."
                : available === false
                  ? "To connect, open the guide on this computer with its VMOS helper enabled."
                  : snapshot
                    ? `Last read ${new Date(snapshot.capturedAt).toLocaleString()}. This is a snapshot, not a live session.`
                    : "Read your character from the official Rogo app on your VMOS phone."}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button disabled={!available || busy} data-testid="rogo-connect">
                  {snapshot ? <RefreshCw aria-hidden /> : <Link2 aria-hidden />}
                  {busy ? "Connecting…" : snapshot ? "Refresh snapshot" : "Connect Rogo"}
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Connect to your VMOS character?</AlertDialogTitle>
                  <AlertDialogDescription>
                    Pause the bot first. The local helper will relaunch Rogo on VMOS, sign in once
                    to {realm ? `realm ${realm}` : "the selected realm"}, and read your character.
                    This can disconnect the game on your phone. Only the character snapshot is saved
                    in this browser. The login token stays with the helper.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction data-testid="rogo-confirm" onClick={() => void connect()}>
                    Relaunch and connect
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
            {snapshot && (
              <Button variant="ghost" onClick={forget} disabled={busy}>
                Forget snapshot
              </Button>
            )}
          </div>
        </div>
        {busy && (
          <span className="sr-only" role="status">
            Reading your VMOS character.
          </span>
        )}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        {saveWarning && (
          <p role="status" className="text-sm text-muted-foreground">
            {saveWarning}
          </p>
        )}
        <nav aria-label="Play from the guide" className="flex flex-wrap gap-2">
          <Button asChild>
            <Link to="/daily">Daily optimizer</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/operations?command=4661">Apply a card</Link>
          </Button>
          <Button asChild variant="secondary">
            <Link to="/operations?action=campaign">Retry campaign boss</Link>
          </Button>
          <Button asChild variant="outline">
            <Link to="/operations">All game actions</Link>
          </Button>
        </nav>
        {snapshot && <SnapshotFields snapshot={snapshot} />}
      </CardContent>
    </Card>
  );
}
