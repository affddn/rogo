import { useId, useMemo, useState } from "react";
import { PageHeader, SectionTitle, Stat } from "@/components/page-header";
import { QualityText } from "@/components/quality";
import { LoadingState } from "@/components/states";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SpecSelect } from "@/components/character/spec-select";
import { useGame } from "@/lib/game/game-data-context";
import { useProfile } from "@/lib/game/profile-context";
import { useEquipment } from "@/lib/game/extra-data";
import { attrLine, attrName, attrValue, sumAttrs } from "@rogo/game/attr-format";
import {
  atLeastOnce,
  dropLevelRange,
  enchantLineOdds,
  enhanceCost,
  getItem,
  itemAttrs,
  refineExpected,
  slotAttrs,
  type EquipmentData,
} from "@rogo/game/data/equipment";
import { full, pct } from "@/lib/format";

const base = import.meta.env.BASE_URL;
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export default function EquipmentPage() {
  const eq = useEquipment();
  return (
    <>
      <PageHeader eyebrow="Gear" title="Equipment">
        Armor and accessories, with what refine, enhance and enchant add. Enhance, refine and
        enchant belong to the slot, so they stay when you swap the item in it.
      </PageHeader>
      {eq ? (
        <Tabs defaultValue="item" className="gap-block">
          <TabsList>
            <TabsTrigger value="item">Item</TabsTrigger>
            <TabsTrigger value="refine">Refine</TabsTrigger>
            <TabsTrigger value="enhance">Enhance</TabsTrigger>
            <TabsTrigger value="enchant">Enchant</TabsTrigger>
            <TabsTrigger value="summon">Elite Summon</TabsTrigger>
          </TabsList>
          <TabsContent value="item">
            <ItemCalc eq={eq} />
          </TabsContent>
          <TabsContent value="refine">
            <RefineTab eq={eq} />
          </TabsContent>
          <TabsContent value="enhance">
            <EnhanceTab eq={eq} />
          </TabsContent>
          <TabsContent value="enchant">
            <EnchantTab eq={eq} />
          </TabsContent>
          <TabsContent value="summon">
            <SummonTab eq={eq} />
          </TabsContent>
        </Tabs>
      ) : (
        <LoadingState label="Loading equipment…" />
      )}
    </>
  );
}

function useSpec() {
  const { profile } = useProfile();
  return useState(profile?.spec ?? 41);
}

function NumberInput({
  label,
  value,
  onChange,
  min,
  max,
  hint,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  hint?: string;
}) {
  const id = useId();
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        inputMode="numeric"
        className="tabular"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(clamp(Math.floor(Number(e.target.value) || 0), min, max))}
      />
      <span className="text-xs text-muted-foreground">{hint ?? `${min} to ${max}`}</span>
    </div>
  );
}

function PartPicker({
  eq,
  value,
  onChange,
}: {
  eq: EquipmentData;
  value: number;
  onChange: (p: number) => void;
}) {
  const id = useId();
  return (
    <div className="grid content-start gap-1.5">
      <Label htmlFor={id}>Slot</Label>
      <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
        <SelectTrigger id={id} className="w-full">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {eq.parts.map((p) => (
            <SelectItem key={p.id} value={String(p.id)}>
              <img
                src={`${base}game/equip/icon_equip_part${p.id}.png`}
                alt=""
                width={20}
                height={20}
                className="size-5"
              />
              {p.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <span className="text-xs text-muted-foreground">
        {eq.parts.find((p) => p.id === value)?.categoryName}
      </span>
    </div>
  );
}

function ItemCalc({ eq }: { eq: EquipmentData }) {
  const { data } = useGame();
  const { profile } = useProfile();
  const [spec, setSpec] = useSpec();
  const [part, setPart] = useState(1);
  const [quality, setQuality] = useState(30);
  const [level, setLevel] = useState(() => dropLevelRange(eq, profile?.level ?? 55)[0]);
  const [refine, setRefine] = useState(10);
  const [enhance, setEnhance] = useState(50);
  const ids = { spec: useId(), quality: useId() };
  const item = getItem(eq, spec, part, quality);
  const q = eq.qualities[quality - 1];
  const show = eq.showQualities.find((s) => s.id === q?.show);
  const fromItem = item ? itemAttrs(eq, item, level, refine) : {};
  const fromSlot = slotAttrs(eq, part, enhance, refine);
  const total = sumAttrs(sumAttrs({}, fromItem), fromSlot);
  const [lo, hi] = dropLevelRange(eq, profile?.level ?? 55);
  const enh = enhanceCost(eq, part, 0, enhance);

  return (
    <div className="split-main items-start">
      <Card>
        <CardHeader>
          <CardTitle>Item and slot</CardTitle>
          <CardDescription>
            Base stats grow ×1.004 per item level. New drops land between item level {lo} and {hi}{" "}
            at base level {profile?.level ?? 55}.
          </CardDescription>
        </CardHeader>
        <CardContent className="form-grid">
          <div className="grid content-start gap-1.5">
            <Label htmlFor={ids.spec}>Class build</Label>
            <SpecSelect id={ids.spec} value={spec} onChange={setSpec} />
          </div>
          <PartPicker eq={eq} value={part} onChange={setPart} />
          <div className="grid content-start gap-1.5">
            <Label htmlFor={ids.quality}>Grade</Label>
            <Select value={String(quality)} onValueChange={(v) => setQuality(Number(v))}>
              <SelectTrigger id={ids.quality} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {eq.showQualities.map((sq) => (
                  <SelectGroup key={sq.id}>
                    <SelectLabel>{sq.name}</SelectLabel>
                    {eq.qualities
                      .filter((x) => x.show === sq.id)
                      .map((x) => (
                        <SelectItem key={x.id} value={String(x.id)}>
                          <QualityText dark={sq.dark[0]} light={sq.light[0]}>
                            {x.name}
                          </QualityText>
                        </SelectItem>
                      ))}
                  </SelectGroup>
                ))}
              </SelectContent>
            </Select>
          </div>
          <NumberInput label="Item level" value={level} onChange={setLevel} min={1} max={2000} />
          <NumberInput
            label="Slot refine"
            value={refine}
            onChange={setRefine}
            min={0}
            max={eq.refine.maxLevel}
          />
          <NumberInput
            label="Slot enhance"
            value={enhance}
            onChange={setEnhance}
            min={0}
            max={eq.enhance.maxLevel}
          />
        </CardContent>
      </Card>

      <div className="grid min-w-0 content-start gap-block">
        <div className="game-panel grid grid-cols-[4rem_minmax(0,1fr)] items-center gap-3">
          <span
            className="grid size-16 place-items-center bg-[length:100%_100%]"
            style={{ backgroundImage: `url(${base}game/frame/bottom_item_${q?.show ?? 1}.png)` }}
          >
            <img
              src={`${base}game/equip/icon_equip_part${part}.png`}
              alt=""
              width={40}
              height={40}
              className="size-10"
            />
          </span>
          <span className="grid min-w-0 gap-0.5">
            <span className="truncate font-heading text-lg font-semibold">{item?.name || "—"}</span>
            <QualityText dark={show?.dark[0]} light={show?.light[0]} className="text-sm">
              {q?.name}
            </QualityText>
          </span>
        </div>
        <Card size="sm">
          <CardHeader>
            <CardTitle>What this slot gives</CardTitle>
            <CardDescription>
              Middle of each base stat's roll. Refine multiplies the item's base stats by{" "}
              {pct(eq.refine.tables[0].levels[refine]?.base ?? 0, 0)} here.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-1 text-sm">
              {Object.entries(total).map(([k, v]) => (
                <li key={k} className="tabular flex justify-between gap-3">
                  <span className="text-muted-foreground">{attrName(data.attrs, k)}</span>
                  <span className="font-semibold">{attrValue(data.attrs, k, v)}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
        <Stat
          label={`Enhance +0 → +${enhance}`}
          value={full(enh[1])}
          hint={eq.materials[enh[0]]?.name}
        />
        {item && item.refineConds.length > 0 && (
          <p className="text-sm text-muted-foreground">
            Refine bonus on this item:{" "}
            {item.refineConds
              .map((c) =>
                c.at.map((a, i) => `+${a}: ${attrLine(data.attrs, c.attr, c.v[i])}`).join(", "),
              )
              .join("; ")}
            .
          </p>
        )}
      </div>
    </div>
  );
}

function RefineTab({ eq }: { eq: EquipmentData }) {
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(15);
  const [protectFrom, setProtectFrom] = useState(true);
  const id = useId();
  const levels = eq.refine.tables[0].levels;
  const all = refineExpected(eq, 1, 0, eq.refine.maxLevel, () => protectFrom);
  const pick = refineExpected(eq, 1, from, Math.max(from, to), () => protectFrom);
  const matName = (k: string) => eq.materials[k]?.name ?? k;

  return (
    <div className="grid gap-block">
      <div className="split-aside items-start">
        <Card>
          <CardHeader>
            <CardTitle>Expected cost</CardTitle>
            <CardDescription>
              An exact average over every success, fail and drop, not a best case.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-block">
            <div className="form-grid">
              <NumberInput
                label="From"
                value={from}
                onChange={setFrom}
                min={0}
                max={eq.refine.maxLevel - 1}
              />
              <NumberInput
                label="To"
                value={to}
                onChange={setTo}
                min={1}
                max={eq.refine.maxLevel}
              />
            </div>
            <div className="flex min-h-(--touch) items-center gap-3">
              <Switch id={id} checked={protectFrom} onCheckedChange={setProtectFrom} />
              <Label htmlFor={id}>Use protection where offered (+13 to +29)</Label>
            </div>
          </CardContent>
        </Card>
        <div className="tiles-lead">
          <Stat
            lead
            label="Expected attempts"
            value={full(pick.attempts)}
            hint={`+${from} → +${to}`}
          />
          {Object.entries(pick.materials).map(([k, v]) => (
            <Stat key={k} label={matName(k)} value={full(v)} />
          ))}
        </div>
      </div>

      <section className="grid gap-block">
        <SectionTitle aside="Row +N is the attempt from +N to +N+1">Refine levels</SectionTitle>
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead className="text-right">Success</TableHead>
                  <TableHead className="text-right">Stay</TableHead>
                  <TableHead className="text-right">Drop a level</TableHead>
                  <TableHead className="text-right">Cost per try</TableHead>
                  <TableHead className="text-right">Avg tries</TableHead>
                  <TableHead className="text-right">Base stats</TableHead>
                  <TableHead className="text-right">Refine ATK</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {levels.slice(0, -1).map((r, i) => (
                  <TableRow key={r.lv} className={r.demote > 0.1 ? "bg-critical/5" : undefined}>
                    <TableCell className="tabular font-medium">
                      +{r.lv} → +{r.lv + 1}
                    </TableCell>
                    <TableCell className="tabular text-right">{pct(r.success, 0)}</TableCell>
                    <TableCell className="tabular text-right">{pct(r.retain, 0)}</TableCell>
                    <TableCell
                      className={`tabular text-right ${r.demote ? "text-critical" : "text-muted-foreground"}`}
                    >
                      {pct(r.demote, 0)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {r.cost.map(([m, n]) => `${n} ${matName(String(m))}`).join(", ")}
                      {r.protect && protectFrom && (
                        <span className="block text-xs text-muted-foreground">
                          + {r.protect[1]} {matName(String(r.protect[0]))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {all.steps[i]?.attempts.toFixed(1)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      +{pct(levels[r.lv + 1].base, 0)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {full(levels[r.lv + 1].flat[0])}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>

      <ResonanceTable
        title="Refine Resonance"
        note="Account-wide. Claim each level once enough slots that hold an item reach the refine level."
        rows={eq.refineResonance.map((r) => ({
          level: r.level,
          parts: r.parts,
          need: `+${r.refine}`,
          attrs: r.attrs,
        }))}
      />
    </div>
  );
}

function ResonanceTable({
  title,
  note,
  rows,
}: {
  title: string;
  note: string;
  rows: { level: number; parts: number; need: string; attrs: Record<string, number> }[];
}) {
  const { data } = useGame();
  return (
    <section className="grid gap-block">
      <SectionTitle aside={note}>{title}</SectionTitle>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Level</TableHead>
                <TableHead>Needs</TableHead>
                <TableHead>Gives</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((r) => (
                <TableRow key={r.level}>
                  <TableCell className="tabular font-medium">{r.level}</TableCell>
                  <TableCell className="tabular">
                    {r.parts} slots at {r.need}
                  </TableCell>
                  <TableCell className="text-sm whitespace-normal">
                    {Object.entries(r.attrs)
                      .map(([k, v]) => attrLine(data.attrs, k, v))
                      .join(" · ")}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}

function EnhanceTab({ eq }: { eq: EquipmentData }) {
  const { data } = useGame();
  const [from, setFrom] = useState(0);
  const [to, setTo] = useState(100);
  const t = eq.enhance.tables[0];
  const cost = enhanceCost(eq, 1, from, Math.max(from, to));
  const marks = [10, 50, 100, 150, 200, 300, 400].filter((m) => m <= eq.enhance.maxLevel);
  return (
    <div className="grid gap-block">
      <div className="split-aside items-start">
        <Card>
          <CardHeader>
            <CardTitle>Enhance cost</CardTitle>
            <CardDescription>Enhance never fails; it only costs metal.</CardDescription>
          </CardHeader>
          <CardContent className="form-grid">
            <NumberInput
              label="From"
              value={from}
              onChange={setFrom}
              min={0}
              max={eq.enhance.maxLevel - 1}
            />
            <NumberInput label="To" value={to} onChange={setTo} min={1} max={eq.enhance.maxLevel} />
          </CardContent>
        </Card>
        <div className="tiles-lead">
          <Stat
            lead
            label={eq.materials[cost[0]]?.name ?? "Metal"}
            value={full(cost[1])}
            hint={`+${from} → +${to}, one slot`}
          />
          <Stat label="All 8 slots" value={full(cost[1] * 8)} />
        </div>
      </div>
      <section className="grid gap-block">
        <SectionTitle aside="Totals at that level, per slot">Enhance stats</SectionTitle>
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  {eq.enhance.attrs.map((k) => (
                    <TableHead key={k} className="text-right">
                      {attrName(data.attrs, k)}
                    </TableHead>
                  ))}
                  <TableHead className="text-right">Metal from +0</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {marks.map((m) => (
                  <TableRow key={m}>
                    <TableCell className="tabular font-medium">+{m}</TableCell>
                    {eq.enhance.attrs.map((k, i) => (
                      <TableCell key={k} className="tabular text-right">
                        {full(t.values[i][m])}
                      </TableCell>
                    ))}
                    <TableCell className="tabular text-right">
                      {full(enhanceCost(eq, 1, 0, m)[1])}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
      <ResonanceTable
        title="Enhance Resonate"
        note="Account-wide, claimed one level at a time."
        rows={eq.enhanceResonance.map((r) => ({
          level: r.level,
          parts: r.parts,
          need: `+${r.enhance}`,
          attrs: r.attrs,
        }))}
      />
    </div>
  );
}

function EnchantTab({ eq }: { eq: EquipmentData }) {
  const { data } = useGame();
  const [spec, setSpec] = useSpec();
  const [part, setPart] = useState(1);
  const [category, setCategory] = useState(1);
  const [level, setLevel] = useState(6);
  const ids = { spec: useId(), cat: useId(), level: useId() };
  const lines =
    eq.enchant.levels.find((l) => l.category === category && l.level === level)?.lines ?? 3;
  const odds = useMemo(
    () =>
      enchantLineOdds(eq, part, category, level, spec).sort(
        (a, b) => b.quality - a.quality || b.p - a.p,
      ),
    [eq, part, category, level, spec],
  );
  const levels = [...new Set(eq.enchant.levels.map((l) => l.level))].sort((a, b) => a - b);
  return (
    <div className="grid gap-block">
      <Card>
        <CardHeader>
          <CardTitle>Enchant odds</CardTitle>
          <CardDescription>
            Pool 1 opens at slot refine +{eq.enchant.unlockRefine["1"]}, pool 2 at +
            {eq.enchant.unlockRefine["2"]}. Each enchant re-rolls every unlocked line; you can lock
            up to {eq.enchant.maxLocks} lines for more material.
          </CardDescription>
        </CardHeader>
        <CardContent className="form-grid">
          <div className="grid content-start gap-1.5">
            <Label htmlFor={ids.spec}>Class build</Label>
            <SpecSelect id={ids.spec} value={spec} onChange={setSpec} />
          </div>
          <PartPicker eq={eq} value={part} onChange={setPart} />
          <div className="grid content-start gap-1.5">
            <Label htmlFor={ids.cat}>Pool</Label>
            <Select value={String(category)} onValueChange={(v) => setCategory(Number(v))}>
              <SelectTrigger id={ids.cat} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1">Pool 1</SelectItem>
                <SelectItem value="2">Pool 2</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="grid content-start gap-1.5">
            <Label htmlFor={ids.level}>Enchant level</Label>
            <Select value={String(level)} onValueChange={(v) => setLevel(Number(v))}>
              <SelectTrigger id={ids.level} className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {levels.map((l) => (
                  <SelectItem key={l} value={String(l)}>
                    Level {l} ({eq.enchant.qualityNames[l] ?? ""})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardContent>
          {odds.length ? (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Line</TableHead>
                  <TableHead>Grade</TableHead>
                  <TableHead className="text-right">Per line</TableHead>
                  <TableHead className="text-right">In one enchant ({lines} lines)</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {odds.map((o, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium whitespace-normal">
                      {attrLine(data.attrs, o.option.attr, o.option.v)}
                      {o.option.rare && <span className="game-chip ml-2">Rare</span>}
                    </TableCell>
                    <TableCell>{eq.enchant.qualityNames[o.quality]}</TableCell>
                    <TableCell className="tabular text-right">
                      {pct(o.p, o.p < 0.001 ? 3 : 2)}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {pct(atLeastOnce(o.p, lines), o.p < 0.001 ? 3 : 2)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          ) : (
            <p className="py-6 text-sm text-muted-foreground">
              This class has no enchant lines here. Novices can't enchant.
            </p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

function SummonTab({ eq }: { eq: EquipmentData }) {
  const grades = eq.showQualities;
  const cost = eq.summon.costPerSummon;
  return (
    <section className="grid gap-block">
      <SectionTitle aside={`1 summon costs ${cost[1]} ${eq.materials[cost[0]]?.name ?? ""}`}>
        Elite Summon levels
      </SectionTitle>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Level</TableHead>
                <TableHead>Drop grade odds</TableHead>
                <TableHead className="text-right">To level up</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eq.summon.levels.map((l) => (
                <TableRow key={l.level}>
                  <TableCell className="tabular font-medium">{l.level}</TableCell>
                  <TableCell className="whitespace-normal">
                    <span className="flex flex-wrap gap-x-3 gap-y-1 text-sm">
                      {l.odds.map(([g, , p]) => {
                        const sq = grades.find((x) => x.id === g);
                        return (
                          <span key={g} className="tabular">
                            <QualityText dark={sq?.dark[0]} light={sq?.light[0]}>
                              {sq?.name ?? g}
                            </QualityText>{" "}
                            {pct(p, p < 0.01 ? 2 : 1)}
                          </span>
                        );
                      })}
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-right text-sm">
                    {l.levelUp
                      ? `${full(l.levelUp.stages * l.levelUp.perStage)} ${eq.materials[l.levelUp.item]?.name ?? ""} · ${l.levelUp.seconds < 60 ? `${l.levelUp.seconds}s` : `${Math.round(l.levelUp.seconds / 60)} min`}`
                      : "Max"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </section>
  );
}
