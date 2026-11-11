import { SectionTitle } from "@/components/page-header";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useStageRewards } from "@/lib/game/extra-data";
import type { DropRow } from "@rogo/game/data/content";
import { full, pct } from "@/lib/format";

/** What clearing a campaign stage pays once, and what idling on it pays per hour. */
export function StageRewards({ id }: { id: string }) {
  const r = useStageRewards();
  const s = r?.stages[id];
  // keep the section's room while the file loads, so the page below doesn't jump
  if (!r) return <div className="min-h-48" aria-hidden />;
  if (!s) return null;
  const name = (k: string) => r.items[k]?.name ?? k;
  const line = (row: DropRow) => `${name(row[0])} ×${full(row[1])}`;
  return (
    <section className="grid gap-block">
      <SectionTitle aside={`Offline idle stops after ${r.idle.offlineCapHours} hours`}>
        Rewards
      </SectionTitle>
      <div className="split-main items-start">
        <Card size="sm">
          <CardHeader>
            <CardTitle>Idle on this stage, per hour</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-3 text-sm">
            <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
              <div className="grid">
                <span className="text-xs text-muted-foreground">Base EXP</span>
                <span className="tabular font-heading text-lg font-semibold">
                  {full(s.idle.baseExpPerHour)}
                </span>
              </div>
              <div className="grid">
                <span className="text-xs text-muted-foreground">Job EXP</span>
                <span className="tabular font-heading text-lg font-semibold">
                  {full(s.idle.jobExpPerHour)}
                </span>
              </div>
            </div>
            <ul className="grid gap-1">
              {s.idle.items.map(([k, n]) => (
                <li key={k} className="tabular flex justify-between gap-3">
                  <span>{name(k)}</span>
                  <span className="text-muted-foreground">{full(n)} an hour</span>
                </li>
              ))}
            </ul>
            {s.idle.cards.map(([hours, pool]) => (
              <p key={pool} className="text-muted-foreground">
                Every {hours} h, one of:{" "}
                {(r.cardPools[pool] ?? [])
                  .map(
                    (row) =>
                      `${name(row[0])}${row[2] !== undefined && row[2] < 1 ? ` (${pct(row[2], 0)})` : ""}`,
                  )
                  .join(", ")}
              </p>
            ))}
          </CardContent>
        </Card>
        <Card size="sm">
          <CardHeader>
            <CardTitle>First clear</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {s.firstClear.map((row, i) => (
                <li key={i} className="tabular">
                  {line(row)}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </section>
  );
}
