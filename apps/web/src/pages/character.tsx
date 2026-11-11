import { Fragment, useId, useMemo, useRef, useState } from "react";
import { Link, useSearchParams } from "react-router";
import { Download, FileUp, Link2, Trash2, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { PageHeader, SectionTitle, Stat } from "@/components/page-header";
import { ConnectRogo } from "@/components/character/connect-rogo";
import { QuickSetup } from "@/components/character/quick-setup";
import { SpecSelect } from "@/components/character/spec-select";
import { SpecIcon } from "@/components/game-icon";
import { StageField } from "@/components/stage-field";
import { StatField } from "@/components/stat-field";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
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
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGame } from "@/lib/game/game-data-context";
import { useCharacter, useProfile } from "@/lib/game/profile-context";
import { STAT_FIELDS, type Profile, type Stats } from "@rogo/game/profile";
import { specInfo, specName } from "@rogo/game/classes";
import { PRIMARY, PRIMARY_LABEL, spentCost } from "@rogo/game/attributes";
import { freePoints, pointsAt, shareUrl } from "@/lib/game/characters";
import { downloadCharacters, fileSafe, readCharacterFile } from "@/lib/game/character-files";
import { computePower, solveSkillPower } from "@rogo/game/power";
import { hit } from "@rogo/game/damage";
import { bossOf, calibrationOf, furthestClear } from "@rogo/game/stage";
import { stageName } from "@/lib/game/data";
import { fixed, full, mult, pct, short } from "@/lib/format";

const GROUPS: { id: (typeof STAT_FIELDS)[number]["group"]; title: string; note?: string }[] = [
  { id: "basic", title: "Basic attributes" },
  { id: "advanced", title: "Advanced attributes" },
  { id: "boost", title: "Damage boosts and reductions" },
  { id: "final", title: "Final damage" },
  { id: "refine", title: "Refine" },
  {
    id: "gear",
    title: "Gear % (not on the stat screen)",
    note: "Add up the PATK % (MATK % for mages) lines on your weapon, inserted cards and Collection Gear. They share one pool with the % that STR, DEX or INT give, so a big weapon % makes those points worth less. Leave it at 0 if unsure.",
  },
];

export default function CharacterPage() {
  const { profile } = useProfile();
  const [params, setParams] = useSearchParams();
  if (!profile || params.get("new") === "1") return <Setup onDone={() => setParams({})} />;
  return <Editor />;
}

function Setup({ onDone }: { onDone: () => void }) {
  const { profile, add } = useProfile();
  const file = useRef<HTMLInputElement>(null);
  return (
    <>
      <PageHeader
        eyebrow="Character"
        title={profile ? "Add another character" : "Set up your character"}
        actions={
          <>
            <Button variant="outline" onClick={() => file.current?.click()}>
              <FileUp aria-hidden /> Import from file
            </Button>
            {profile && (
              <Button variant="ghost" onClick={onDone}>
                Back to {profile.name}
              </Button>
            )}
          </>
        }
      >
        Your class, level and power are enough to start. Every page then shows your own progress,
        damage and upgrade plan. Characters stay in this browser.
      </PageHeader>
      <ConnectRogo />
      <div className="split-main items-start">
        <QuickSetup onCreated={onDone} />
        <aside className="grid content-start gap-4 text-sm text-muted-foreground">
          <SectionTitle>Where to find it</SectionTitle>
          <ul className="grid gap-3 [&>li]:grid [&>li]:gap-0.5">
            <li>
              <span className="font-semibold text-foreground">Class build and power</span>
              The character panel on the main screen.
            </li>
            <li>
              <span className="font-semibold text-foreground">Base level</span>
              Next to your name; it sets how many attribute points you have.
            </li>
            <li>
              <span className="font-semibold text-foreground">Furthest stage cleared</span>
              The campaign map, as chapter-stage like 7-12.
            </li>
            <li>
              <span className="font-semibold text-foreground">Detailed stats, later</span>
              Overview → Attribute → ⓘ Attribute Details. Until then they're estimated from power.
            </li>
          </ul>
        </aside>
      </div>
      <input
        ref={file}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={async (e) => {
          const f = e.target.files?.[0];
          e.target.value = "";
          if (!f) return;
          try {
            const list = await readCharacterFile(f);
            if (!list.length) throw new Error("no characters");
            list.forEach(add);
            toast.success(
              list.length === 1 ? `${list[0].name} imported` : `${list.length} characters imported`,
            );
            onDone();
          } catch {
            toast.error("That file isn't a character saved by this guide", {
              description: "Use a .json file from Character → Save to file.",
            });
          }
        }}
      />
    </>
  );
}

function Editor() {
  const { data, estimates, stageById } = useGame();
  const profile = useCharacter();
  const { setProfile, remove } = useProfile();
  const t = data.attrTransfer;
  // level and allocation decide the unspent points, so keep them in step on every edit
  const save = (patch: Partial<Profile>) => {
    const next = { ...profile, ...patch };
    next.attributes = {
      ...next.attributes,
      free: freePoints(t, next.level, next.attributes.alloc),
    };
    setProfile(next);
  };
  const setStat = (k: keyof Stats, v: number) =>
    save({ stats: { ...profile.stats, [k]: v }, statsSource: "entered" });

  const skillPower = solveSkillPower(data.battleRate, profile.spec, profile.stats, profile.power);
  const power = useMemo(
    () => computePower(data.battleRate, profile.spec, profile.stats, skillPower),
    [data.battleRate, profile.spec, profile.stats, skillPower],
  );
  const cal = useMemo(() => calibrationOf(profile, stageById), [profile, stageById]);
  const furthest = furthestClear(estimates, profile.power);
  const next = estimates.find((e) => e.progress < 1);
  const [target, setTarget] = useState(next?.id ?? "1-1");
  const targetStage = stageById.get(target);
  const boss = targetStage ? bossOf(targetStage) : undefined;
  const h = boss ? hit(profile, boss) : null;
  const budget = pointsAt(t, profile.level);
  const spent = spentCost(profile.attributes.alloc);
  const info = specInfo(profile.spec);
  const ids = {
    name: useId(),
    spec: useId(),
    level: useId(),
    lost: useId(),
    done: useId(),
    share: useId(),
  };
  const stuck = profile.progress.stuck;

  return (
    <>
      <PageHeader
        eyebrow={specName(profile.spec)}
        title={profile.name || "Character"}
        actions={
          <Button variant="outline" asChild>
            <Link to="/character?new=1">
              <UserPlus aria-hidden /> Add character
            </Link>
          </Button>
        }
      >
        Read the stats from Overview → Attribute → ⓘ Attribute Details. Every estimate in the guide
        follows these numbers, and they stay in this browser.
      </PageHeader>
      <ConnectRogo />

      <div className="split-main items-start">
        <div className="grid min-w-0 gap-block">
          <Card>
            <CardHeader>
              <CardTitle>Character</CardTitle>
            </CardHeader>
            <CardContent className="form-grid">
              <div className="grid gap-1.5">
                <Label htmlFor={ids.name}>Name</Label>
                <Input
                  id={ids.name}
                  value={profile.name}
                  autoComplete="off"
                  onChange={(e) => save({ name: e.target.value })}
                />
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={ids.spec}>Class build</Label>
                <SpecSelect
                  id={ids.spec}
                  value={profile.spec}
                  onChange={(spec) =>
                    save({ spec, damage: specInfo(spec)?.damage ?? profile.damage })
                  }
                />
                <span className="text-xs text-muted-foreground">
                  {info?.jobs}.{" "}
                  {profile.damage === "physical"
                    ? "Physical: PATK against PDEF."
                    : "Magic: MATK against MDEF."}
                </span>
              </div>
              <div className="grid gap-1.5">
                <Label htmlFor={ids.level}>Base level</Label>
                <Input
                  id={ids.level}
                  inputMode="numeric"
                  className="tabular"
                  value={profile.level || ""}
                  onChange={(e) =>
                    save({
                      level: Math.min(120, Math.max(1, Math.floor(Number(e.target.value) || 1))),
                    })
                  }
                />
              </div>
              <StatField
                label="Power"
                unit="flat"
                plainLabel
                value={profile.power}
                onChange={(v) => save({ power: v })}
                hint="8,380,700 or 8.38M both work"
              />
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Campaign progress</CardTitle>
              <CardDescription>
                Tells the stage model how much damage you get through in 40 seconds. A stage you
                lost, with how much of it you got done, is the most precise.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-block">
              <div className="form-grid">
                <StageField
                  label="Furthest stage cleared"
                  value={profile.progress.cleared}
                  optional
                  onChange={(v) => save({ progress: { ...profile.progress, cleared: v } })}
                />
                <div className="flex min-h-(--touch) items-center gap-3 md:mt-6">
                  <Switch
                    id={ids.lost}
                    checked={!!stuck}
                    onCheckedChange={(on) =>
                      save({
                        progress: {
                          ...profile.progress,
                          stuck: on ? { stage: next?.id ?? "1-1", done: 0.9 } : null,
                        },
                      })
                    }
                  />
                  <Label htmlFor={ids.lost}>I lost a stage recently</Label>
                </div>
              </div>
              {stuck && (
                <div className="form-grid rounded-lg border border-gold/30 bg-parchment/40 p-4">
                  <StageField
                    label="Stage you lost"
                    value={stuck.stage}
                    onChange={(v) =>
                      save({ progress: { ...profile.progress, stuck: { ...stuck, stage: v } } })
                    }
                  />
                  <div className="grid content-start gap-3">
                    <Label htmlFor={ids.done}>
                      Enemy HP gone when time ran out: {pct(stuck.done, 0)}
                    </Label>
                    <Slider
                      id={ids.done}
                      min={0.3}
                      max={1}
                      step={0.01}
                      value={[stuck.done]}
                      onValueChange={([v]) =>
                        save({ progress: { ...profile.progress, stuck: { ...stuck, done: v } } })
                      }
                    />
                    <span className="text-xs text-muted-foreground">
                      Read it off Monsters Remaining and the boss bar at the end of the fight.
                    </span>
                  </div>
                </div>
              )}
              <p className="measure text-sm text-muted-foreground">
                {cal?.source === "fight" &&
                  `Estimates are anchored on your fight at ${cal.stage.id}.`}
                {cal?.source === "cleared" &&
                  `Estimates assume you clear ${cal.stage.id} but not the stage after it yet.`}
                {cal?.source === "reference" &&
                  "No progress given yet, so estimates assume a typical damage rate for your attack speed. Add your furthest clear to fix that."}
              </p>
            </CardContent>
          </Card>

          {profile.statsSource === "estimated" && (
            <Alert>
              <AlertTitle>These stats are estimated from your power</AlertTitle>
              <AlertDescription>
                They follow a typical stat mix scaled to {short(profile.power)} power. Type in your
                own from Attribute Details and the damage numbers become exact.
              </AlertDescription>
            </Alert>
          )}

          {GROUPS.map((g) => (
            <Card key={g.id}>
              <CardHeader>
                <CardTitle>{g.title}</CardTitle>
                {g.note && <CardDescription className="measure">{g.note}</CardDescription>}
              </CardHeader>
              <CardContent className="form-grid-dense">
                {STAT_FIELDS.filter((f) => f.group === g.id).map((f) => (
                  <StatField
                    key={f.key}
                    label={f.label}
                    unit={f.unit}
                    value={profile.stats[f.key]}
                    onChange={(v) => setStat(f.key, v)}
                  />
                ))}
              </CardContent>
            </Card>
          ))}

          <Card>
            <CardHeader>
              <CardTitle>Attribute points</CardTitle>
              <CardDescription>
                From the Attribute tab: "Total Allocated" per stat, and the base (the "All" column
                minus "Total Allocated"). The planner uses these to suggest where points go.
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-block">
              <div className="overflow-x-auto">
                <div className="grid min-w-[26rem] grid-cols-[4.5rem_repeat(6,minmax(0,1fr))] items-center gap-2 text-sm">
                  <span />
                  {PRIMARY.map((k) => (
                    <span
                      key={k}
                      className="text-center text-xs font-semibold tracking-[0.1em] text-muted-foreground"
                    >
                      {PRIMARY_LABEL[k]}
                    </span>
                  ))}
                  {(["alloc", "base"] as const).map((row) => (
                    <Fragment key={row}>
                      <span className="text-xs text-muted-foreground">
                        {row === "alloc" ? "Allocated" : "Base"}
                      </span>
                      {PRIMARY.map((k) => (
                        <Input
                          key={k}
                          inputMode="numeric"
                          className="tabular px-1 text-center"
                          aria-label={`${PRIMARY_LABEL[k]} ${row === "alloc" ? "allocated" : "base"}`}
                          value={profile.attributes[row][k]}
                          onChange={(e) => {
                            const n = Math.max(0, Math.floor(Number(e.target.value) || 0));
                            save({
                              attributes: {
                                ...profile.attributes,
                                [row]: { ...profile.attributes[row], [k]: n },
                              },
                            });
                          }}
                        />
                      ))}
                    </Fragment>
                  ))}
                </div>
              </div>
              <div className="form-grid">
                <div className="grid content-start gap-1 text-sm">
                  <span className="text-xs text-muted-foreground">
                    Points at level {profile.level}
                  </span>
                  <span className="tabular">
                    {full(budget)} total · {full(spent)} spent ·{" "}
                    <span className={spent > budget ? "text-destructive" : ""}>
                      {spent > budget
                        ? `${full(spent - budget)} more than the level gives`
                        : `${full(budget - spent)} unspent`}
                    </span>
                  </span>
                  <span className="text-xs text-muted-foreground">
                    A point costs floor(points already in that stat ÷ 5) + 1.
                  </span>
                </div>
                <div className="grid gap-3">
                  <Label htmlFor={ids.share} className="text-xs font-normal text-muted-foreground">
                    Damage from normal attacks: {pct(profile.normalShare, 0)} (the rest from skills)
                  </Label>
                  <Slider
                    id={ids.share}
                    min={0}
                    max={1}
                    step={0.05}
                    value={[profile.normalShare]}
                    onValueChange={([v]) => save({ normalShare: v })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Save and share</CardTitle>
              <CardDescription>
                A share link carries the character inside the link; opening it offers to add a copy.
                A file moves your characters to another browser.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-wrap items-center gap-3">
              <Button
                variant="secondary"
                onClick={async () => {
                  try {
                    await navigator.clipboard.writeText(shareUrl(profile));
                    toast.success("Share link copied");
                  } catch {
                    toast.error("Couldn't reach the clipboard", {
                      description: "Your browser blocked it; try Save to file instead.",
                    });
                  }
                }}
              >
                <Link2 aria-hidden /> Copy share link
              </Button>
              <Button
                variant="outline"
                onClick={() => downloadCharacters([profile], `${fileSafe(profile.name)}.json`)}
              >
                <Download aria-hidden /> Save to file
              </Button>
              <AlertDialog>
                <AlertDialogTrigger asChild>
                  <Button variant="ghost" className="text-destructive sm:ml-auto">
                    <Trash2 aria-hidden /> Delete character
                  </Button>
                </AlertDialogTrigger>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Delete {profile.name}?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Its stats and progress are removed from this browser and can't be brought
                      back, unless you saved it to a file or a share link first.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Keep it</AlertDialogCancel>
                    <AlertDialogAction
                      variant="destructive"
                      onClick={() => {
                        remove(profile.id);
                        toast(`${profile.name} deleted`);
                      }}
                    >
                      Delete character
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </CardContent>
          </Card>
        </div>

        <aside className="grid min-w-0 content-start gap-block lg:sticky lg:top-[calc(var(--topbar-h)+env(safe-area-inset-top)+1rem)]">
          <Stat
            lead
            label="Power"
            value={
              <span className="flex items-center gap-3">
                <SpecIcon spec={profile.spec} className="size-10 shrink-0" />
                {full(profile.power)}
              </span>
            }
            hint={`Computed from stats: ${full(power.power)}`}
          />
          <Card size="sm">
            <CardHeader>
              <CardTitle>Power breakdown</CardTitle>
              <CardDescription>
                Flat stats × (1 + rate stats) × (1 + penetration and final).
              </CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3">
              <div className="grid grid-cols-[minmax(0,1.4fr)_repeat(2,minmax(0,1fr))] gap-2 text-center">
                <Mini label="Flat" value={short(power.layers[1] ?? 0)} />
                <Mini label="Rate" value={`+${fixed(power.layers[2] ?? 0)}`} />
                <Mini label="Final" value={`+${fixed(power.layers[3] ?? 0)}`} />
              </div>
              <p className="text-xs text-muted-foreground">
                Skill levels add a hidden term ({fixed(skillPower)} × weight) that the stat screen
                doesn't show; it is solved from the power you entered.
              </p>
            </CardContent>
          </Card>
          <Stat
            label="Furthest stage these stats clear"
            value={furthest ? stageName(data, furthest.id) : "–"}
          />
          <Stat
            label="Next stage"
            value={
              next ? (
                <Link className="hover:underline" to={`/stages/${next.id}`}>
                  {stageName(data, next.id)}
                </Link>
              ) : (
                "All clear"
              )
            }
            hint={next ? `needs about ${short(next.power)}` : undefined}
          />
          <Card size="sm">
            <CardHeader>
              <CardTitle>Your hit on a stage boss</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3">
              <StageField label="Stage" value={target} onChange={setTarget} />
              {boss && h && (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{data.monsters[boss.id]?.name}</TableHead>
                      <TableHead className="text-right">Value</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    <Row k="Base" v={short(h.base)} />
                    <Row k="Modifier, normal" v={mult(h.innerNormal)} />
                    <Row k="Modifier, skill" v={mult(h.innerSkill)} />
                    <Row k="Final modifier" v={mult(h.final)} />
                    <Row k="Normal hit" v={short(h.normal)} strong />
                    <Row k="Skill hit (×1.0)" v={short(h.skill)} strong />
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </aside>
      </div>
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid gap-0.5 rounded-md border border-gold/25 bg-parchment/60 p-2">
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className="tabular text-sm font-semibold">{value}</span>
    </div>
  );
}

function Row({ k, v, strong }: { k: string; v: string; strong?: boolean }) {
  return (
    <TableRow>
      <TableCell className={strong ? "font-medium" : ""}>{k}</TableCell>
      <TableCell className={`tabular text-right ${strong ? "font-semibold" : ""}`}>{v}</TableCell>
    </TableRow>
  );
}
