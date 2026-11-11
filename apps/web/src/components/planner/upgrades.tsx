import { useMemo } from "react";
import { Bar, BarChart, CartesianGrid, LabelList, XAxis, YAxis } from "recharts";
import { Stat } from "@/components/page-header";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useGame } from "@/lib/game/game-data-context";
import { useCharacter } from "@/lib/game/profile-context";
import { capacity } from "@rogo/game/stage";
import { rankUpgrades } from "@rogo/game/planner";
import { pct } from "@/lib/format";
import type { Stage } from "@rogo/game/types";

const config = {
  damage: { label: "More damage on this stage", color: "var(--chart-1)" },
} satisfies ChartConfig;

export function UpgradesPanel({ stage }: { stage: Stage }) {
  const { data, estimateById, stageById } = useGame();
  const profile = useCharacter();
  const cap = capacity(profile, stageById);
  const ranked = useMemo(
    () => rankUpgrades(profile, stage, cap, data.battleRate),
    [profile, stage, cap, data.battleRate],
  );
  const best = ranked[0];
  // the upgrade that buys the most damage for the least power: what the power number undervalues
  const hidden = ranked
    .filter((r) => r.damageGain > 0.005)
    .sort(
      (a, b) =>
        b.damageGain / Math.max(b.powerGain, 1e-4) - a.damageGain / Math.max(a.powerGain, 1e-4),
    )[0];
  const progress = estimateById.get(stage.id)?.progress ?? 0;
  const chartData = ranked.map((r) => ({
    label: r.upgrade.label,
    damage: +(r.damageGain * 100).toFixed(1),
  }));

  return (
    <div className="grid gap-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat
          label="Best single upgrade here"
          value={best.upgrade.label}
          hint={`${pct(best.damageGain)} more damage`}
        />
        <Stat
          label="Most damage per power"
          value={hidden?.upgrade.label ?? "–"}
          hint={
            hidden
              ? `${pct(hidden.damageGain)} damage for ${pct(hidden.powerGain)} power`
              : undefined
          }
        />
        <Stat
          label="Your progress on this stage"
          value={progress >= 1 ? "Clears" : pct(progress, 0)}
        />
      </div>

      <Card>
        <CardHeader>
          <CardTitle>More damage on {stage.id}, by upgrade</CardTitle>
          <CardDescription>Percent more damage dealt to this stage's enemies.</CardDescription>
        </CardHeader>
        <CardContent>
          <ChartContainer config={config} className="aspect-auto h-80 w-full">
            <BarChart data={chartData} layout="vertical" margin={{ left: 8, right: 48 }}>
              <CartesianGrid horizontal={false} strokeOpacity={0.5} />
              <XAxis
                type="number"
                tickFormatter={(v) => `${v}%`}
                tickLine={false}
                axisLine={false}
                fontSize={11}
              />
              <YAxis
                type="category"
                dataKey="label"
                width={210}
                tickLine={false}
                axisLine={false}
                fontSize={12}
              />
              <ChartTooltip
                cursor={{ fillOpacity: 0.15 }}
                content={({ active, payload }) =>
                  active && payload?.[0] ? (
                    <div className="rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                      <span className="font-medium">{payload[0].payload.label}</span>
                      <div className="tabular text-muted-foreground">
                        <span className="text-foreground">{payload[0].payload.damage}%</span> more
                        damage
                      </div>
                    </div>
                  ) : null
                }
              />
              <Bar
                dataKey="damage"
                fill="var(--color-damage)"
                radius={[0, 4, 4, 0]}
                isAnimationActive={false}
              >
                <LabelList
                  dataKey="damage"
                  position="right"
                  formatter={(v) => `${String(v)}%`}
                  fontSize={11}
                  className="fill-muted-foreground"
                />
              </Bar>
            </BarChart>
          </ChartContainer>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Damage versus power</CardTitle>
          <CardDescription>
            Power and damage don't move together: some upgrades raise the power number a lot and
            barely change a fight, others do the opposite.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Upgrade</TableHead>
                <TableHead>Where it comes from</TableHead>
                <TableHead className="text-right">More damage</TableHead>
                <TableHead className="text-right">More power</TableHead>
                <TableHead className="text-right">Progress after</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {ranked.map((r) => (
                <TableRow key={r.upgrade.id}>
                  <TableCell className="font-medium">{r.upgrade.label}</TableCell>
                  <TableCell className="text-muted-foreground">{r.upgrade.detail}</TableCell>
                  <TableCell className="tabular text-right">{pct(r.damageGain)}</TableCell>
                  <TableCell className="tabular text-right">{pct(r.powerGain)}</TableCell>
                  <TableCell className={`tabular text-right ${r.progress >= 1 ? "text-good" : ""}`}>
                    {r.progress >= 1 ? "Clears" : pct(r.progress, 0)}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
