import { useMemo, useState } from "react";
import { CartesianGrid, Line, LineChart, ReferenceLine, XAxis, YAxis } from "recharts";
import { PageHeader } from "@/components/page-header";
import { SpecIcon } from "@/components/game-icon";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ChartContainer, ChartTooltip, type ChartConfig } from "@/components/ui/chart";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { useGame } from "@/lib/game/game-data-context";
import { useProfile } from "@/lib/game/profile-context";
import { REFERENCE } from "@rogo/game/reference";
import { baseHurt, condDmgMod } from "@rogo/game/damage";
import { POWER_ATTRS } from "@rogo/game/power";
import { SPECS } from "@rogo/game/classes";
import { DRIFT } from "@rogo/game/stage";
import { fixed, mult, pct, short } from "@/lib/format";

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="rounded bg-secondary px-1.5 py-0.5 font-mono text-[0.8125rem]">
      {children}
    </code>
  );
}

function Formula({ children }: { children: React.ReactNode }) {
  return (
    <div className="tabular overflow-x-auto rounded-lg border bg-secondary/50 px-4 py-3 font-mono text-sm">
      {children}
    </div>
  );
}

const baseConfig = {
  share: { label: "Base damage ÷ ATK", color: "var(--chart-1)" },
} satisfies ChartConfig;
const modConfig = {
  mod: { label: "Damage modifier", color: "var(--chart-1)" },
} satisfies ChartConfig;

export default function FormulasPage() {
  const { data } = useGame();
  const profile = useProfile().profile ?? REFERENCE;
  const [atk, setAtk] = useState(profile.stats.patk);
  const [def, setDef] = useState(50_000);
  const [red, setRed] = useState(0.86);
  const [spec, setSpec] = useState(String(profile.spec));

  const baseCurve = useMemo(
    () =>
      Array.from({ length: 41 }, (_, i) => {
        const ratio = i * 0.1; // DEF / ATK
        // evaluated at a realistic ATK: the formula floors a hit at 1
        return {
          ratio: +ratio.toFixed(1),
          share: +((baseHurt(1e6, ratio * 1e6, 0, 0, 0) / 1e6) * 100).toFixed(1),
        };
      }),
    [],
  );
  const modCurve = useMemo(
    () =>
      Array.from({ length: 61 }, (_, i) => {
        const inc = i * 0.05;
        return {
          inc: +(inc * 100).toFixed(0),
          mod: +condDmgMod(0.2, 3, 0.15, inc, red).toFixed(3),
        };
      }),
    [red],
  );
  const powerRows = data.battleRate.filter((r) => r.layer > 0);

  return (
    <>
      <PageHeader title="Formulas">
        Read from the game's own code (<Code>Cross.dll</Code>, decompiled) and config tables, then
        checked against a live fight: the predicted normal hit on a 6-10 mob was 100.1K, the game
        showed 101.5K.
      </PageHeader>

      <div className="grid gap-6">
        <Card>
          <CardHeader>
            <CardTitle>1. Damage per hit</CardTitle>
            <CardDescription>
              <Code>FightFormulaTemplate.EDHurt</Code> multiplies these layers; the stage table only
              sets the enemy side.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Formula>
              hit = base × inner × final × (1 + vulnerability) × (1 + in-fight boosts) × (1 + QTE) ×
              (1 + stage boosts) ÷ (1 + stage reduction)
            </Formula>
            <Formula>
              base = max(1, ATK² ÷ (ATK + 2 × DEF × (1 − penetration)) + (refine ATK − refine DEF))
            </Formula>
            <p className="max-w-[65ch] text-sm text-muted-foreground">
              Physical damage uses PATK against PDEF, magic uses MATK against MDEF. Refine ATK is
              added flat after the DEF division, so it never loses value to DEF: on a 6-10 mob your
              refine PATK is about a tenth of the hit. Crit (×CRIT DMG) and each skill's multiplier
              apply on top.
            </p>
            <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
              <ChartContainer config={baseConfig} className="aspect-auto h-56 w-full">
                <LineChart data={baseCurve} margin={{ top: 8, right: 12, left: 0, bottom: 12 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.5} />
                  <XAxis
                    dataKey="ratio"
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    label={{
                      value: "enemy DEF ÷ your ATK",
                      position: "insideBottom",
                      offset: -8,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    tickFormatter={(v) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                    width={44}
                    fontSize={11}
                    domain={[0, 100]}
                  />
                  <ChartTooltip
                    content={({ active, payload }) =>
                      active && payload?.[0] ? (
                        <div className="tabular rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                          DEF {payload[0].payload.ratio}× your ATK: base hit is{" "}
                          {payload[0].payload.share}% of ATK
                        </div>
                      ) : null
                    }
                  />
                  <ReferenceLine
                    x={+Math.min(4, def / atk).toFixed(1)}
                    stroke="var(--chart-2)"
                    strokeDasharray="4 4"
                  />
                  <Line
                    dataKey="share"
                    stroke="var(--color-share)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>
              <div className="grid content-start gap-5">
                <div className="grid gap-2.5">
                  <Label>Your ATK: {short(atk)}</Label>
                  <Slider
                    min={1000}
                    max={2_000_000}
                    step={1000}
                    value={[atk]}
                    onValueChange={([v]) => setAtk(v)}
                    aria-label="Your ATK"
                  />
                </div>
                <div className="grid gap-2.5">
                  <Label>Enemy DEF: {short(def)}</Label>
                  <Slider
                    min={0}
                    max={1_500_000}
                    step={1000}
                    value={[def]}
                    onValueChange={([v]) => setDef(v)}
                    aria-label="Enemy DEF"
                  />
                </div>
                <div className="tabular rounded-lg bg-secondary/60 p-3 text-sm">
                  Base hit{" "}
                  <span className="font-semibold">{short(baseHurt(atk, def, 0, 0, 0))}</span>,{" "}
                  {pct(baseHurt(atk, def, 0, 0, 0) / atk, 0)} of ATK
                </div>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>2. Damage modifier: your boosts against their DMG RED</CardTitle>
            <CardDescription>
              <Code>CondDmgMod</Code>, the "inner" layer. It is why chapter 10 onward feels like a
              wall: bosses there carry more than 100% DMG RED.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Formula>
              d = your boosts − their DMG RED &nbsp;·&nbsp; modifier = 1 + d if d ≥ 0, else 1 ÷ (1 −
              d)
            </Formula>
            <p className="max-w-[65ch] text-sm text-muted-foreground">
              Your boosts here are DMG Boost + Normal Attack (or Skill) DMG Boost + Physical (or
              Magic) DMG Boost + Boss or Normal Monster DMG UP. Once your boosts and their reduction
              add up past 300%, the difference counts less and less (it fades by e
              <sup className="text-[0.65em]">−0.15 × excess</sup> down to 20%). The final layer
              works the same way with Final DMG Boost against Final DMG Reduction, fading past 100%.
            </p>
            <div className="grid gap-6 md:grid-cols-[1fr_16rem]">
              <ChartContainer config={modConfig} className="aspect-auto h-56 w-full">
                <LineChart data={modCurve} margin={{ top: 8, right: 12, left: 0, bottom: 12 }}>
                  <CartesianGrid vertical={false} strokeOpacity={0.5} />
                  <XAxis
                    dataKey="inc"
                    tickFormatter={(v) => `${v}%`}
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    label={{
                      value: "your boosts",
                      position: "insideBottom",
                      offset: -8,
                      fontSize: 11,
                    }}
                  />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    width={36}
                    fontSize={11}
                    tickFormatter={(v) => `×${v}`}
                  />
                  <ChartTooltip
                    content={({ active, payload }) =>
                      active && payload?.[0] ? (
                        <div className="tabular rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
                          Boosts {payload[0].payload.inc}%: damage ×{payload[0].payload.mod}
                        </div>
                      ) : null
                    }
                  />
                  <ReferenceLine y={1} stroke="var(--muted-foreground)" strokeDasharray="4 4" />
                  <Line
                    dataKey="mod"
                    stroke="var(--color-mod)"
                    strokeWidth={2}
                    dot={false}
                    isAnimationActive={false}
                  />
                </LineChart>
              </ChartContainer>
              <div className="grid content-start gap-4">
                <div className="grid gap-2.5">
                  <Label>Their DMG RED: {pct(red, 0)}</Label>
                  <Slider
                    min={0}
                    max={2}
                    step={0.01}
                    value={[red]}
                    onValueChange={([v]) => setRed(v)}
                    aria-label="Enemy DMG RED"
                  />
                </div>
                <Table>
                  <TableBody>
                    {[0.3, 0.6, 1, 1.5].map((inc) => (
                      <TableRow key={inc}>
                        <TableCell>Boosts {pct(inc, 0)}</TableCell>
                        <TableCell className="tabular text-right">
                          {mult(condDmgMod(0.2, 3, 0.15, inc, red))}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row flex-wrap items-start justify-between gap-4">
            <div className="grid gap-1.5">
              <CardTitle>3. Power</CardTitle>
              <CardDescription>
                <Code>HeroBattleRateCounter</Code> with the <Code>fight_battle_rate</Code> table.
                Weights depend on the class build.
              </CardDescription>
            </div>
            <ToggleGroup
              type="single"
              value={spec}
              onValueChange={(v) => v && setSpec(v)}
              variant="outline"
              size="sm"
              aria-label="Class build"
            >
              {SPECS.map((s) => (
                <ToggleGroupItem key={s.id} value={String(s.id)} aria-label={s.name} title={s.name}>
                  <SpecIcon spec={s.id} className="size-5" />
                </ToggleGroupItem>
              ))}
            </ToggleGroup>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Formula>
              power = (Σ flat stat × weight) × (1 + Σ rate stat × weight) × (1 + Σ final stat ×
              weight)
            </Formula>
            <div className="grid gap-6 lg:grid-cols-3">
              {[1, 2, 3].map((layer) => (
                <Table key={layer}>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{["", "Flat", "Rate", "Final"][layer]}</TableHead>
                      <TableHead className="text-right">Weight</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {powerRows
                      .filter((r) => r.layer === layer && (r.weights[spec] ?? 0) !== 0)
                      .map((r) => (
                        <TableRow key={r.attr}>
                          <TableCell className="whitespace-normal">
                            {POWER_ATTRS[r.attr]?.label ?? data.attrs[r.attr]?.name ?? r.attr}
                            {r.base ? (
                              <span className="text-muted-foreground"> − {r.base}</span>
                            ) : null}
                          </TableCell>
                          <TableCell className="tabular text-right">
                            {fixed(r.weights[spec], r.weights[spec] < 0.1 ? 4 : 2)}
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              ))}
            </div>
            <p className="max-w-[65ch] text-sm text-muted-foreground">
              Rate stats are entered as fractions (17.1% DMG Boost counts 0.171). Max HP is worth
              0.6 per point, so HP gear raises power without making fights faster; DMG Boost and
              Final DMG Boost do the opposite.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>4. Clearing a stage</CardTitle>
            <CardDescription>
              <Code>stage_info.CheckMinBr</Code> (minimum power) is 0 on all {data.stages.length}{" "}
              stages: the game never gates by power.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <p className="max-w-[65ch] text-sm text-muted-foreground">
              A campaign stage is a 40-second fight. A wave of about 30 monsters spawns over the
              first 20 seconds (at most 10 on the field), the boss group arrives at 20 seconds, and
              the stage clears when every enemy is dead. Waves hold most of the HP, so area damage
              matters as much as the boss.
            </p>
            <Formula>
              work(stage) = Σ count × HP ÷ your hit on that enemy &nbsp;·&nbsp; clears when work ≤
              your capacity
            </Formula>
            <p className="max-w-[65ch] text-sm text-muted-foreground">
              Your capacity comes from your progress (Character → Campaign progress): a stage you
              lost and how much of it you got done, or else the middle between your furthest clear
              and the stage after it. With neither, the example Archer's fight stands in, scaled by
              your attack frequency. Raising flat stats scales damage through the exact hit formula.
              Real accounts also gain rate stats as they grow, so the guide bends the raw estimate
              down with a factor fitted to real clears from two accounts: from ×1 at your progress
              to ×{DRIFT.late} by {DRIFT.span.toFixed(0)}× its power. Chapter bosses are a single
              target, which area damage can't speed up: they need ×{DRIFT.bossFactor.toFixed(2)} a
              wave stage of the same size.
            </p>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Real result</TableHead>
                  <TableHead>Account</TableHead>
                  <TableHead className="text-right">Raw model</TableHead>
                  <TableHead className="text-right">Ratio</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["6-10 lost with ~96% done at 8.38M", "Archer", "8.6M", "anchor"],
                  ["9-6 cleared at ~88M", "Lord Knight", "163M", "0.54"],
                  ["10-1 cleared at 125M", "Lord Knight", "268M", "0.47"],
                  ["10-9 cleared at ~259M", "Lord Knight", "444M", "0.58"],
                  ["10-10 lost at 262M", "Lord Knight", "488M", "fits (needs ~258M)"],
                  ["9-12 chapter boss cleared at ~120M", "Lord Knight", "112M", "1.07"],
                ].map(([r, a, m, x]) => (
                  <TableRow key={r}>
                    <TableCell>{r}</TableCell>
                    <TableCell>{a}</TableCell>
                    <TableCell className="tabular text-right">{m}</TableCell>
                    <TableCell className="tabular text-right">{x}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>5. Attribute points</CardTitle>
            <CardDescription>
              <Code>fight_attr_transfer</Code> gives each primary stat's bonus at every value from 1
              to 400; points cost more the more you already have.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4">
            <Formula>next point in a stat costs floor(points already in it ÷ 5) + 1</Formula>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Stat</TableHead>
                  <TableHead>Each point gives</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[
                  ["STR", "PATK +1% and Final PATK +0.2% (every class except Archer), PDEF +0.5%"],
                  [
                    "AGI",
                    "Aspd along a curve (+30.15 at AGI 64, +43.21 at AGI 200, nothing after), FLEE +1, PDEF +0.1%",
                  ],
                  ["VIT", "Max HP +0.5%, DMG RED +0.2%"],
                  ["INT", "MATK +1% and Final MATK +0.2%, MDEF +0.5%, Max SP +2"],
                  ["DEX", "HIT +1, Haste +0.5%; for Archers also PATK +1% and Final PATK +0.2%"],
                  ["LUK", "CRIT +0.3, Skill CRIT +0.3, MDEF +0.2%"],
                ].map(([k, v]) => (
                  <TableRow key={k}>
                    <TableCell className="font-medium">{k}</TableCell>
                    <TableCell className="whitespace-normal">{v}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
            <p className="max-w-[65ch] text-sm text-muted-foreground">
              Every point spent also adds +2 PATK, +2 MATK, +1 PDEF, +1 MDEF, +20 Max HP and +2 SP.
              PATK % from STR or DEX also scales refine PATK. A stat above 400 converts to nothing.
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>6. Attack speed, crit and misses</CardTitle>
            <CardDescription>
              Constants from <Code>FightVariables</Code>: no table overrides them.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-3">
            <Formula>
              Aspd = min(193, 200 − (200 − (150 + AGI bonus)) × (1 − Aspd%)) &nbsp;·&nbsp; ATK Freq
              = min(7, 50 ÷ (200 − Aspd))
            </Formula>
            <Formula>
              crit chance = (CRIT − target CRIT RES) ÷ 100 &nbsp;·&nbsp; a crit deals × max(1, CRIT
              DMG − target CRIT DMG resistance)
            </Formula>
            <Formula>
              miss chance = (FLEE − HIT) ÷ (FLEE − HIT + 1000), only when the target's FLEE is
              higher
            </Formula>
            <Formula>
              skill cooldown = base ÷ (1 + Haste) &nbsp;·&nbsp; Variable Cooldown Reduction = Haste
              ÷ 2
            </Formula>
            <p className="max-w-[65ch] text-sm text-muted-foreground">
              Normal attacks crit with CRIT, skills with Skill CRIT. The Variable Cooldown Reduction
              on the stat screen is display only: in combat a skill's cooldown is divided by 1 +
              Haste. A skill hit is the damage formula × crit × the skill's coefficient, which grows
              with skill level (Double Strafe: 0.9 to 1.3 per arrow, two arrows, 6-second cooldown).
            </p>
          </CardContent>
        </Card>

        <Accordion type="single" collapsible>
          <AccordionItem value="raw">
            <AccordionTrigger>
              All damage formulas as the game stores them ({data.formulas.formulas.length})
            </AccordionTrigger>
            <AccordionContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Id</TableHead>
                    <TableHead>Name</TableHead>
                    <TableHead>Template</TableHead>
                    <TableHead>Inputs</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.formulas.formulas.map((f) => (
                    <TableRow key={f.id}>
                      <TableCell className="tabular">F{f.id}</TableCell>
                      <TableCell className="font-medium">{f.key}</TableCell>
                      <TableCell>
                        {data.formulas.templates[f.template]?.key ?? f.template}
                      </TableCell>
                      <TableCell className="max-w-[36rem] text-xs text-muted-foreground">
                        {f.params.map((p) => describeParam(p, data.attrs)).join(", ")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </>
  );
}

const ACTOR: Record<number, string> = {
  1: "team",
  2: "attacker",
  3: "attacker's leader",
  4: "target",
  5: "owner",
};

function describeParam(
  p: Record<string, Record<string, unknown>>,
  attrs: Record<string, { key: string }>,
): string {
  const [kind, v] = Object.entries(p)[0] ?? ["?", {}];
  const attr = (id: unknown) => attrs[String(id)]?.key ?? String(id);
  switch (kind) {
    case "FPValue":
      return String((v.Value as number | undefined) ?? 0);
    case "FPFormula":
      return `F${String(v.Formula)}`;
    case "FPActorAttr":
    case "FPActorAttrRate":
      return `${ACTOR[v.Actor as number] ?? "actor"}.${attr(v.Attr)}`;
    default:
      return `${kind.replace(/^FP/, "")}.${attr(v.Attr)}`;
  }
}
