import { useId, useState } from "react";
import { PageHeader, SectionTitle, Stat } from "@/components/page-header";
import { LoadingState } from "@/components/states";
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
import { useShops, useSummons } from "@/lib/game/extra-data";
import {
  expectedPulls,
  formatChance,
  type ShopsFile,
  type Summon,
  type SummonsFile,
} from "@rogo/game/data/items";
import { full } from "@/lib/format";

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

export default function SummonsPage() {
  const summons = useSummons();
  const shops = useShops();
  return (
    <>
      <PageHeader eyebrow="Reference" title="Summons and shops">
        Rates, pity and level-ups for every summon, and what each shop sells. Rates are the game's
        own tables; this guide only shows them.
      </PageHeader>
      {summons && shops ? (
        <Tabs defaultValue="summons" className="gap-block">
          <TabsList>
            <TabsTrigger value="summons">Summons</TabsTrigger>
            <TabsTrigger value="shops">Shops</TabsTrigger>
          </TabsList>
          <TabsContent value="summons">
            <Summons f={summons} />
          </TabsContent>
          <TabsContent value="shops">
            <Shops f={shops} />
          </TabsContent>
        </Tabs>
      ) : (
        <LoadingState label="Loading summons…" />
      )}
    </>
  );
}

function Summons({ f }: { f: SummonsFile }) {
  const [id, setId] = useState(f.summons[0].id);
  const sid = useId();
  const s = f.summons.find((x) => x.id === id) ?? f.summons[0];
  return (
    <div className="grid gap-block">
      <div className="grid w-[min(100%,24rem)] gap-1.5">
        <Label htmlFor={sid}>Summon</Label>
        <Select value={id} onValueChange={setId}>
          <SelectTrigger id={sid} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {f.summons.map((x) => (
              <SelectItem key={x.id} value={x.id}>
                {x.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <SummonView s={s} />
    </div>
  );
}

function SummonView({ s }: { s: Summon }) {
  const cost = s.cost.map((c) => `${full(c.amount)} ${c.name}`).join(" or ");
  return (
    <div className="grid gap-block">
      <div className="tiles-lead">
        <Stat
          lead
          label="One pull"
          value={cost || "Free"}
          hint={
            s.multi
              ? `${s.multi.pulls} pulls: ${s.multi.cost.map((c) => `${full(c.amount)} ${c.name}`).join(" or ")}`
              : undefined
          }
        />
        <Stat
          label="Free a day"
          value={s.freePerDay ?? 0}
          hint={s.adsPerDay ? `${s.adsPerDay} more by ad` : undefined}
        />
        {s.totalLimit ? <Stat label="Pull limit" value={full(s.totalLimit)} /> : null}
      </div>
      {s.rule && (
        <p className="measure text-sm whitespace-pre-line text-muted-foreground">{s.rule}</p>
      )}

      {(s.type === "weapon" || s.type === "pet" || s.type === "elite") && (
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>Rates</TableHead>
                  <TableHead className="text-right">To level up</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {s.levels.map((l) => (
                  <TableRow key={l.level}>
                    <TableCell className="tabular font-medium">{l.level}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {(l.rates as { quality: number; p: number; sub?: string; name?: string }[])
                        .filter((r) => r.p > 0)
                        .map(
                          (r) =>
                            `${r.name ?? GRADE[r.quality] ?? r.quality}${r.sub ? ` ${r.sub}` : ""} ${formatChance(r.p)}`,
                        )
                        .join(" · ")}
                    </TableCell>
                    <TableCell className="tabular text-right text-sm">
                      {"toNext" in l
                        ? l.toNext
                          ? `${full(l.toNext)} pulls`
                          : "Max"
                        : "upgrade" in l && l.upgrade
                          ? `${full(l.upgrade.steps * l.upgrade.cost.amount)} ${l.upgrade.cost.name}`
                          : "Max"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {(s.type === "wish" || s.type === "treasure" || s.type === "wheel") && (
        <>
          {s.pity?.length ? (
            <section className="grid gap-block">
              <SectionTitle aside="Chance rises each pull until the guarantee">Pity</SectionTitle>
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,16rem),1fr))] gap-block">
                {s.pity.map((p) => (
                  <Stat
                    key={p.id}
                    label={p.name}
                    value={`Sure by pull ${p.max}`}
                    hint={`About ${full(expectedPulls(p.curve))} pulls on average · ${formatChance(p.effective)} overall`}
                  />
                ))}
              </div>
            </section>
          ) : null}
          <section className="grid gap-block">
            <SectionTitle>Rates</SectionTitle>
            <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-block">
              {s.groups.map((g) => (
                <Card key={g.id} size="sm">
                  <CardHeader>
                    <CardTitle>{g.name}</CardTitle>
                    <CardDescription>
                      {g.shown ?? (g.rate !== undefined ? formatChance(g.rate) : "")}
                    </CardDescription>
                  </CardHeader>
                  <CardContent>
                    <ul className="grid max-h-[40dvh] gap-1 overflow-y-auto text-sm">
                      {g.items.map((it, i) => (
                        <li key={i} className="tabular flex justify-between gap-3">
                          <span className="min-w-0 truncate">
                            {it.name}{" "}
                            {Array.isArray(it.amount) || it.amount > 1
                              ? `×${Array.isArray(it.amount) ? it.amount.join("–") : it.amount}`
                              : ""}
                          </span>
                          <span className="shrink-0 text-muted-foreground">
                            {formatChance(it.p)}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
          {s.progress?.length ? (
            <section className="grid gap-block">
              <SectionTitle aside={s.progressRepeats ? "Repeats" : undefined}>
                Pull milestones
              </SectionTitle>
              <Card>
                <CardContent>
                  <ul className="grid gap-1 text-sm">
                    {s.progress.map((p) => (
                      <li key={p.at} className="tabular flex justify-between gap-3">
                        <span className={p.big ? "font-semibold" : undefined}>
                          {full(p.at)} pulls
                        </span>
                        <span className="text-muted-foreground">
                          {p.rewards
                            .map(
                              (r) =>
                                `${r.name} ×${Array.isArray(r.amount) ? r.amount.join("–") : r.amount}`,
                            )
                            .join(", ")}
                        </span>
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function Shops({ f }: { f: ShopsFile }) {
  const [id, setId] = useState(String(f.stores[0].id));
  const sid = useId();
  const store = f.stores.find((x) => String(x.id) === id) ?? f.stores[0];
  return (
    <div className="grid gap-block">
      <div className="grid w-[min(100%,24rem)] gap-1.5">
        <Label htmlFor={sid}>Shop</Label>
        <Select value={id} onValueChange={setId}>
          <SelectTrigger id={sid} className="w-full">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {f.stores.map((x) => (
              <SelectItem key={x.id} value={String(x.id)}>
                {x.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Goods</TableHead>
                <TableHead className="text-right">Price</TableHead>
                <TableHead className="text-right">Limit</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {store.goods.map((g) => (
                <TableRow key={g.id}>
                  <TableCell className="text-sm whitespace-normal">
                    {g.items
                      .map(
                        (it) =>
                          `${it.name} ×${Array.isArray(it.amount) ? it.amount.join("–") : full(it.amount)}`,
                      )
                      .join(", ")}
                    {g.unlock && (
                      <span className="block text-xs text-muted-foreground">{g.unlock}</span>
                    )}
                  </TableCell>
                  <TableCell className="tabular text-right text-sm">
                    {g.pay === "free"
                      ? "Free"
                      : g.pay === "ad"
                        ? "Watch an ad"
                        : g.pay === "money"
                          ? "Real money"
                          : g.cost
                            ? `${full(g.cost.amount)} ${g.cost.name}`
                            : "—"}
                  </TableCell>
                  <TableCell className="tabular text-right text-sm">
                    {g.limit
                      ? `${g.limit}${g.refresh !== undefined ? ` ${f.refresh[g.refresh] ?? ""}` : ""}`
                      : "—"}
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
