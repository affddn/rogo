import {
  CartesianGrid,
  ComposedChart,
  Line,
  ReferenceLine,
  Scatter,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChartContainer, type ChartConfig } from "@/components/ui/chart";
import { short } from "@/lib/format";

export interface PowerPoint {
  i: number;
  id: string;
  label: string;
  /** solid line: backed by fights */
  power: number | null;
  /** dashed line: extrapolated */
  extra: number | null;
  value: number;
  boss: number | null;
}

const config = {
  power: { label: "Power to clear", color: "var(--chart-1)" },
  extra: { label: "Extrapolated", color: "var(--chart-1)" },
  boss: { label: "Chapter boss", color: "var(--chart-2)" },
} satisfies ChartConfig;

function TooltipBody({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: PowerPoint }[];
}) {
  const p = payload?.[0]?.payload;
  if (!active || !p) return null;
  return (
    <div className="grid gap-0.5 rounded-md border bg-popover px-2.5 py-1.5 text-xs shadow-md">
      <span className="font-medium">{p.label}</span>
      <span className="tabular text-muted-foreground">
        Power to clear <span className="text-foreground">{short(p.value)}</span>
        {p.boss !== null && " · chapter boss"}
        {p.extra !== null && p.power === null && " · extrapolated"}
      </span>
    </div>
  );
}

/** Estimated power per stage on a log scale, with your power as a reference line. */
export function PowerChart({
  points,
  yours,
  onPick,
}: {
  points: PowerPoint[];
  yours?: number;
  onPick?: (id: string) => void;
}) {
  const ticks = chapterTicks(points);
  return (
    <ChartContainer config={config} className="aspect-auto h-72 w-full">
      <ComposedChart
        data={points}
        margin={{ top: 8, right: 12, bottom: 0, left: 4 }}
        onClick={(e) => {
          const idx =
            typeof e?.activeTooltipIndex === "number"
              ? e.activeTooltipIndex
              : Number(e?.activeTooltipIndex);
          if (onPick && Number.isFinite(idx) && points[idx]) onPick(points[idx].id);
        }}
      >
        <CartesianGrid vertical={false} strokeOpacity={0.5} />
        <XAxis
          dataKey="i"
          type="number"
          domain={["dataMin", "dataMax"]}
          ticks={ticks.map((t) => t.i)}
          tickFormatter={(i) => ticks.find((t) => t.i === i)?.label ?? ""}
          tickLine={false}
          axisLine={false}
          fontSize={11}
        />
        <YAxis
          scale="log"
          domain={["auto", "auto"]}
          allowDataOverflow
          tickFormatter={short}
          tickLine={false}
          axisLine={false}
          width={48}
          fontSize={11}
        />
        <Tooltip content={<TooltipBody />} cursor={{ strokeDasharray: "3 3" }} />
        {yours ? (
          <ReferenceLine
            y={yours}
            stroke="var(--foreground)"
            strokeDasharray="4 4"
            strokeOpacity={0.6}
            label={{
              value: `You ${short(yours)}`,
              position: "insideTopLeft",
              fontSize: 11,
              fill: "var(--muted-foreground)",
            }}
          />
        ) : null}
        <Line
          dataKey="power"
          type="monotone"
          stroke="var(--color-power)"
          strokeWidth={2}
          dot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
        <Line
          dataKey="extra"
          type="monotone"
          stroke="var(--color-extra)"
          strokeWidth={2}
          strokeDasharray="5 4"
          strokeOpacity={0.7}
          dot={false}
          isAnimationActive={false}
          connectNulls={false}
        />
        <Scatter
          dataKey="boss"
          fill="var(--color-boss)"
          stroke="var(--card)"
          strokeWidth={2}
          isAnimationActive={false}
        />
      </ComposedChart>
    </ChartContainer>
  );
}

function chapterTicks(points: PowerPoint[]) {
  const out: { i: number; label: string }[] = [];
  let last = 0;
  for (const p of points) {
    const c = Number(p.id.split("-")[0]);
    if (c !== last) {
      last = c;
      const step = points.length > 200 ? 5 : 1;
      if (c === 1 || c % step === 0) out.push({ i: p.i, label: `Ch ${c}` });
    }
  }
  return out;
}
