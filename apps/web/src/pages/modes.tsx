import { useId, useMemo, useState } from "react";
import { Link } from "react-router";
import { PageHeader, SectionTitle, Stat } from "@/components/page-header";
import { LoadingState } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { useModes } from "@/lib/game/extra-data";
import { capacity } from "@rogo/game/stage";
import { meanHit } from "@rogo/game/damage";
import {
  enemiesOf,
  threatAt,
  towerFloor,
  type DropRow,
  type ModeStage,
  type ModesData,
  type Unlock,
} from "@rogo/game/data/content";
import type { Profile } from "@rogo/game/profile";
import { full, pct, short } from "@/lib/format";
import { cn } from "@/lib/utils";

const base = import.meta.env.BASE_URL;
const CAMPAIGN_TIME = 40;
/** quality_txt_N in the text table: the grade names every system shares */
const GRADE = [
  "",
  "Normal",
  "Fine",
  "Excellent",
  "Epic",
  "Legendary",
  "Mythic",
  "Ancient",
  "Supreme",
  "Immortal",
  "Eternal",
];

/** Share of a mode fight's HP the character gets through, using the campaign capacity scaled by time. */
function progressOn(profile: Profile, cap: number, stage: ModeStage): number | null {
  if (stage.win === "damage" || !cap) return null;
  const enemies = enemiesOf(stage).filter((e) => stage.win === "killAll" || e.boss);
  let work = 0;
  for (const e of enemies) work += (e.count * e.hp) / meanHit(profile, e);
  const time = stage.time + (stage.extraTime ?? 0);
  return work ? Math.min(1, (cap * time) / CAMPAIGN_TIME / work) : null;
}

const hpOf = (stage: ModeStage) =>
  enemiesOf(stage)
    .filter((e) => stage.win === "killAll" || e.boss)
    .reduce((a, e) => a + e.count * e.hp, 0);

export default function ModesPage() {
  const modes = useModes();
  return (
    <>
      <PageHeader
        eyebrow="Progression"
        title="Game modes"
        actions={
          <Link className="underline" to="/daily">
            Check available attempts
          </Link>
        }
      >
        Every fight outside the campaign. Each one's enemies sit on the campaign's stat curve, so
        each is matched to the campaign stage with the same DEF, and run through the same clear
        model with your character.
      </PageHeader>
      {modes ? (
        <Tabs defaultValue="mvp" className="gap-block">
          <TabsList>
            <TabsTrigger value="mvp">MVP</TabsTrigger>
            <TabsTrigger value="tower">Endless Tower</TabsTrigger>
            <TabsTrigger value="realms">Realms</TabsTrigger>
            <TabsTrigger value="dungeons">Dungeons</TabsTrigger>
            <TabsTrigger value="boss">{modes.modes.worldBoss.name}</TabsTrigger>
            <TabsTrigger value="pvp">Arena and guild</TabsTrigger>
          </TabsList>
          <TabsContent value="mvp">
            <Mvp m={modes} />
          </TabsContent>
          <TabsContent value="tower">
            <Tower m={modes} />
          </TabsContent>
          <TabsContent value="realms">
            <Realms m={modes} />
          </TabsContent>
          <TabsContent value="dungeons">
            <Dungeons m={modes} />
          </TabsContent>
          <TabsContent value="boss">
            <WorldBoss m={modes} />
          </TabsContent>
          <TabsContent value="pvp">
            <Pvp m={modes} />
          </TabsContent>
        </Tabs>
      ) : (
        <LoadingState label="Loading game modes…" />
      )}
    </>
  );
}

function useCap() {
  const { stageById } = useGame();
  const { profile } = useProfile();
  return useMemo(
    () => (profile ? { profile, cap: capacity(profile, stageById) } : null),
    [profile, stageById],
  );
}

function Rewards({ m, rows, limit = 4 }: { m: ModesData; rows?: DropRow[]; limit?: number }) {
  if (!rows?.length) return <span className="text-muted-foreground">—</span>;
  const shown = rows.slice(0, limit);
  return (
    <span className="grid gap-0.5">
      {shown.map((r, i) => {
        const chance = r[2] ?? 1;
        return (
          <span key={i} className="tabular">
            {m.items[r[0]]?.name ?? r[0]} ×{full(r[1])}
            {chance < 1 && (
              <span className="text-muted-foreground"> · {pct(chance, chance < 0.01 ? 2 : 0)}</span>
            )}
          </span>
        );
      })}
      {rows.length > limit && (
        <span className="text-muted-foreground">+{rows.length - limit} more</span>
      )}
    </span>
  );
}

function UnlockLine({ u }: { u: Unlock }) {
  return (
    <p className="measure text-sm text-muted-foreground">
      {u.closed ? "Not open in this version." : u.text}
    </p>
  );
}

function StageTable({
  m,
  stages,
  label = "Stage",
  extra,
}: {
  m: ModesData;
  stages: ModeStage[];
  label?: string;
  extra?: { head: string; cell: (s: ModeStage) => React.ReactNode };
}) {
  const me = useCap();
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{label}</TableHead>
              <TableHead>Like campaign</TableHead>
              <TableHead className="text-right">HP to clear</TableHead>
              <TableHead className="text-right">Time</TableHead>
              {me && <TableHead className="text-right">Your progress</TableHead>}
              {extra && <TableHead>{extra.head}</TableHead>}
              <TableHead>Rewards</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {stages.map((s) => {
              const p = me ? progressOn(me.profile, me.cap, s) : null;
              return (
                <TableRow key={s.id}>
                  <TableCell className="font-medium">{s.name}</TableCell>
                  <TableCell className="tabular">
                    {s.tier ? (
                      <Link to={`/stages/${s.tier}`} className="underline underline-offset-2">
                        {s.tier}
                      </Link>
                    ) : (
                      "—"
                    )}
                  </TableCell>
                  <TableCell className="tabular text-right">
                    {s.win === "damage" ? "Score" : short(hpOf(s))}
                  </TableCell>
                  <TableCell className="tabular text-right">{s.time}s</TableCell>
                  {me && (
                    <TableCell
                      className={cn(
                        "tabular text-right",
                        p !== null && p >= 1 && "font-semibold text-good",
                      )}
                    >
                      {p === null ? "—" : p >= 1 ? "Clears" : pct(p, 0)}
                    </TableCell>
                  )}
                  {extra && (
                    <TableCell className="text-sm whitespace-normal">{extra.cell(s)}</TableCell>
                  )}
                  <TableCell className="text-sm whitespace-normal">
                    <Rewards
                      m={m}
                      rows={"repeat" in s && s.repeat?.length ? s.repeat : s.firstClear}
                    />
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Mvp({ m }: { m: ModesData }) {
  const mvp = m.modes.mvp;
  const [boss, setBoss] = useState(mvp.bosses[0]?.entry);
  const b = mvp.bosses.find((x) => x.entry === boss) ?? mvp.bosses[0];
  const id = useId();
  return (
    <div className="grid gap-block">
      <UnlockLine u={mvp.unlock} />
      <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,8.5rem),1fr))] gap-3">
        {mvp.bosses.map((x) => (
          <button
            key={x.entry}
            type="button"
            onClick={() => setBoss(x.entry)}
            aria-pressed={x.entry === b.entry}
            className={cn(
              "game-panel grid justify-items-center gap-1.5 text-center text-sm transition-[filter]",
              x.entry === b.entry ? "ring-2 ring-gold" : "saturate-[0.7] hover:saturate-100",
            )}
          >
            <img
              src={`${base}game/mvp/icon_mvp_${x.monster}.png`}
              alt=""
              width={64}
              height={64}
              className="size-16 object-contain"
              onError={(e) => (e.currentTarget.style.visibility = "hidden")}
            />
            <span className="font-heading font-semibold">{x.name}</span>
          </button>
        ))}
      </div>
      <label htmlFor={id} className="sr-only">
        MVP
      </label>
      <SectionTitle aside={`${b.dailySweeps} sweeps a day · ${b.unlock.text}`}>
        {b.name}
      </SectionTitle>
      <StageTable m={m} stages={b.stages} label="Difficulty" />
    </div>
  );
}

function Tower({ m }: { m: ModesData }) {
  const t = m.modes.endlessTower;
  const [floor, setFloor] = useState(1);
  const [today, setToday] = useState(0);
  const id = useId();
  const tid = useId();
  const marks = [1, 50, 100, 200, 300, 400, 500, 600, 800, 1000, 1200].filter(
    (f) => f <= t.floors.length,
  );
  const threat = threatAt(t, today);
  const picked = [...new Set([floor, ...marks])].sort((a, b) => a - b).map((f) => towerFloor(t, f));
  return (
    <div className="grid gap-block">
      <UnlockLine u={t.unlock} />
      <div className="tiles-lead">
        <Stat
          lead
          label="Floors"
          value={full(t.floors.length)}
          hint={`${t.dailyChallenges} climbs and ${t.dailyFreeSweeps} free sweeps a day`}
        />
        <Stat
          label={`Enemy stats after ${today} floors today`}
          value={`+${pct(threat[3], 0)}`}
          hint={t.threatTexts[threat[2]]?.replace("%{1}", String(today))}
        />
      </div>
      <div className="flex flex-wrap items-end gap-x-block gap-y-4">
        <div className="grid w-[min(100%,12rem)] gap-1.5">
          <Label htmlFor={id}>Floor</Label>
          <Input
            id={id}
            type="number"
            inputMode="numeric"
            min={1}
            max={t.floors.length}
            value={floor}
            onChange={(e) =>
              setFloor(
                Math.min(t.floors.length, Math.max(1, Math.floor(Number(e.target.value) || 1))),
              )
            }
          />
        </div>
        <div className="grid w-[min(100%,12rem)] gap-1.5">
          <Label htmlFor={tid}>Floors cleared today</Label>
          <Input
            id={tid}
            type="number"
            inputMode="numeric"
            min={0}
            max={50}
            value={today}
            onChange={(e) =>
              setToday(Math.min(50, Math.max(0, Math.floor(Number(e.target.value) || 0))))
            }
          />
        </div>
      </div>
      <p className="measure text-sm text-muted-foreground">
        Enemy stats climb with every floor you clear in a day, so a long run gets much harder than
        its first floors. The table shows each floor fresh.
      </p>
      <StageTable m={m} stages={picked} label="Floor" />
    </div>
  );
}

function Realms({ m }: { m: ModesData }) {
  const r = m.modes.resInstances;
  const [cat, setCat] = useState(String(r.categories[0]?.category));
  const id = useId();
  const c = r.categories.find((x) => String(x.category) === cat) ?? r.categories[0];
  return (
    <div className="grid gap-block">
      <div className="grid w-[min(100%,18rem)] gap-1.5">
        <Label htmlFor={id}>Realm</Label>
        <Select value={cat} onValueChange={setCat}>
          <SelectTrigger id={id} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {r.categories.map((x) => (
              <SelectItem key={x.category} value={String(x.category)}>
                {x.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <UnlockLine u={c.unlock} />
      <p className="text-sm text-muted-foreground">
        Ticket: {m.items[c.ticket.item]?.name ?? c.ticket.item}, {c.ticket.dailyRestore} a day
        (holds up to {c.ticket.restoreCap}).
      </p>
      <StageTable m={m} stages={c.stages} label="Difficulty" />
    </div>
  );
}

function Dungeons({ m }: { m: ModesData }) {
  const t = m.modes.teamPve;
  return (
    <div className="grid gap-block">
      <UnlockLine u={t.unlock} />
      <p className="text-sm text-muted-foreground">
        {t.dailyClears} clears and {t.dailyAssists} assists a day. Dungeons drop the Necklace and
        Ring.
      </p>
      <StageTable
        m={m}
        stages={t.stages}
        extra={{
          head: "Accessory grade odds",
          cell: (s) =>
            "accessoryQuality" in s
              ? (s as (typeof t.stages)[number]).accessoryQuality
                  .map(([q, p]) => `${GRADE[q] ?? q} ${pct(p, p < 0.01 ? 2 : 0)}`)
                  .join(" · ")
              : "—",
        }}
      />
    </div>
  );
}

function WorldBoss({ m }: { m: ModesData }) {
  const w = m.modes.worldBoss;
  return (
    <div className="grid gap-block">
      <UnlockLine u={w.unlock} />
      <StageTable m={m} stages={w.stages} label="Difficulty" />
      <section className="grid gap-block">
        <SectionTitle>Ranking rewards</SectionTitle>
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Tier</TableHead>
                  <TableHead className="text-right">Score from</TableHead>
                  <TableHead>Daily</TableHead>
                  <TableHead>Weekly</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {w.tiers.map((t) => (
                  <TableRow key={t.entry}>
                    <TableCell className="font-medium">{t.name}</TableCell>
                    <TableCell className="tabular text-right">{full(t.minScore)}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <Rewards m={m} rows={t.daily} />
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <Rewards m={m} rows={t.weekly} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Pvp({ m }: { m: ModesData }) {
  const { arena, gvg, guildBoss } = m.modes;
  return (
    <div className="grid gap-block">
      {[
        { name: arena.name, unlock: arena.unlock, rules: arena.rules, tiers: arena.tiers },
        { name: gvg.name, unlock: gvg.unlock, rules: gvg.rules, tiers: gvg.tiers },
        {
          name: guildBoss.name,
          unlock: guildBoss.unlock,
          rules: guildBoss.rules,
          tiers: guildBoss.tiers,
        },
      ].map((x) => (
        <Card key={x.name}>
          <CardHeader>
            <CardTitle>{x.name}</CardTitle>
            <CardDescription>
              {x.unlock.closed ? "Not open in this version." : x.unlock.text}
            </CardDescription>
          </CardHeader>
          <CardContent className="split-main items-start">
            <p className="measure text-sm whitespace-pre-line text-muted-foreground">{x.rules}</p>
            {x.tiers?.length ? (
              <ul className="grid content-start gap-1 text-sm">
                {(x.tiers as { name: string; minScore?: number }[]).map((t, i) => (
                  <li key={i} className="tabular flex justify-between gap-3">
                    <span className="font-medium">{t.name}</span>
                    {t.minScore !== undefined && (
                      <span className="text-muted-foreground">{full(t.minScore)}+</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : null}
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
