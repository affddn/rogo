import { useDeferredValue, useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { Minus, Plus, RotateCcw } from "lucide-react";
import { PageHeader, SectionTitle, Stat } from "@/components/page-header";
import { LoadingState } from "@/components/states";
import { SpecSelect } from "@/components/character/spec-select";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGame } from "@/lib/game/game-data-context";
import { useProfile } from "@/lib/game/profile-context";
import { REFERENCE } from "@rogo/game/reference";
import { useAssetIndex, useJobs, useSkills } from "@/lib/game/extra-data";
import { attrLine } from "@rogo/game/attr-format";
import {
  collectMods,
  evalSkill,
  skillCdUnder,
  skillCooldown,
  type JobsData,
  type SkillNode,
  type SkillsData,
} from "@rogo/game/data/skills";
import { buildRate, nextPoints } from "@rogo/game/skill-plan";
import { fixed, full, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const base = import.meta.env.BASE_URL;

export default function SkillsPage() {
  const skills = useSkills();
  const jobs = useJobs();
  return (
    <>
      <PageHeader eyebrow="Gear and growth" title="Skills and jobs">
        Every class's skill tree with what each level does, which skill point raises your damage
        most, and what each job change and level asks for.
      </PageHeader>
      {skills && jobs ? (
        <Tabs defaultValue="tree" className="gap-block">
          <TabsList>
            <TabsTrigger value="tree">Skill tree</TabsTrigger>
            <TabsTrigger value="jobs">Job changes</TabsTrigger>
            <TabsTrigger value="levels">Levels</TabsTrigger>
          </TabsList>
          <TabsContent value="tree">
            <Tree d={skills} jobs={jobs} />
          </TabsContent>
          <TabsContent value="jobs">
            <JobChanges jobs={jobs} />
          </TabsContent>
          <TabsContent value="levels">
            <Levels jobs={jobs} />
          </TabsContent>
        </Tabs>
      ) : (
        <LoadingState label="Loading skills…" />
      )}
    </>
  );
}

function SkillIcon({ id, name }: { id: number; name: string }) {
  const index = useAssetIndex();
  const has = index?.skill?.some((x) => String(x) === String(id));
  return (
    <span className="grid size-11 shrink-0 place-items-center rounded-full border-2 border-gold/60 bg-leather/85 font-heading text-sm font-semibold text-gold">
      {has ? (
        <img
          src={`${base}game/skill/${id}.webp`}
          alt=""
          width={44}
          height={44}
          className="size-full rounded-full object-cover"
        />
      ) : (
        name.charAt(0)
      )}
    </span>
  );
}

function Tree({ d, jobs }: { d: SkillsData; jobs: JobsData }) {
  const { data } = useGame();
  const { profile, setProfile } = useProfile();
  const who = profile ?? REFERENCE;
  const [spec, setSpec] = useState(who.spec);
  // a character's levels are saved with it; without one (or for another class) they stay on this page
  const mine = !!profile && spec === profile.spec;
  const [scratch, setScratch] = useState<Record<string, number>>({});
  const levels = mine ? profile.skills : scratch;
  const setLevels = (next: Record<string, number>) =>
    mine ? setProfile({ ...profile, skills: next }) : setScratch(next);
  const id = useId();
  const tierId = useId();
  const tree = d.specs[spec];
  const haste = who.stats.haste;
  const atkFreq = who.stats.atkFreq;
  // the highest job tier you're on: skills above it can't take points yet
  const [maxTier, setMaxTier] = useState(() =>
    Math.max(
      1,
      ...(tree?.nodes.filter((n) => (levels[n.skill] ?? 0) > 0).map((n) => n.tier) ?? []),
    ),
  );
  // the ranking re-runs the whole build per option, so it trails the clicks instead of blocking them
  const slow = useDeferredValue(levels);
  const rate = useMemo(
    () => buildRate(d, spec, slow, haste, atkFreq),
    [d, spec, slow, haste, atkFreq],
  );
  const ranked = useMemo(
    () =>
      nextPoints(d, spec, slow, haste, atkFreq)
        .filter((r) => (tree?.nodes.find((n) => n.skill === r.skill)?.tier ?? 0) <= maxTier)
        .slice(0, 6),
    [d, spec, slow, haste, atkFreq, tree, maxTier],
  );
  const mods = useMemo(
    () =>
      collectMods(d, Object.fromEntries(Object.entries(levels).map(([k, v]) => [Number(k), v]))),
    [d, levels],
  );
  const used = Object.values(levels).reduce((a, v) => a + v, 0);
  const totalSp = jobs.jobLevels.at(-1)?.cumSp ?? 0;
  const tiers = [...new Set(tree?.nodes.map((n) => n.tier))].sort((a, b) => a - b);

  const setLevel = (n: SkillNode, lv: number) => {
    const next = { ...levels };
    if (lv <= 0) delete next[n.skill];
    else next[n.skill] = Math.min(n.max, lv);
    setLevels(next);
  };

  if (!tree)
    return (
      <p className="game-panel text-sm text-muted-foreground">No skill tree for this class.</p>
    );

  return (
    <div className="grid gap-block">
      <div className="flex flex-wrap items-end gap-x-block gap-y-4">
        <div className="grid w-[min(100%,18rem)] gap-1.5">
          <Label htmlFor={id}>Class build</Label>
          <SpecSelect id={id} value={spec} onChange={setSpec} />
        </div>
        <div className="grid w-[min(100%,14rem)] gap-1.5">
          <Label htmlFor={tierId}>Your job</Label>
          <Select value={String(maxTier)} onValueChange={(v) => setMaxTier(Number(v))}>
            <SelectTrigger id={tierId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {tiers
                .filter((t) => t > 0)
                .map((t) => (
                  <SelectItem key={t} value={String(t)}>
                    {jobs.tiers[t]}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" onClick={() => setLevels({})} disabled={!used}>
          <RotateCcw aria-hidden /> Reset points
        </Button>
        <span className="pb-2 text-sm text-muted-foreground">
          {mine
            ? `Saved with ${profile.name}.`
            : profile
              ? `Trying ${tree.name}; ${profile.name}'s own tree is kept.`
              : "Set up a character to keep these levels."}
        </span>
      </div>

      <div className="tiles-lead">
        <Stat
          lead
          label="Skill points spent"
          value={`${used} / ${totalSp}`}
          hint="One point per skill level; 160 by 3rd job level 50"
        />
        <Stat
          label="Damage rate"
          value={fixed(rate.total)}
          hint="Skill multiplier per second on one target"
        />
        <Stat
          label="Haste used"
          value={pct(haste)}
          hint={profile ? "From your character" : "Typical build"}
        />
      </div>

      {ranked.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Best next skill point</CardTitle>
            <CardDescription className="measure">
              Each option adds one level and re-runs the whole build, so passives that boost another
              skill count. One lone target, cooldowns at your Haste, normal attacks at your attack
              speed.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ol className="grid gap-2">
              {ranked.map((r, i) => {
                const s = d.skills[r.skill];
                return (
                  <li
                    key={r.skill}
                    className="grid grid-cols-[1.5rem_minmax(0,1fr)_auto] items-center gap-3 text-sm"
                  >
                    <span className="tabular text-muted-foreground">{i + 1}.</span>
                    <span className="truncate font-medium">
                      {s?.name}{" "}
                      <span className="text-muted-foreground">
                        Lv {r.from} → {r.from + 1}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "tabular font-semibold",
                        r.gain > 0.0005 ? "text-good" : "text-muted-foreground",
                      )}
                    >
                      {r.gain > 0.0005 ? `+${pct(r.gain)}` : "no damage"}
                    </span>
                  </li>
                );
              })}
            </ol>
          </CardContent>
        </Card>
      )}

      {tiers.map((tier) => (
        <section key={tier} className="grid gap-block">
          <SectionTitle>{jobs.tiers[tier] ?? `Tier ${tier}`}</SectionTitle>
          <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,19rem),1fr))] gap-block">
            {tree.nodes
              .filter((n) => n.tier === tier)
              .map((n) => {
                const s = d.skills[n.skill];
                if (!s) return null;
                const lv = levels[n.skill] ?? 0;
                const shown = s.lv[Math.max(1, lv) - 1];
                const ev =
                  s.spell !== 3 ? evalSkill(d, n.skill, lv ? mods : (shown?.mods ?? [])) : null;
                const cd =
                  s.spell === 2
                    ? skillCooldown(
                        skillCdUnder(d, n.skill, lv ? mods : (shown?.mods ?? [])),
                        haste,
                      )
                    : 0;
                const locked = n.front && (levels[n.front[0]] ?? 0) < n.front[1];
                return (
                  <li
                    key={n.node}
                    className={cn("game-panel grid content-start gap-3", !lv && "saturate-[0.6]")}
                  >
                    <div className="grid grid-cols-[2.75rem_minmax(0,1fr)] items-center gap-3">
                      <SkillIcon id={n.skill} name={s.name} />
                      <span className="grid min-w-0 gap-0.5">
                        <span className="truncate font-heading font-semibold">{s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {n.kind === 1 ? "Active" : "Passive"} · max {n.max}
                          {s.sp ? ` · ${s.sp} SP` : ""}
                        </span>
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-2">
                      <Button
                        size="icon"
                        variant="outline"
                        disabled={lv <= 0}
                        onClick={() => setLevel(n, lv - 1)}
                        aria-label={`One level less of ${s.name}`}
                      >
                        <Minus aria-hidden />
                      </Button>
                      <span className="tabular font-heading text-lg font-semibold">
                        Lv {lv} <span className="text-sm text-muted-foreground">/ {n.max}</span>
                      </span>
                      <Button
                        size="icon"
                        variant="secondary"
                        disabled={lv >= n.max || !!locked || n.tier > maxTier}
                        onClick={() => setLevel(n, lv + 1)}
                        aria-label={`One level more of ${s.name}`}
                      >
                        <Plus aria-hidden />
                      </Button>
                    </div>
                    {locked && n.front && (
                      <span className="text-xs text-warning">
                        Needs {d.skills[n.front[0]]?.name} level {n.front[1]}
                      </span>
                    )}
                    <p className="text-sm">{shown?.desc}</p>
                    <dl className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-x-3 gap-y-1 text-xs">
                      {ev && ev.coef > 0 && (
                        <>
                          <Fact k="Multiplier" v={`×${fixed(ev.coef)}`} />
                          <Fact k="Hits" v={fixed(ev.hits, ev.hits % 1 ? 1 : 0)} />
                          <Fact k="Targets" v={ev.targets === 0 ? "Area" : String(ev.targets)} />
                        </>
                      )}
                      {s.spell === 2 && cd > 0 && <Fact k="Cooldown" v={`${fixed(cd, 1)}s`} />}
                      {shown?.br ? <Fact k="Power" v={`+${fixed(shown.br, 3)}`} /> : null}
                    </dl>
                    {shown?.attrs && Object.keys(shown.attrs).length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        {Object.entries(shown.attrs)
                          .map(([k, v]) => attrLine(data.attrs, k, v))
                          .join(" · ")}
                      </p>
                    )}
                    {s.replaces && (
                      <p className="text-xs text-warning">
                        Learning it switches off the level effects of {d.skills[s.replaces]?.name}.
                      </p>
                    )}
                  </li>
                );
              })}
          </ul>
        </section>
      ))}
    </div>
  );
}

function Fact({ k, v }: { k: string; v: string }) {
  return (
    <div className="grid">
      <dt className="text-muted-foreground">{k}</dt>
      <dd className="tabular font-semibold">{v}</dd>
    </div>
  );
}

function JobChanges({ jobs }: { jobs: JobsData }) {
  return (
    <div className="grid gap-block">
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,17rem),1fr))] gap-block">
        {jobs.lines
          .filter((l) => l.jobs.length > 1)
          .map((l) => (
            <Card key={l.kind} size="sm">
              <CardHeader>
                <CardTitle>{l.name}</CardTitle>
              </CardHeader>
              <CardContent>
                <ol className="grid gap-1 text-sm">
                  {l.jobs.map((j) => (
                    <li key={j.career} className="flex justify-between gap-3">
                      <span className="font-medium">{j.name}</span>
                      <span className="text-muted-foreground">{j.tierName}</span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
      </div>
      {jobs.jobChange.map((c) => (
        <section key={c.toTier} className="grid gap-block">
          <SectionTitle
            aside={[
              c.baseLevel > 1 && `Base level ${c.baseLevel}`,
              c.stage && (
                <Link key="s" to={`/stages/${c.stage}`} className="underline underline-offset-2">
                  clear {c.stage}
                </Link>
              ),
            ]
              .filter(Boolean)
              .flatMap((x, i) => (i ? [" · ", x] : [x]))}
          >
            {jobs.tiers[c.fromTier]} → {jobs.tiers[c.toTier]}
          </SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-block">
            {c.groups.map((g) => (
              <Card key={g.id} size="sm">
                <CardHeader>
                  <CardTitle>{g.name}</CardTitle>
                  <CardDescription>{g.unlockText}</CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  <ul className="grid list-disc gap-1 pl-5">
                    {g.tasks.map((t) => (
                      <li key={t.id}>{t.text}</li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

function Levels({ jobs }: { jobs: JobsData }) {
  return (
    <div className="split-main items-start">
      <Card>
        <CardHeader>
          <CardTitle>Base levels</CardTitle>
          <CardDescription>
            EXP to the next level, attribute points and what each level opens.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Level</TableHead>
                <TableHead className="text-right">EXP to next</TableHead>
                <TableHead className="text-right">Points (total)</TableHead>
                <TableHead>Opens</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.baseLevels.map((l) => (
                <TableRow key={l.lv}>
                  <TableCell className="tabular font-medium">{l.lv}</TableCell>
                  <TableCell className="tabular text-right">
                    {l.exp ? full(l.exp) : "Max"}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    +{l.points} ({full(l.cumPoints)})
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal text-muted-foreground">
                    {l.unlocks?.map((u) => u.name).join(", ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle>Job levels</CardTitle>
          <CardDescription>One skill point per job level.</CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Job</TableHead>
                <TableHead className="text-right">Level</TableHead>
                <TableHead className="text-right">EXP to next</TableHead>
                <TableHead className="text-right">Skill points</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {jobs.jobLevels.map((l) => (
                <TableRow key={l.idx}>
                  <TableCell className="text-sm">{jobs.tiers[l.tier]}</TableCell>
                  <TableCell className="tabular text-right">{l.lv}</TableCell>
                  <TableCell className="tabular text-right">
                    {l.exp ? full(l.exp) : "Max"}
                  </TableCell>
                  <TableCell className="tabular text-right">{l.cumSp}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
