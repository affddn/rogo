import { useDeferredValue, useMemo, useState } from "react";
import { Link } from "react-router";
import { Search } from "lucide-react";
import { PageHeader } from "@/components/page-header";
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
import { useAssetIndex, useItems } from "@/lib/game/extra-data";
import {
  formatChance,
  type Item,
  type ItemsFile,
  type Reward,
  type Source,
} from "@rogo/game/data/items";
import { full } from "@/lib/format";
import { cn } from "@/lib/utils";

const base = import.meta.env.BASE_URL;

export default function ItemsPage() {
  const items = useItems();
  return (
    <>
      <PageHeader eyebrow="Reference" title="Items and drops">
        Every item, card and pet, and where to get it: idle drops, stage and mode rewards, quests,
        shops and summons. Chances are per attempt as the game's tables give them.
      </PageHeader>
      {items ? <Browser f={items} /> : <LoadingState label="Loading items…" />}
    </>
  );
}

const amount = (a: number | [number, number]) =>
  Array.isArray(a) ? `${full(a[0])}–${full(a[1])}` : full(a);

function ItemIcon({ item }: { item: Item }) {
  const index = useAssetIndex();
  const has = index?.[item.asset]?.some((x) => String(x) === String(item.id));
  return (
    <span
      className="grid size-10 shrink-0 place-items-center bg-[length:100%_100%]"
      style={{
        backgroundImage: `url(${base}game/frame/bottom_item_${Math.min(10, Math.max(1, item.quality || 1))}.png)`,
      }}
    >
      {has && (
        <img
          src={`${base}game/${item.asset}/${item.id}.webp`}
          alt=""
          width={32}
          height={32}
          className="size-8 object-contain"
        />
      )}
    </span>
  );
}

function Browser({ f }: { f: ItemsFile }) {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState("all");
  const [picked, setPicked] = useState<string>(
    () => f.items.find((i) => i.asset === "card")?.key ?? f.items[0].key,
  );
  const q = useDeferredValue(query.trim().toLowerCase());
  const visible = useMemo(
    () =>
      f.items.filter(
        (i) =>
          !i.hidden &&
          !i.name.startsWith("Test ") &&
          (cat === "all" || i.asset === cat || String(i.category) === cat) &&
          (!q || i.name.toLowerCase().includes(q)),
      ),
    [f.items, cat, q],
  );
  const item = f.items.find((i) => i.key === picked);
  const usedCats = [...new Set(f.items.map((i) => i.category))].filter((c) => f.categories[c]);

  return (
    <div className="split-aside items-start">
      <div className="grid min-w-0 content-start gap-3 lg:sticky lg:top-[calc(var(--topbar-h)+env(safe-area-inset-top)+1rem)]">
        <div className="grid gap-1.5">
          <Label htmlFor="item-search">Search</Label>
          <div className="flex items-center gap-2 rounded-lg border border-input bg-parchment/50 pl-3">
            <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden />
            <Input
              id="item-search"
              type="search"
              value={query}
              placeholder="Item, card or pet"
              onChange={(e) => setQuery(e.target.value)}
              className="border-0 bg-transparent shadow-none focus-visible:ring-0"
            />
          </div>
        </div>
        <div className="grid gap-1.5">
          <Label htmlFor="item-cat">Kind</Label>
          <Select value={cat} onValueChange={setCat}>
            <SelectTrigger id="item-cat" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Everything</SelectItem>
              <SelectItem value="card">Cards</SelectItem>
              <SelectItem value="pet">Pets</SelectItem>
              {usedCats.map((c) => (
                <SelectItem key={c} value={String(c)}>
                  {f.categories[c]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <ul
          className="grid max-h-[60dvh] gap-1 overflow-y-auto overscroll-contain rounded-lg border border-gold/25 bg-card/60 p-1.5"
          aria-label="Items"
        >
          {visible.slice(0, 300).map((i) => (
            <li key={i.key}>
              <button
                type="button"
                onClick={() => setPicked(i.key)}
                aria-current={i.key === picked}
                className={cn(
                  "grid min-h-(--touch) w-full grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-2.5 rounded-md px-1.5 text-left text-sm",
                  i.key === picked ? "bg-gold/25 font-semibold" : "hover:bg-accent/50",
                )}
              >
                <ItemIcon item={i} />
                <span className="truncate">{i.name}</span>
              </button>
            </li>
          ))}
          {!visible.length && (
            <li className="p-3 text-sm text-muted-foreground">
              Nothing matches. Try another word.
            </li>
          )}
        </ul>
      </div>

      {item ? <Detail f={f} item={item} onPick={setPicked} /> : null}
    </div>
  );
}

function RewardList({
  f,
  rows,
  onPick,
}: {
  f: ItemsFile;
  rows: Reward[];
  onPick: (k: string) => void;
}) {
  return (
    <ul className="grid gap-1 text-sm">
      {rows.map((r, i) => (
        <li key={i} className="tabular flex justify-between gap-3">
          {r.key && f.items.some((x) => x.key === r.key) ? (
            <button
              type="button"
              className="text-left underline underline-offset-2"
              onClick={() => onPick(r.key!)}
            >
              {r.name}
            </button>
          ) : (
            <span>{r.name}</span>
          )}
          <span className="text-muted-foreground">
            ×{amount(r.amount)} {r.p !== undefined && formatChance(r.p)}
          </span>
        </li>
      ))}
    </ul>
  );
}

function sourceWhere(s: Source) {
  const bits = [s.label];
  if (s.stages)
    bits.push(s.stages[0] === s.stages[1] ? s.stages[0] : `${s.stages[0]} to ${s.stages[1]}`);
  return bits.join(" · ");
}

function Detail({ f, item, onPick }: { f: ItemsFile; item: Item; onPick: (k: string) => void }) {
  return (
    <div className="grid min-w-0 content-start gap-block">
      <div className="game-panel grid grid-cols-[2.5rem_minmax(0,1fr)] items-center gap-3">
        <ItemIcon item={item} />
        <span className="grid min-w-0 gap-0.5">
          <span className="font-heading text-lg font-semibold">{item.name}</span>
          <span className="text-sm text-muted-foreground">
            {[
              f.qualities[item.quality],
              f.categories[item.category],
              item.asset === "card" ? "Card" : item.asset === "pet" ? "Pet" : null,
            ]
              .filter(Boolean)
              .join(" · ")}
          </span>
        </span>
      </div>
      {item.desc && <p className="measure text-sm">{item.desc}</p>}
      {item.asset === "card" && (
        <p className="text-sm">
          <Link to="/cards" className="underline underline-offset-2">
            See it in the card album
          </Link>
          {item.shardsPerCard ? ` · ${item.shardsPerCard} fragments make one card` : ""}
        </p>
      )}
      <Card>
        <CardHeader>
          <CardTitle>Where to get it</CardTitle>
          <CardDescription>
            {item.sources.length
              ? `${item.sources.length} sources`
              : "No source in the game's tables (events, packs or not obtainable yet)."}
          </CardDescription>
        </CardHeader>
        {item.sources.length > 0 && (
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Source</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead className="text-right">Chance</TableHead>
                  <TableHead>Per</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {item.sources.map((s, i) => (
                  <TableRow key={i}>
                    <TableCell className="text-sm whitespace-normal">
                      {sourceWhere(s)}
                      {s.cost && (
                        <span className="block text-xs text-muted-foreground">
                          for {full(s.cost.amount)} {s.cost.name}
                          {s.limit ? `, ${s.limit} max` : ""}
                        </span>
                      )}
                      {s.viaShard && (
                        <span className="block text-xs text-muted-foreground">as fragments</span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">{amount(s.amount)}</TableCell>
                    <TableCell className="tabular text-right">
                      {formatChance(s.p) || "—"}
                      {s.pity ? (
                        <span className="block text-xs text-muted-foreground">
                          sure by {s.pity}
                        </span>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal text-muted-foreground">
                      {[s.per, s.perDay ? `${s.perDay} a day` : null].filter(Boolean).join(" · ") ||
                        "—"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        )}
      </Card>
      {(item.contents?.length || item.choose?.length) && (
        <Card size="sm">
          <CardHeader>
            <CardTitle>{item.choose?.length ? "Pick one of" : "Contains"}</CardTitle>
          </CardHeader>
          <CardContent>
            <RewardList f={f} rows={item.choose ?? item.contents ?? []} onPick={onPick} />
          </CardContent>
        </Card>
      )}
      {item.spentIn?.length ? (
        <p className="text-sm text-muted-foreground">Used for: {item.spentIn.join(", ")}.</p>
      ) : null}
    </div>
  );
}
