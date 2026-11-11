import { useMemo, useState } from "react";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { MonsterBadge } from "@/components/game-icon";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import { short } from "@/lib/format";
import { Badge } from "@/components/ui/badge";
import { describe } from "@rogo/game/cards";

const base = import.meta.env.BASE_URL;
const QUALITY = ["", "Normal", "Excellent", "Rare", "Epic", "Legendary"];

const LIMIT = 200;

export default function DataPage() {
  const { data } = useGame();
  const [q, setQ] = useState("");
  const query = q.trim().toLowerCase();

  // where each monster first appears in the campaign
  const firstSeen = useMemo(() => {
    const m = new Map<number, string>();
    for (const s of data.stages) for (const e of s.enemies) if (!m.has(e.id)) m.set(e.id, s.id);
    return m;
  }, [data.stages]);

  const monsters = Object.entries(data.monsters)
    .filter(([id, m]) => !query || m.name.toLowerCase().includes(query) || id.includes(query))
    .slice(0, LIMIT);
  const cards = data.cards.filter(
    (c) =>
      !query ||
      c.name.toLowerCase().includes(query) ||
      c.slotName.toLowerCase().includes(query) ||
      String(c.id).includes(query),
  );
  const attrs = Object.entries(data.attrs)
    .filter(
      ([id, a]) =>
        !query ||
        a.name.toLowerCase().includes(query) ||
        a.key.toLowerCase().includes(query) ||
        id.includes(query),
    )
    .slice(0, LIMIT);

  return (
    <>
      <PageHeader title="Game data">
        Straight from the client's config tables. Monster stats here are the base values; each stage
        adds its own on top (see a stage's page for the real numbers).
      </PageHeader>
      <div className="relative mb-4 max-w-sm">
        <Search
          className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-muted-foreground"
          aria-hidden
        />
        <Input
          className="pl-8"
          placeholder="Filter by name or id"
          aria-label="Filter by name or id"
          value={q}
          onChange={(e) => setQ(e.target.value)}
        />
      </div>
      <Tabs defaultValue="monsters">
        <TabsList>
          <TabsTrigger value="monsters">Monsters</TabsTrigger>
          <TabsTrigger value="cards">Cards</TabsTrigger>
          <TabsTrigger value="attrs">Attributes</TabsTrigger>
        </TabsList>
        <TabsContent value="monsters">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Monster</TableHead>
                    <TableHead className="text-right">Id</TableHead>
                    <TableHead>First stage</TableHead>
                    <TableHead className="text-right">Base HP</TableHead>
                    <TableHead className="text-right">Base PATK</TableHead>
                    <TableHead className="text-right">Skills</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {monsters.map(([id, m]) => (
                    <TableRow key={id}>
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <MonsterBadge id={Number(id)} name={m.name} className="size-7" />
                          {m.name || <span className="text-muted-foreground">Unnamed</span>}
                        </span>
                      </TableCell>
                      <TableCell className="tabular text-right">{id}</TableCell>
                      <TableCell>
                        {firstSeen.get(Number(id)) ?? (
                          <span className="text-muted-foreground">Not in campaign</span>
                        )}
                      </TableCell>
                      <TableCell className="tabular text-right">{short(m.base.hp)}</TableCell>
                      <TableCell className="tabular text-right">{short(m.base.patk)}</TableCell>
                      <TableCell className="tabular text-right">{m.skills.length}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              {monsters.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No monster matches "{q}". Try part of a name, like "poring".
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="cards">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Card</TableHead>
                    <TableHead>Inserted, 1★</TableHead>
                    <TableHead>Inserted, max ★</TableHead>
                    <TableHead>Owned bonus, max ★</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {cards.map((c) => {
                    const first = c.stars[0];
                    const last = c.stars[c.stars.length - 1];
                    return (
                      <TableRow key={c.id}>
                        <TableCell className="align-top">
                          <div className="flex items-start gap-2.5">
                            <img
                              src={`${base}game/frame/bottom_item_${Math.min(10, c.quality)}.png`}
                              alt=""
                              className="mt-0.5 size-8 rounded-md"
                            />
                            <div className="grid gap-1">
                              <span className="font-medium">{c.name}</span>
                              <span className="flex flex-wrap gap-1">
                                <Badge variant="outline">{c.slotName}</Badge>
                                <Badge variant="outline">{QUALITY[c.quality] ?? c.quality}</Badge>
                                {c.mvp ? <Badge variant="secondary">MVP</Badge> : null}
                              </span>
                            </div>
                          </div>
                        </TableCell>
                        <TableCell className="max-w-[16rem] align-top text-sm whitespace-normal">
                          {describe(first.equip).join(", ")}
                        </TableCell>
                        <TableCell className="max-w-[18rem] align-top text-sm whitespace-normal">
                          {describe(last.equip).join(", ")}
                          {last.brand && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              Proc: {last.brand.text}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="max-w-[14rem] align-top text-sm whitespace-normal text-muted-foreground">
                          {describe(last.inv).join(", ")}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
              {cards.length === 0 && (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No card matches "{q}". Try a name like "poring" or a slot like "weapon".
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
        <TabsContent value="attrs">
          <Card>
            <CardContent className="pt-6">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-right">Id</TableHead>
                    <TableHead>Key</TableHead>
                    <TableHead>In game</TableHead>
                    <TableHead>Note (from the game's config)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {attrs.map(([id, a]) => (
                    <TableRow key={id}>
                      <TableCell className="tabular text-right">{id}</TableCell>
                      <TableCell className="font-mono text-xs">{a.key}</TableCell>
                      <TableCell>
                        {a.name !== a.key ? (
                          a.name
                        ) : (
                          <span className="text-muted-foreground">–</span>
                        )}
                      </TableCell>
                      <TableCell className="max-w-[28rem] text-xs text-muted-foreground">
                        {a.desc}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </>
  );
}
