import { useMemo, useState } from "react";
import { ArrowRight, Minus, Plus, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useGame } from "@/lib/game/game-data-context";
import { useCharacter, useProfile } from "@/lib/game/profile-context";
import {
  applyAllocation,
  nextPointCost,
  optimize,
  PRIMARY,
  PRIMARY_LABEL,
  recommended,
  spentCost,
  stageTime,
  type Primary,
  type Six,
} from "@rogo/game/attributes";
import { pointsAt } from "@/lib/game/characters";
import { specInfo } from "@rogo/game/classes";
import { computePower, solveSkillPower } from "@rogo/game/power";
import { capacity, work } from "@rogo/game/stage";
import type { Stats } from "@rogo/game/profile";
import { fixed, full, pct, short } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { Stage } from "@rogo/game/types";

const WHAT: Record<Primary, string> = {
  str: "PATK %, PDEF",
  agi: "Attack speed, FLEE",
  vit: "Max HP, DMG RED",
  int: "MATK %",
  dex: "HIT, Haste (PATK % for archers)",
  luk: "CRIT, Skill CRIT",
};

/** The game's attribute screen: + and − per stat, points left, and a before → after preview. */
export function StatPointsPanel({ stage }: { stage: Stage }) {
  const { data, stageById } = useGame();
  const profile = useCharacter();
  const { setProfile } = useProfile();
  const t = data.attrTransfer;
  const cur = profile.attributes;
  const budget = Math.max(pointsAt(t, profile.level), spentCost(cur.alloc));
  const [draft, setDraft] = useState<Six>(cur.alloc);
  const left = budget - spentCost(draft);
  const spec = specInfo(profile.spec);

  const after = useMemo(() => applyAllocation(t, profile, cur, draft), [t, profile, cur, draft]);
  const skill = solveSkillPower(data.battleRate, profile.spec, profile.stats, profile.power);
  const powerAfter = computePower(data.battleRate, profile.spec, after, skill).power;
  const powerNow = computePower(data.battleRate, profile.spec, profile.stats, skill).power;
  const time0 = stageTime(profile, stage, profile.normalShare);
  const time1 = stageTime({ ...profile, stats: after }, stage, profile.normalShare);
  const gain = time0 / time1 - 1;
  const cap = capacity(profile, stageById);
  const progressAfter = cap ? Math.min(1, cap / work({ ...profile, stats: after }, stage)) : 0;
  const progressNow = cap ? Math.min(1, cap / work(profile, stage)) : 0;

  const rec = useMemo(
    () => (spec ? recommended(spec.recommend, budget) : cur.alloc),
    [spec, budget, cur.alloc],
  );
  // the best spread is a search over thousands of fights, so it runs only when asked for
  const [busy, setBusy] = useState(false);
  const fillBest = () => {
    setBusy(true);
    window.setTimeout(() => {
      const free = budget - spentCost(cur.alloc);
      setDraft(optimize(t, profile, { ...cur, free }, stage, profile.normalShare).alloc);
      setBusy(false);
    }, 0);
  };

  const step = (k: Primary, dir: 1 | -1) =>
    setDraft((d) => {
      if (dir > 0) {
        if (nextPointCost(d[k]) > budget - spentCost(d) || cur.base[k] + d[k] >= 400) return d;
        return { ...d, [k]: d[k] + 1 };
      }
      return d[k] > 0 ? { ...d, [k]: d[k] - 1 } : d;
    });

  const changed = PRIMARY.some((k) => draft[k] !== cur.alloc[k]);

  return (
    <div className="split-main items-start">
      <Card>
        <CardHeader className="grid gap-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <CardTitle>Attribute points</CardTitle>
            <span className="game-chip text-sm">
              Points left <span className="tabular ml-1 text-base">{full(left)}</span>
            </span>
          </div>
          <CardDescription>
            Like the game's Attribute screen: each point costs floor(points already in that stat ÷
            5) + 1. Try a spread here, then apply it to your character once you've done it in game.
          </CardDescription>
        </CardHeader>
        <CardContent className="grid gap-block">
          <ul className="grid gap-2">
            {PRIMARY.map((k) => {
              const total = cur.base[k] + draft[k];
              const diff = draft[k] - cur.alloc[k];
              const canAdd = nextPointCost(draft[k]) <= left && total < 400;
              return (
                <li
                  key={k}
                  className="grid grid-cols-[3.25rem_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 rounded-lg border border-gold/25 bg-parchment/40 px-3 py-2"
                >
                  <span className="font-heading text-base font-semibold">{PRIMARY_LABEL[k]}</span>
                  <span className="grid min-w-0 gap-1">
                    <span className="flex items-baseline gap-2">
                      <span className="tabular font-heading text-xl font-semibold">{total}</span>
                      {diff !== 0 && (
                        <span
                          className={cn(
                            "tabular text-sm font-semibold",
                            diff > 0 ? "text-good" : "text-critical",
                          )}
                        >
                          {diff > 0 ? `+${diff}` : diff}
                        </span>
                      )}
                      <span className="truncate text-xs text-muted-foreground">{WHAT[k]}</span>
                    </span>
                    <span className="h-1.5 overflow-hidden rounded-full bg-leather/15">
                      <span
                        className="block h-full rounded-full bg-[linear-gradient(90deg,var(--gold),var(--ember))]"
                        style={{ width: `${Math.min(100, (total / 400) * 100)}%` }}
                      />
                    </span>
                  </span>
                  <span className="flex items-center gap-1.5">
                    <Button
                      size="icon"
                      variant="outline"
                      disabled={draft[k] <= 0}
                      onClick={() => step(k, -1)}
                      aria-label={`Take a point out of ${PRIMARY_LABEL[k]}`}
                    >
                      <Minus aria-hidden />
                    </Button>
                    <span
                      className="tabular w-[2.75rem] text-center text-sm text-muted-foreground"
                      title="Cost of the next point"
                    >
                      {canAdd ? `−${nextPointCost(draft[k])}` : "—"}
                    </span>
                    <Button
                      size="icon"
                      variant="secondary"
                      disabled={!canAdd}
                      onClick={() => step(k, 1)}
                      aria-label={`Add a point to ${PRIMARY_LABEL[k]}`}
                    >
                      <Plus aria-hidden />
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setDraft(cur.alloc)} disabled={!changed}>
              <RotateCcw aria-hidden /> Reset
            </Button>
            <Button
              variant="outline"
              onClick={() => setDraft({ str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 })}
            >
              Clear all
            </Button>
            <Button variant="outline" onClick={() => setDraft(rec)}>
              <Wand2 aria-hidden /> Game's Recommended
            </Button>
            <Button variant="secondary" onClick={fillBest} disabled={busy} aria-busy={busy}>
              <Sparkles aria-hidden className={busy ? "animate-pulse" : undefined} />
              {busy ? "Working it out…" : `Best for ${stage.id}`}
            </Button>
          </div>
        </CardContent>
      </Card>

      <div className="grid min-w-0 content-start gap-block lg:sticky lg:top-[calc(var(--topbar-h)+env(safe-area-inset-top)+1rem)]">
        <Card>
          <CardHeader>
            <CardTitle>Preview</CardTitle>
            <CardDescription>Your stats now, and with this spread.</CardDescription>
          </CardHeader>
          <CardContent>
            <dl className="grid gap-1.5 text-sm">
              <Row label="Power" now={powerNow} next={powerAfter} fmt={full} />
              {previewRows(profile.damage).map((r) => (
                <Row
                  key={r.label}
                  label={r.label}
                  now={r.get(profile.stats)}
                  next={r.get(after)}
                  fmt={r.fmt}
                />
              ))}
            </dl>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>On {stage.id}</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Damage on this stage</span>
              <span
                className={cn(
                  "tabular font-heading text-xl font-semibold",
                  gain > 0.0005 ? "text-good" : gain < -0.0005 ? "text-critical" : "",
                )}
              >
                {gain >= 0 ? "+" : ""}
                {pct(gain)}
              </span>
            </div>
            <div className="flex items-baseline justify-between gap-3">
              <span className="text-muted-foreground">Enemy HP you get through</span>
              <span className="tabular flex items-center gap-1.5">
                {pct(progressNow, 0)} <ArrowRight className="size-3.5" aria-hidden />
                <span className={progressAfter >= 1 ? "font-semibold text-good" : "font-semibold"}>
                  {progressAfter >= 1 ? "Clears" : pct(progressAfter, 0)}
                </span>
              </span>
            </div>
            <Button
              size="lg"
              disabled={!changed || left < 0}
              onClick={() => {
                setProfile({
                  ...profile,
                  stats: after,
                  attributes: { ...cur, alloc: draft, free: Math.max(0, left) },
                });
                toast.success("Allocation applied to your character", {
                  description: "Stats were updated to the preview.",
                });
              }}
            >
              Apply to character
            </Button>
            <p className="text-xs text-muted-foreground">
              The model counts damage only, with {pct(profile.normalShare, 0)} of it from normal
              attacks, so VIT never wins here even though it keeps you alive.
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function previewRows(damage: "physical" | "magic") {
  const atk = damage === "physical" ? "patk" : "matk";
  return [
    { label: atk === "patk" ? "PATK" : "MATK", get: (s: Stats) => s[atk], fmt: short },
    { label: "ATK Freq", get: (s: Stats) => s.atkFreq, fmt: (v: number) => fixed(v) },
    { label: "CRIT", get: (s: Stats) => s.crit, fmt: (v: number) => fixed(v, 1) },
    { label: "Skill CRIT", get: (s: Stats) => s.skillCrit, fmt: (v: number) => fixed(v, 1) },
    { label: "Haste", get: (s: Stats) => s.haste, fmt: (v: number) => pct(v) },
    { label: "HIT", get: (s: Stats) => s.hit, fmt: (v: number) => fixed(v, 0) },
    { label: "FLEE", get: (s: Stats) => s.flee, fmt: (v: number) => fixed(v, 0) },
    { label: "Max HP", get: (s: Stats) => s.hp, fmt: short },
    { label: "DMG RED", get: (s: Stats) => s.dmgRed, fmt: (v: number) => pct(v) },
  ];
}

function Row({
  label,
  now,
  next,
  fmt,
}: {
  label: string;
  now: number;
  next: number;
  fmt: (v: number) => string;
}) {
  const same = fmt(now) === fmt(next);
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto_1rem_auto] items-center gap-x-2">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="tabular text-right">{fmt(now)}</dd>
      <ArrowRight className={cn("size-3.5", same ? "opacity-25" : "text-gold")} aria-hidden />
      <dd
        className={cn(
          "tabular min-w-[4.5rem] text-right font-semibold",
          !same && (next > now ? "text-good" : "text-critical"),
        )}
      >
        {fmt(next)}
      </dd>
    </div>
  );
}
