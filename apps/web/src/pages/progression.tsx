import { useMemo, useState } from "react";
import { useNavigate, Link } from "react-router";
import { Crown } from "lucide-react";
import { PageHeader, Stat } from "@/components/page-header";
import { PowerChart, type PowerPoint } from "@/components/power-chart";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Label } from "@/components/ui/label";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useGame } from "@/lib/game/game-data-context";
import { useProfile } from "@/lib/game/profile-context";
import { stageName } from "@/lib/game/data";
import { bossOf, furthestClear } from "@rogo/game/stage";
import { short, pct } from "@/lib/format";

const BASIS: Record<string, string> = {
  anchored: "Near your own progress",
  interpolated: "Between your progress and real clears",
  fit: "Backed by real clears",
  extrapolated: "Extrapolated, no clears this far yet",
};

export default function ProgressionPage() {
  const { data, estimates, estimateById } = useGame();
  const { profile } = useProfile();
  const navigate = useNavigate();
  const power = profile?.power ?? 0;
  const furthest = profile ? furthestClear(estimates, power) : undefined;
  const next = profile ? estimates.find((e) => e.power > power) : undefined;
  const [chapter, setChapter] = useState(() => String(next ? next.id.split("-")[0] : 1));

  const [range, setRange] = useState<"near" | "all">("near");
  // "near" is the next few chapters from where you are; without a character, the chapters real
  // clears back (up to 10) and a little past
  const lastChapter =
    range === "all"
      ? Infinity
      : profile
        ? Number((next ?? estimates[estimates.length - 1]).id.split("-")[0]) + 6
        : 14;
  const points: PowerPoint[] = useMemo(
    () =>
      estimates
        .map((e, i) => {
          const s = data.stages[i];
          const extrapolated = e.basis === "extrapolated";
          // the dashed line starts on the last backed point so the two join
          const joins = !extrapolated && estimates[i + 1]?.basis === "extrapolated";
          return {
            i,
            id: e.id,
            label: stageName(data, e.id),
            value: e.power,
            power: extrapolated ? null : e.power,
            extra: extrapolated || joins ? e.power : null,
            boss: s.chapterBoss ? e.power : null,
          };
        })
        .filter((p) => Number(p.id.split("-")[0]) <= lastChapter),
    [estimates, data, lastChapter],
  );

  // the biggest jumps in needed power over the next three chapters: the walls
  const walls = useMemo(() => {
    const start = profile ? estimates.findIndex((e) => e.power > power) : 0;
    if (start < 0) return [];
    const horizon = Number(estimates[start].id.split("-")[0]) + 2;
    const jumps = [];
    for (let i = Math.max(1, start); i < estimates.length; i++) {
      const e = estimates[i];
      if (Number(e.id.split("-")[0]) > horizon) break;
      jumps.push({ e, jump: e.power / estimates[i - 1].power });
    }
    return jumps
      .sort((a, b) => b.jump - a.jump)
      .slice(0, 5)
      .sort((a, b) => a.e.power - b.e.power);
  }, [estimates, power, profile]);

  const chapterStages = data.stages.filter((s) => String(s.chapter) === chapter);
  const chapters = Object.entries(data.chapters).sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <>
      <PageHeader title="Stage progression">
        Estimated power to clear each of the {data.stages.length} campaign stages. The game has no
        power gate: every stage is a 40-second fight against fixed monster stats, so the estimate
        comes from the game's damage formula, calibrated on real fights.
      </PageHeader>

      {profile ? (
        <div className="tiles-lead">
          <Stat lead label="Your power" value={short(power)} hint={profile.name} />
          <Stat
            label="Furthest stage these stats clear"
            value={furthest ? stageName(data, furthest.id) : "–"}
            hint={furthest ? `needs about ${short(furthest.power)}` : undefined}
          />
          <Stat
            label="Next stage"
            value={next ? stageName(data, next.id) : "All clear"}
            hint={
              next
                ? `about ${short(next.power)}, ${pct(next.power / power - 1, 0)} more power`
                : undefined
            }
          />
        </div>
      ) : (
        <div className="tiles-lead">
          <Stat
            lead
            label="Backed by real clears"
            value="Chapters 6–10"
            hint="Earlier stages scale down from there; chapter 11 onward is extrapolated."
          />
          <Stat label="Stages" value={data.stages.length} />
          <Stat label="Time per fight" value="40 s" hint="Boss group at 20 s" />
        </div>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-3">
          <div className="grid gap-1.5">
            <CardTitle>Power to clear, by stage</CardTitle>
            <CardDescription>
              Log scale. Orange dots are chapter bosses; the dashed part is extrapolated past any
              real clear. Click the line to open a stage.
            </CardDescription>
          </div>
          <ToggleGroup
            type="single"
            variant="outline"
            size="sm"
            value={range}
            onValueChange={(v) => v && setRange(v as "near" | "all")}
          >
            <ToggleGroupItem value="near">{profile ? "Near you" : "Chapters 1–14"}</ToggleGroupItem>
            <ToggleGroupItem value="all">All chapters</ToggleGroupItem>
          </ToggleGroup>
        </CardHeader>
        <CardContent>
          <PowerChart
            points={points}
            yours={profile?.power}
            onPick={(id) => navigate(`/stages/${id}`)}
          />
        </CardContent>
      </Card>

      {walls.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Walls ahead</CardTitle>
            <CardDescription>
              The biggest jumps in needed power over the next three chapters.
            </CardDescription>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {walls.map(({ e, jump }) => (
              <Link
                key={e.id}
                to={`/stages/${e.id}`}
                className="rounded-lg border bg-secondary/60 px-3 py-2 text-sm transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                <span className="font-medium">{stageName(data, e.id)}</span>
                <span className="tabular ml-2 text-muted-foreground">
                  {short(e.power)} · +{pct(jump - 1, 0)}
                </span>
              </Link>
            ))}
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader className="flex flex-row flex-wrap items-end justify-between gap-3">
          <div className="grid gap-1.5">
            <CardTitle>Stages in a chapter</CardTitle>
            <CardDescription>
              Progress is the share of enemy HP your current stats get through in time.
            </CardDescription>
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor="chapter">Chapter</Label>
            <Select value={chapter} onValueChange={setChapter}>
              <SelectTrigger id="chapter" className="w-56">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {chapters.map(([c, name]) => (
                  <SelectItem key={c} value={c}>
                    {c}. {name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Stage</TableHead>
                <TableHead>Boss</TableHead>
                <TableHead className="text-right">Enemy HP</TableHead>
                <TableHead className="text-right">DMG RED</TableHead>
                <TableHead className="text-right">Power to clear</TableHead>
                <TableHead className="w-40">Your progress</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {chapterStages.map((s) => {
                const est = estimateById.get(s.id)!;
                const boss = bossOf(s);
                const hp = s.enemies.reduce((a, e) => a + e.count * e.hp, 0);
                const clears = est.progress >= 1;
                return (
                  <TableRow
                    key={s.id}
                    className="cursor-pointer"
                    onClick={() => navigate(`/stages/${s.id}`)}
                  >
                    <TableCell className="font-medium">
                      <Link
                        to={`/stages/${s.id}`}
                        className="hover:underline"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {s.id}
                      </Link>
                      {s.chapterBoss && (
                        <Badge variant="secondary" className="ml-2">
                          <Crown aria-hidden /> Chapter boss
                        </Badge>
                      )}
                    </TableCell>
                    <TableCell>
                      {boss ? data.monsters[boss.id]?.name : "–"}
                      {boss && boss.count > 1 && (
                        <span className="text-muted-foreground"> ×{boss.count}</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">{short(hp)}</TableCell>
                    <TableCell className="tabular text-right">
                      {boss ? pct(boss.dmgRed, 1) : "–"}
                    </TableCell>
                    <TableCell className="tabular text-right" title={BASIS[est.basis]}>
                      {short(est.power)}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Progress
                          value={est.progress * 100}
                          className="h-1.5"
                          aria-label={`Progress on ${s.id}`}
                        />
                        <span
                          className={`tabular w-10 text-right text-xs ${clears ? "text-good" : "text-muted-foreground"}`}
                        >
                          {clears ? "Clear" : pct(est.progress, 0)}
                        </span>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </>
  );
}
