import { Link, useParams } from "react-router";
import { ChevronLeft, ChevronRight, Clock, Crown, Skull } from "lucide-react";
import { Banner, MonsterBadge } from "@/components/game-icon";
import { Stat } from "@/components/page-header";
import { BossPanel } from "@/components/boss-panel";
import { StageRewards } from "@/components/stage-rewards";
import { ErrorState } from "@/components/states";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGame } from "@/lib/game/game-data-context";
import { useProfile } from "@/lib/game/profile-context";
import { REFERENCE } from "@rogo/game/reference";
import { stageName } from "@/lib/game/data";
import { hit } from "@rogo/game/damage";
import { bossOf, capacity, enemyHp, neededScale } from "@rogo/game/stage";
import { full, mult, pct, short } from "@/lib/format";

// scene backgrounds from the game's UI atlases, picked per chapter for variety
const BANNERS = [
  "bg_atlas_prrx3g",
  "bg_atlas_qccx6sfkg",
  "bg_atlas_nqhd2m",
  "bg_atlas_prrx3e",
  "bg_atlas_o2sd3j",
  "bg_atlas_qccx6sfkh",
  "bg_atlas_prrx3h",
  "bg_atlas_u2cf3b",
];

export default function StagePage() {
  const { id = "" } = useParams();
  const { data, stageById, estimateById } = useGame();
  const { profile } = useProfile();
  const stage = stageById.get(id);
  if (!stage)
    return <ErrorState message={`There's no stage ${id}. Stages run from 1-1 to 79-12.`} />;

  const idx = data.stages.indexOf(stage);
  const prev = data.stages[idx - 1];
  const next = data.stages[idx + 1];
  const est = estimateById.get(id)!;
  const boss = bossOf(stage);
  // without a character the numbers are for the reference build that calibrates the model
  const who = profile ?? REFERENCE;
  const cap = capacity(who, stageById);
  const g = neededScale(who, stage, cap);
  const atkKey = who.damage === "physical" ? "patk" : "matk";
  const bossHit = profile && boss ? hit(profile, boss) : null;

  return (
    <>
      <Banner image={BANNERS[stage.chapter % BANNERS.length]}>
        <div className="grid gap-3 p-[clamp(1.25rem,4vw,3rem)] text-white">
          <span className="text-sm text-white/80">
            Chapter {stage.chapter} · {data.chapters[stage.chapter]}
          </span>
          <h1 className="text-[clamp(1.75rem,3.6vw,2.75rem)] leading-tight font-semibold">
            {stageName(data, stage.id)}
          </h1>
          <div className="flex flex-wrap gap-2 text-sm">
            <Badge
              variant="outline"
              className="min-h-7 border-white/30 bg-white/15 px-2.5 text-white backdrop-blur"
            >
              <Clock aria-hidden /> {stage.time}s
            </Badge>
            {stage.chapterBoss && (
              <Badge variant="outline" className="min-h-7 border-gold bg-gold px-2.5 text-black">
                <Crown aria-hidden /> Chapter boss
              </Badge>
            )}
            <Badge
              variant="outline"
              className="min-h-7 border-white/30 bg-white/15 px-2.5 text-white backdrop-blur"
            >
              <Skull aria-hidden /> {stage.enemies.reduce((a, e) => a + e.count, 0)} enemies, up to{" "}
              {stage.maxOnField} at once
            </Badge>
          </div>
        </div>
      </Banner>

      <div>
        <Button variant="outline" asChild>
          <Link to="/operations?action=campaign">Retry your current campaign boss</Link>
        </Button>
      </div>
      <div className="tiles-lead">
        <Stat
          lead
          label="Power to clear"
          value={short(est.power)}
          hint={
            profile
              ? est.power <= profile.power
                ? "Within your power"
                : `${pct(est.power / profile.power - 1, 0)} above yours`
              : "For a typical build; add your character for your own"
          }
        />
        {profile ? (
          <Stat
            label="Your progress"
            value={est.progress >= 1 ? "Clears" : pct(est.progress, 0)}
            hint="Share of enemy HP you get through in time"
          />
        ) : (
          <Stat label="Total enemy HP" value={short(enemyHp(stage))} />
        )}
        <Stat
          label={`${atkKey === "patk" ? "PATK" : "MATK"} needed`}
          value={short(who.stats[atkKey] * g)}
          hint={
            profile ? `if only flat stats grow (×${g.toFixed(2)})` : "for the same typical build"
          }
        />
      </div>

      {boss && <BossPanel boss={boss} stage={stage} />}

      <Card>
        <CardHeader>
          <CardTitle>Enemies</CardTitle>
          <CardDescription>
            The wave spawns over the first{" "}
            {Math.max(...stage.enemies.map((e) => (e.boss ? 0 : e.spawnOver)), 0)}s; the boss group
            arrives at{" "}
            {Math.min(...stage.enemies.filter((e) => e.boss).map((e) => e.spawnAt), stage.time)}s.
            {profile && " Your hits use your current stats."}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Monster</TableHead>
                <TableHead className="text-right">Count</TableHead>
                <TableHead className="text-right">HP</TableHead>
                <TableHead className="text-right">ATK</TableHead>
                <TableHead className="text-right">PDEF / MDEF</TableHead>
                <TableHead className="text-right">DMG RED</TableHead>
                <TableHead className="text-right">FLEE</TableHead>
                {profile && <TableHead className="text-right">Your hit</TableHead>}
                {profile && <TableHead className="text-right">Hits to kill</TableHead>}
              </TableRow>
            </TableHeader>
            <TableBody>
              {stage.enemies.map((e, i) => {
                const m = data.monsters[e.id];
                const h = profile ? hit(profile, e) : null;
                const mean = h ? (h.normal + h.skill) / 2 : 0;
                return (
                  <TableRow key={i}>
                    <TableCell>
                      <div className="flex items-center gap-2.5">
                        <MonsterBadge id={e.id} name={m?.name ?? "?"} boss={e.boss} />
                        <div className="grid leading-tight">
                          <span className="font-medium">{m?.name ?? e.id}</span>
                          <span className="text-xs text-muted-foreground">
                            {e.boss
                              ? `${e.hpBar ? "Boss" : "Boss group"}, at ${e.spawnAt}s`
                              : "Wave"}
                          </span>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell className="tabular text-right">{e.count}</TableCell>
                    <TableCell className="tabular text-right">{short(e.hp)}</TableCell>
                    <TableCell className="tabular text-right">{short(e.patk)}</TableCell>
                    <TableCell className="tabular text-right">
                      {short(e.pdef)} / {short(e.mdef)}
                    </TableCell>
                    <TableCell className="tabular text-right">{pct(e.dmgRed)}</TableCell>
                    <TableCell className="tabular text-right">{e.flee.toFixed(0)}</TableCell>
                    {h && <TableCell className="tabular text-right">{short(mean)}</TableCell>}
                    {h && (
                      <TableCell className="tabular text-right">
                        {full(Math.ceil(e.hp / mean))}
                      </TableCell>
                    )}
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {profile && boss && bossHit && (
        <Card>
          <CardHeader>
            <CardTitle>Your hit on {data.monsters[boss.id]?.name}</CardTitle>
            <CardDescription>
              Each layer of the game's damage formula, before crit and skill multipliers.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <Layer
              label="Base"
              formula={`ATK² ÷ (ATK + 2 × DEF) + refine ATK = ${short(profile.stats[atkKey])}² ÷ (${short(profile.stats[atkKey])} + 2 × ${short(profile.damage === "physical" ? boss.pdef : boss.mdef)}) + ${short(profile.damage === "physical" ? profile.stats.refinePatk : profile.stats.refineMatk)}`}
              value={short(bossHit.base)}
            />
            <Layer
              label="Damage modifier, normal attack"
              formula={`your boosts ${pct(bossHit.incNormal)} vs their DMG RED ${pct(bossHit.red)}`}
              value={mult(bossHit.innerNormal)}
            />
            <Layer
              label="Damage modifier, skill"
              formula={`your boosts ${pct(bossHit.incSkill)} vs their DMG RED ${pct(bossHit.red)}`}
              value={mult(bossHit.innerSkill)}
            />
            <Layer
              label="Final modifier"
              formula={`Final DMG Boost vs their Final DMG Reduction ${pct(boss.finalRed)}`}
              value={mult(bossHit.final)}
            />
            <Layer
              label="Normal hit / skill hit (×1.0)"
              formula="base × modifiers"
              value={`${short(bossHit.normal)} / ${short(bossHit.skill)}`}
              strong
            />
          </CardContent>
        </Card>
      )}

      <StageRewards id={stage.id} />

      <nav className="flex flex-wrap justify-between gap-3" aria-label="Neighbouring stages">
        {prev ? (
          <Button variant="outline" asChild>
            <Link to={`/stages/${prev.id}`}>
              <ChevronLeft aria-hidden /> {prev.id}
            </Link>
          </Button>
        ) : (
          <span />
        )}
        {next && (
          <Button variant="outline" asChild>
            <Link to={`/stages/${next.id}`}>
              {next.id} <ChevronRight aria-hidden />
            </Link>
          </Button>
        )}
      </nav>
    </>
  );
}

function Layer({
  label,
  formula,
  value,
  strong,
}: {
  label: string;
  formula: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b pb-3 last:border-0 last:pb-0">
      <div className="grid gap-0.5">
        <span className={strong ? "font-semibold" : "font-medium"}>{label}</span>
        <span className="tabular text-xs text-muted-foreground">{formula}</span>
      </div>
      <span className={`tabular ${strong ? "text-lg font-semibold" : ""}`}>{value}</span>
    </div>
  );
}
