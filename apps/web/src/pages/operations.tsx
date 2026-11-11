import { CampaignAttempt } from "@/components/campaign-attempt";
import { AutomationRunningNote } from "@/components/automation-note";
import { localJson, type Session } from "@/lib/game/local-guide";
import { useEffect, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { OperationFields, type CardInventory } from "@/components/operation-fields";
import { formPayload, parsePayload, type Draft } from "@/lib/game/operation-fields";
import { useGame } from "@/lib/game/game-data-context";
import { PageHeader, SectionTitle } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
import reference from "../../../lookup-client/catalog/actions.json";

type Action = (typeof reference.actions)[number] & {
  availability?: string;
  reason?: string | null;
};

const effectNotes: Record<string, string> = {
  session: "This changes the session or its subscriptions.",
  change: "This may change character or account settings, loadouts or inventory.",
  claim: "Claiming a reward can consume an allowance or mark it received.",
  spend: "This may spend currency, materials or entitlements, or create a payment order.",
  social: "Other players may see or be affected by this action.",
  combat: "This can start or settle a fight or consume a challenge attempt.",
  unclear: "The effect of this operation is not established.",
  restricted: "This is not an ordinary player operation.",
  read: "Intended as a read; the server decides availability and side effects.",
};
function Filter({
  label,
  options,
  value,
  change,
}: {
  label: string;
  options: string[];
  value: string;
  change: (v: string) => void;
}) {
  return (
    <label className="grid gap-1 text-sm">
      {label}
      <select
        className="h-10 min-w-0 rounded-md border bg-background px-2"
        value={value}
        onChange={(e) => change(e.target.value)}
      >
        <option value="">All</option>
        {options.map((v) => (
          <option key={v}>{v}</option>
        ))}
      </select>
    </label>
  );
}
export default function OperationsPage() {
  const [params] = useSearchParams();
  return <Workbench key={params.toString()} params={params} />;
}
function Workbench({ params }: { params: URLSearchParams }) {
  const boss = params.get("action") === "campaign";
  const command = Number(params.get("command"));
  const target = reference.actions.find((a) => a.request.id === command);
  const card = params.get("card") ?? "";

  const [actions, setActions] = useState<Action[]>(reference.actions);
  const [session, setSession] = useState<Session>({
    available: false,
    connected: false,
    serverId: "",
  });
  const [query, setQuery] = useState(target ? String(command) : "");
  const [domain, setDomain] = useState(params.get("area") ?? "");
  const [effect, setEffect] = useState(params.get("effect") ?? "");
  const [evidence, setEvidence] = useState("");
  const [page, setPage] = useState(0);
  const [selected, select] = useState(target?.request.id ?? 4651);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState("");
  async function refresh() {
    try {
      const s = await localJson("status");
      setSession({
        available: s.available === true,
        connected: s.connected === true,
        serverId: s.serverId || "",
        characterName: s.characterName,
      });
    } catch {
      setSession({ available: false, connected: false, serverId: "" });
    }
  }
  useEffect(() => {
    let live = true;
    void localJson("catalog")
      .then((c) => {
        if (live && Array.isArray(c.actions) && c.actions.length) setActions(c.actions);
      })
      .catch(() => {});
    void refresh();
    window.addEventListener("focus", refresh);
    return () => {
      live = false;
      window.removeEventListener("focus", refresh);
    };
  }, []);
  const words = query.trim().toLowerCase().split(/\s+/);
  const matches = actions.filter(
    (a) =>
      (!domain || a.domain === domain) &&
      (!effect || a.effect === effect) &&
      (!evidence || a.evidence === evidence) &&
      words.every((w) =>
        [a.request.name, a.reply.name, a.domain, a.action, a.request.id, a.reply.id]
          .join(" ")
          .toLowerCase()
          .includes(w),
      ),
  );
  const shown = matches.slice(page * 12, page * 12 + 12);
  const current = shown.find((a) => a.request.id === selected) ?? shown[0];
  async function disconnect() {
    if (busy) return;
    setBusy(true);
    setNotice("");
    try {
      await localJson("operations", { operation: "session.disconnect" });
    } catch (e) {
      setNotice(e instanceof Error ? e.message : "Disconnect failed.");
    } finally {
      await refresh();
      setBusy(false);
    }
  }
  return (
    <>
      <PageHeader
        title="Game actions"
        eyebrow={reference.build}
        actions={
          <Button asChild variant="outline">
            <Link to="/character">Character connection</Link>
          </Button>
        }
      >
        Explore {actions.length} request types. A game schema describes a message; it does not
        guarantee your account can send it. Nothing runs when you browse.
      </PageHeader>
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border px-4 py-3 text-sm">
        <p role="status">
          {session.connected
            ? `Connected to realm ${session.serverId}`
            : session.available
              ? "Helper ready · connect your character to send requests."
              : "Reference mode · live operations need the local helper."}
        </p>
        {session.connected && (
          <Button disabled={busy} variant="outline" onClick={disconnect}>
            Disconnect
          </Button>
        )}
        {notice && <p role="alert">{notice}</p>}
      </div>
      <nav aria-label="Game action shortcuts" className="flex flex-wrap gap-2">
        {[
          ["Daily optimizer", "/daily"],
          ["All game actions", "/operations"],
          ["Apply a card", "/operations?command=4661"],
          ["Card actions", "/operations?area=Cards"],
          ["Retry campaign boss", "/operations?action=campaign"],
        ].map(([label, to]) => (
          <Button key={to} variant="outline" asChild>
            <Link to={to}>{label}</Link>
          </Button>
        ))}
      </nav>
      {boss && <CampaignAttempt session={session} refresh={refresh} />}
      {!boss && (
        <>
          <section
            aria-label="Filter operations"
            className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr]"
          >
            <div className="grid gap-1">
              <Label htmlFor="operation-search">Find an operation</Label>
              <Input
                id="operation-search"
                placeholder="Name, effect description or ID"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setPage(0);
                }}
              />
            </div>
            <Filter
              label="Area"
              value={domain}
              options={[...new Set(actions.map((a) => a.domain))].sort()}
              change={(v) => {
                setDomain(v);
                setPage(0);
              }}
            />
            <Filter
              label="Effect"
              value={effect}
              options={[...new Set(actions.map((a) => a.effect))].sort()}
              change={(v) => {
                setEffect(v);
                setPage(0);
              }}
            />
            <Filter
              label="Evidence"
              value={evidence}
              options={[...new Set(actions.map((a) => a.evidence))].sort()}
              change={(v) => {
                setEvidence(v);
                setPage(0);
              }}
            />
          </section>
          <div className="grid items-start gap-block lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <section className="grid min-w-0 gap-3">
              <SectionTitle aside={`${matches.length} matches`}>Requests</SectionTitle>
              {shown.map((a) => (
                <button
                  type="button"
                  key={a.request.id}
                  aria-pressed={current?.request.id === a.request.id}
                  className="min-w-0 rounded-lg border px-3 py-2 text-left aria-pressed:border-gold aria-pressed:bg-muted"
                  onClick={() => select(a.request.id)}
                >
                  <span className="block break-all text-sm font-medium">{a.request.name}</span>
                  <span className="text-xs text-muted-foreground">
                    {a.request.id} · {a.domain} · {a.effect}
                  </span>
                </button>
              ))}
              {!shown.length && <p>No matches. Try another name or remove a filter.</p>}
              {matches.length > 12 && (
                <div className="flex items-center justify-between gap-2">
                  <Button variant="outline" disabled={!page} onClick={() => setPage(page - 1)}>
                    Previous
                  </Button>
                  <span>
                    {page + 1} / {Math.ceil(matches.length / 12)}
                  </span>
                  <Button
                    variant="outline"
                    disabled={(page + 1) * 12 >= matches.length}
                    onClick={() => setPage(page + 1)}
                  >
                    Next
                  </Button>
                </div>
              )}
            </section>
            {current && (
              <RequestEditor
                key={current.request.id}
                a={current}
                initialCard={current.request.id === command ? card : ""}
                session={session}
                refresh={refresh}
              />
            )}
          </div>
        </>
      )}
      <p className="measure text-sm text-muted-foreground">
        Checkout and rewarded ads require the official SDK. Use the Daily optimizer or campaign
        retry for supported complete fights. Raw combat start requests are not completed fights.
      </p>
    </>
  );
}
function RequestEditor({
  a,
  initialCard,
  session,
  refresh,
}: {
  a: Action;
  initialCard: string;
  session: Session;
  refresh: () => Promise<void>;
}) {
  const [advanced, setAdvanced] = useState(false);
  const [draft, setDraft] = useState<Draft>(initialCard ? { card_entry: initialCard } : {});
  const [raw, edit] = useState("{}");
  const { data: game } = useGame();
  const [inventory, setInventory] = useState<CardInventory | null>(null);
  const [reviewText, setReviewText] = useState("");
  const [outcome, setOutcome] = useState("");
  const selectedCard = game.cards.find((c) => String(c.id) === draft.card_entry);
  const replacedCard = inventory
    ? game.cards.find((c) => c.id === inventory.slots[Number(draft.slot_entry)])
    : undefined;
  function invalidate() {
    setPrepared(false);
    ticket.current = undefined;
    setResult("");
    setOutcome("");
    setError("");
  }
  const missingCard =
    !advanced &&
    a.request.fields.some(
      (f) =>
        ["card_entry", "slot_entry"].includes(f.name) &&
        a.request.id >= 4653 &&
        a.request.id <= 4667 &&
        !draft[f.name],
    );
  const ticket = useRef<string | undefined>(undefined);
  const [prepared, setPrepared] = useState(false);
  const [pending, setPending] = useState(false);
  const lock = useRef(false);
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const allowed = ["available", "conditional"].includes(a.availability ?? "");
  async function loadCards() {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    invalidate();
    setInventory(null);
    try {
      const r = await localJson("operations", {
        operation: "gateway.execute",
        command: 4651,
        payload: {},
      });
      const info = r.result?.data?.card_info;
      if (!info?.card_sys || r.result.reply !== 4652 || r.result.status !== 0)
        throw new Error("The server did not report the active card loadout.");
      const stars: Record<number, number> = {};
      for (const c of info.cards ?? []) if (c.star > 0) stars[c.entry] = c.star;
      setInventory({ stars, slots: info.card_sys.slot_map ?? {} });
      if (draft.card_entry && !stars[Number(draft.card_entry)]) setDraft({});
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not read cards.");
    } finally {
      await refresh();
      lock.current = false;
      setPending(false);
    }
  }
  async function submit(execute: boolean) {
    if (lock.current) return;
    lock.current = true;
    setPending(true);
    setError("");
    setResult("");
    setPrepared(false);
    try {
      const payload = advanced ? parsePayload(raw) : formPayload(a.request.fields, draft);
      if (!payload || typeof payload !== "object" || Array.isArray(payload))
        throw new Error("Payload must be a JSON object.");
      const resp = await localJson("operations", {
        operation: execute ? "gateway.execute" : "gateway.prepare",
        command: a.request.id,
        payload,
        ...(execute ? { confirm: a.request.name, ticket: ticket.current } : {}),
      });
      setResult(JSON.stringify(resp.result, null, 2));
      if (!execute) setReviewText(JSON.stringify(payload, null, 2));
      if (execute && resp.result.status === 0)
        setOutcome(
          a.request.id === 4661
            ? `${game.cards.find((c) => c.id === resp.result.data?.card_entry)?.name ?? "Card"} equipped in slot ${resp.result.data?.slot_entry ?? "requested"}.`
            : `Server accepted ${a.request.name} (reply ${a.reply.id}).`,
        );
      if (execute && inventory && (a.request.id === 4661 || a.request.id === 4663))
        setInventory({ ...inventory, slots: resp.result.data?.slot_map ?? {} });
      ticket.current = resp.ticket;
      setPrepared(!execute);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Operation failed.");
    } finally {
      await refresh();
      lock.current = false;
      setPending(false);
    }
  }
  return (
    <Card>
      <CardContent className="grid min-w-0 gap-4 pt-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-muted-foreground">
            {a.domain} · {a.effect}
          </p>
          <h2 className="break-all text-xl font-semibold">
            {a.request.id === 4661 ? "Apply a card" : a.request.name}
          </h2>
          <p className="mt-2 text-sm">{a.action}</p>
          {[5001, 5003].includes(a.request.id) && (
            <Link className="mt-2 block text-sm underline" to="/operations?action=campaign">
              Run one complete campaign fight and see the result instead
            </Link>
          )}
        </div>
        <p className="text-sm">
          {a.request.id} → {a.reply.id} · {a.evidence} · {a.availability ?? "reference only"}
          {a.reason && ` — ${a.reason}`}
        </p>
        <details className="text-sm">
          <summary>Fields and client evidence</summary>
          <dl className="mt-2 grid gap-2">
            {[a.request, a.reply].map((m) => (
              <div key={m.id}>
                <dt className="font-medium">{m.name}</dt>
                <dd className="break-words font-mono text-xs">
                  {m.fields.map((f) => `${f.name}: ${f.type}`).join(" · ") || "(empty message)"}
                </dd>
              </div>
            ))}
            <div>
              <dt>Direct send</dt>
              <dd className="break-words">{a.sendSites.join(", ") || "No direct sender found."}</dd>
            </div>
          </dl>
        </details>
        <div className="grid gap-2">
          {!advanced && (a.request.id === 4661 || a.request.id === 4663) && (
            <div className="grid gap-2">
              <Button
                variant="outline"
                className="justify-self-start"
                disabled={!session.connected || pending}
                onClick={() => void loadCards()}
              >
                Load my cards and slots
              </Button>
              {inventory && (
                <p role="status" className="text-sm">
                  {Object.keys(inventory.stars).length} activated cards · showing the current
                  loadout.
                </p>
              )}
            </div>
          )}
          {!advanced && (
            <OperationFields
              inventory={inventory}
              command={a.request.id}
              fields={a.request.fields}
              draft={draft}
              set={(v) => {
                invalidate();
                setDraft(v);
              }}
              disabled={pending || !allowed}
            />
          )}
          {a.request.id === 4661 && (
            <p className="text-sm text-muted-foreground">
              Equips an activated card on the connected character and can replace the card already
              in that slot. The server checks ownership and unlock level.
            </p>
          )}
          <Button
            className="justify-self-start"
            size="sm"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              if (!advanced) {
                try {
                  edit(JSON.stringify(formPayload(a.request.fields, draft), null, 2));
                } catch {
                  setError("Correct the fields before switching to JSON.");
                  return;
                }
              }
              invalidate();
              setAdvanced(!advanced);
            }}
          >
            {advanced ? "Back to form" : "Edit as JSON"}
          </Button>
          {advanced && (
            <>
              <Label htmlFor="operation-payload">Request payload (protobuf JSON)</Label>
              <Textarea
                id="operation-payload"
                className="min-h-24 font-mono"
                spellCheck={false}
                autoComplete="off"
                disabled={pending || !allowed}
                value={raw}
                onChange={(e) => {
                  invalidate();
                  edit(e.target.value);
                  setPrepared(false);
                  setResult("");
                  setError("");
                }}
              />
            </>
          )}
          <p className="text-xs text-muted-foreground">
            Use quoted decimal strings for 64-bit IDs. Payloads and replies are not saved.
          </p>
        </div>
        <p className="text-sm">{effectNotes[a.effect]}</p>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={pending || !session.available || !allowed || missingCard}
            onClick={() => submit(false)}
          >
            Validate without sending
          </Button>
          <Button
            disabled={pending || !prepared || !session.connected || !allowed}
            onClick={() => setConfirming(true)}
          >
            Review and send
          </Button>
        </div>
        <AlertDialog open={confirming} onOpenChange={setConfirming}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>
                {a.request.id === 4661 && !advanced && selectedCard
                  ? `Equip ${selectedCard.name}?`
                  : `Send ${a.request.name}?`}
              </AlertDialogTitle>
              <AlertDialogDescription>
                {a.request.id === 4661 && !advanced && replacedCard
                  ? `This replaces ${replacedCard.name} in the selected slot. `
                  : a.action + " "}
                {effectNotes[a.effect]} This will send request {a.request.id} once on realm{" "}
                {session.serverId}
                {session.characterName ? ` as ${session.characterName}` : ""}. Do not retry an
                uncertain result.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <pre className="max-h-32 overflow-auto text-xs">{reviewText}</pre>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction onClick={() => submit(true)}>Send once</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
        {pending && <p role="status">Waiting for the helper…</p>}
        {error && (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        )}
        <AutomationRunningNote message={error} />
        {result && (
          <div>
            {outcome && <p role="status">{outcome}</p>}
            <h3 className="font-semibold">
              {prepared ? "Validated · not sent" : "Operation result"}
            </h3>
            <pre
              data-testid="operation-result"
              className="mt-2 max-h-80 overflow-auto rounded-md bg-muted p-3 text-xs"
            >
              {result}
            </pre>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
