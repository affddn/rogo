import { useId, useMemo, useState } from "react";
import { PageHeader, SectionTitle, Stat } from "@/components/page-header";
import { LoadingState } from "@/components/states";
import { SpecSelect } from "@/components/character/spec-select";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
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
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGame } from "@/lib/game/game-data-context";
import { useProfile } from "@/lib/game/profile-context";
import { useAssetIndex, useSystems } from "@/lib/game/extra-data";
import { attrLine, sumAttrs } from "@rogo/game/attr-format";
import type { AttrMap, SystemsData } from "@rogo/game/data/systems";
import { full, pct } from "@/lib/format";
import { cn } from "@/lib/utils";

const base = import.meta.env.BASE_URL;

export default function SystemsPage() {
  const sys = useSystems();
  return (
    <>
      <PageHeader eyebrow="Gear" title="Weapons, pets and more">
        Every other source of stats: weapons and their stars, Collection Gear, pets, awakening,
        guild skills and costumes. "Owned" bonuses count for everything you have, equipped or not.
      </PageHeader>
      {sys ? (
        <Tabs defaultValue="weapons" className="gap-block">
          <TabsList>
            <TabsTrigger value="weapons">Weapons</TabsTrigger>
            <TabsTrigger value="legacy">Collection Gear</TabsTrigger>
            <TabsTrigger value="pets">Pets</TabsTrigger>
            <TabsTrigger value="awaken">Awakening</TabsTrigger>
            <TabsTrigger value="guild">Guild</TabsTrigger>
            <TabsTrigger value="avatars">Costumes</TabsTrigger>
          </TabsList>
          <TabsContent value="weapons">
            <Weapons sys={sys} />
          </TabsContent>
          <TabsContent value="legacy">
            <Legacy sys={sys} />
          </TabsContent>
          <TabsContent value="pets">
            <Pets sys={sys} />
          </TabsContent>
          <TabsContent value="awaken">
            <Awakening sys={sys} />
          </TabsContent>
          <TabsContent value="guild">
            <Guild sys={sys} />
          </TabsContent>
          <TabsContent value="avatars">
            <Avatars sys={sys} />
          </TabsContent>
        </Tabs>
      ) : (
        <LoadingState label="Loading weapons, pets and more…" />
      )}
    </>
  );
}

function Lines({ attrs, empty = "—" }: { attrs: AttrMap; empty?: string }) {
  const { data } = useGame();
  const list = Object.entries(attrs).filter(([k]) => !k.startsWith("81000"));
  if (!list.length) return <span className="text-muted-foreground">{empty}</span>;
  return <>{list.map(([k, v]) => attrLine(data.attrs, k, v)).join(" · ")}</>;
}

/** The game's icon for this thing when the phone had it cached, else the grade frame. */
function Icon({
  kind,
  id,
  show,
  children,
  glyph,
}: {
  kind: string;
  id: string | number;
  show: number;
  children?: React.ReactNode;
  /** white-on-clear art (guild skills) needs a dark backing */
  glyph?: boolean;
}) {
  const index = useAssetIndex();
  const has = index?.[kind]?.some((x) => String(x) === String(id));
  if (!has) return <Frame show={show}>{children}</Frame>;
  return (
    <span
      className={cn(
        "grid size-10 shrink-0 place-items-center overflow-hidden rounded-md bg-[length:100%_100%]",
        glyph && "bg-leather",
      )}
      style={
        glyph
          ? undefined
          : {
              backgroundImage: `url(${base}game/frame/bottom_item_${Math.min(10, Math.max(1, show))}.png)`,
            }
      }
    >
      <img
        src={`${base}game/${kind}/${id}.webp`}
        alt=""
        width={40}
        height={40}
        className="size-9 object-contain"
      />
    </span>
  );
}

function Frame({ show, children }: { show: number; children?: React.ReactNode }) {
  return (
    <span
      className="grid size-10 shrink-0 place-items-center bg-[length:100%_100%] text-xs font-bold text-white [text-shadow:0_1px_1px_rgb(0_0_0/60%)]"
      style={{
        backgroundImage: `url(${base}game/frame/bottom_item_${Math.min(10, Math.max(1, show))}.png)`,
      }}
    >
      {children}
    </span>
  );
}

function SpecPicker({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div className="grid w-[min(100%,18rem)] gap-1.5">
      <Label htmlFor={id}>Class build</Label>
      <SpecSelect id={id} value={value} onChange={onChange} />
    </div>
  );
}

function StarSlider({
  label,
  value,
  max,
  onChange,
}: {
  label: string;
  value: number;
  max: number;
  onChange: (v: number) => void;
}) {
  const id = useId();
  return (
    <div className="grid w-[min(100%,22rem)] gap-3">
      <Label htmlFor={id}>
        {label}: <span className="tabular">★{value}</span>
      </Label>
      <Slider
        id={id}
        min={1}
        max={max}
        step={1}
        value={[value]}
        onValueChange={([v]) => onChange(v)}
      />
    </div>
  );
}

function scaled(a: AttrMap, f: number): AttrMap {
  return sumAttrs({}, a, f);
}

function Weapons({ sys }: { sys: SystemsData }) {
  const { profile } = useProfile();
  const w = sys.weapons;
  const [spec, setSpec] = useState(profile?.spec ?? 41);
  const [star, setStar] = useState(20);
  const build = w.builds.find((b) => b.spec === spec) ?? w.builds[0];
  const copies = (show: number) =>
    (w.starCost[show] ?? []).slice(0, star).reduce((a, n) => a + n, 0);
  const ownedAll = useMemo(() => {
    const sum: AttrMap = {};
    for (const x of build.weapons) {
      sumAttrs(sum, x.inv, w.starFactor.inv[star - 1]);
      sumAttrs(sum, x.invFlat);
    }
    return sum;
  }, [build, star, w.starFactor]);

  return (
    <div className="grid gap-block">
      <div className="flex flex-wrap items-end gap-x-block gap-y-4">
        <SpecPicker value={spec} onChange={setSpec} />
        <StarSlider label="Star level" value={star} max={w.maxStar} onChange={setStar} />
      </div>
      <div className="split-aside items-start">
        <Card size="sm">
          <CardHeader>
            <CardTitle>
              Owning all {build.weapons.length} at ★{star}
            </CardTitle>
            <CardDescription>
              Owned bonuses add up across every weapon you have. Stars multiply the owned bonus by
              up to ×{w.starFactor.inv.at(-1)}, but the equipped bonus only by ×
              {w.starFactor.equip.at(-1)}.
            </CardDescription>
          </CardHeader>
          <CardContent className="text-sm">
            <Lines attrs={ownedAll} />
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{build.categoryName}</TableHead>
                  <TableHead>Equipped at ★{star}</TableHead>
                  <TableHead>Owned at ★{star}</TableHead>
                  <TableHead className="text-right">Copies to ★{star}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {[...build.weapons].reverse().map((x) => (
                  <TableRow key={x.q}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <Icon kind="weapon" id={`${build.spec}-${x.show}`} show={x.show} />
                        <span className="grid leading-tight">
                          <span className="font-medium">{x.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {sys.meta.qualityNames[x.show]} {x.sub}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <Lines
                        attrs={sumAttrs(scaled(x.equip, w.starFactor.equip[star - 1]), x.equipFlat)}
                      />
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <Lines
                        attrs={sumAttrs(scaled(x.inv, w.starFactor.inv[star - 1]), x.invFlat)}
                      />
                    </TableCell>
                    <TableCell className="tabular text-right">{full(copies(x.show))}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
      <section className="grid gap-block">
        <SectionTitle aside="Weapon summon odds by summon level">Weapon summon</SectionTitle>
        <Card>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Level</TableHead>
                  <TableHead>Odds by grade</TableHead>
                  <TableHead className="text-right">Pulls to next level</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {w.summonLevels.map((l) => (
                  <TableRow key={l.level}>
                    <TableCell className="tabular font-medium">{l.level}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      {Object.entries(l.odds)
                        .filter(([, p]) => p > 0)
                        .map(
                          ([g, p]) =>
                            `${sys.meta.qualityNames[g] ?? g} ${pct(p, p < 0.01 ? 2 : 1)}`,
                        )
                        .join(" · ")}
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {l.drawsToNext ? full(l.drawsToNext) : "Max"}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

function Legacy({ sys }: { sys: SystemsData }) {
  const { profile } = useProfile();
  const l = sys.legacy;
  const [spec, setSpec] = useState(profile?.spec ?? 41);
  const [star, setStar] = useState(1);
  const items = l.items.filter((i) => i.specs.includes(spec)).sort((a, b) => b.quality - a.quality);
  const suits = l.suits.filter((s) => s.specs.includes(spec));
  const cat = (id: number) => l.categories.find((c) => c.id === id)?.name ?? "";
  return (
    <div className="grid gap-block">
      <div className="flex flex-wrap items-end gap-x-block gap-y-4">
        <SpecPicker value={spec} onChange={setSpec} />
        <StarSlider label="Star level" value={star} max={5} onChange={setStar} />
      </div>
      {suits.length > 0 && (
        <section className="grid gap-block">
          <SectionTitle aside="A set's tier is its lowest piece's star">Sets</SectionTitle>
          <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,20rem),1fr))] gap-block">
            {suits.map((s) => (
              <Card key={s.id} size="sm">
                <CardHeader>
                  <CardTitle>{s.name}</CardTitle>
                  <CardDescription>
                    {s.parts.map((p) => l.items.find((i) => i.id === p)?.name ?? p).join(" + ")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="grid gap-2 text-sm">
                  {s.tiers.map((t) => (
                    <div key={t.star} className="grid gap-0.5">
                      <span className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                        All pieces ★{t.star}
                      </span>
                      <span>
                        <Lines attrs={sumAttrs(sumAttrs({}, t.equip), t.inv)} empty="" />
                      </span>
                      {t.brand && <span className="text-muted-foreground">{t.brand.text}</span>}
                    </div>
                  ))}
                </CardContent>
              </Card>
            ))}
          </div>
        </section>
      )}
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Piece</TableHead>
                <TableHead>Equipped at ★{star}</TableHead>
                <TableHead>Owned at ★{star}</TableHead>
                <TableHead className="text-right">Shards to ★{star}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((i) => {
                const st = i.stars[star - 1] ?? i.stars.at(-1)!;
                return (
                  <TableRow key={i.id}>
                    <TableCell>
                      <span className="flex items-center gap-2.5">
                        <Icon kind="legacy" id={i.id} show={i.quality} />
                        <span className="grid leading-tight">
                          <span className="font-medium">{i.name}</span>
                          <span className="text-xs text-muted-foreground">
                            {sys.meta.qualityNames[i.quality]} · {cat(i.category)}
                          </span>
                        </span>
                      </span>
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <Lines attrs={st.equip} />
                      {st.brand && (
                        <span className="block text-xs text-muted-foreground">{st.brand.text}</span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <Lines attrs={st.inv} />
                    </TableCell>
                    <TableCell className="tabular text-right">
                      {full(i.stars.slice(0, star).reduce((a, s) => a + s.shards, 0))}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Pets({ sys }: { sys: SystemsData }) {
  const p = sys.pets;
  const [level, setLevel] = useState(40);
  const id = useId();
  return (
    <div className="grid gap-block">
      <div className="grid w-[min(100%,22rem)] gap-3">
        <Label htmlFor={id}>
          Pet level: <span className="tabular">{level}</span>
        </Label>
        <Slider
          id={id}
          min={1}
          max={80}
          step={1}
          value={[level]}
          onValueChange={([v]) => setLevel(v)}
        />
      </div>
      <Card>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pet</TableHead>
                <TableHead className="text-right">Attack inherited</TableHead>
                <TableHead>When guarding, level {level}</TableHead>
                <TableHead>Owned</TableHead>
                <TableHead>Skills</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...p.pets]
                .sort((a, b) => b.quality - a.quality)
                .map((pet) => {
                  const c = p.levels[pet.curve];
                  const i = Math.min(level, c?.maxLevel ?? 1) - 1;
                  const guard: AttrMap = {};
                  for (const [k, arr] of Object.entries(c?.guard ?? {})) guard[k] = arr[i] ?? 0;
                  // `own` is the pet's own combat stats; the owned bonus is the level curve's inv
                  const inv: AttrMap = {};
                  for (const [k, arr] of Object.entries(c?.inv ?? {}))
                    inv[k] = (inv[k] ?? 0) + (arr[i] ?? 0);
                  return (
                    <TableRow key={pet.id}>
                      <TableCell>
                        <span className="flex items-center gap-2.5">
                          <Icon kind="pet" id={pet.id} show={pet.show} />
                          <span className="grid leading-tight">
                            <span className="font-medium">{pet.name}</span>
                            <span className="text-xs text-muted-foreground">
                              {sys.meta.qualityNames[pet.show]}
                            </span>
                          </span>
                        </span>
                      </TableCell>
                      <TableCell className="tabular text-right">
                        {c ? pct(c.inherit[i] ?? 0, 0) : "—"}
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        <Lines attrs={guard} />
                      </TableCell>
                      <TableCell className="text-sm whitespace-normal">
                        <Lines attrs={inv} />
                      </TableCell>
                      <TableCell className="max-w-[24rem] text-sm whitespace-normal">
                        {pet.skills.map((s) => (
                          <span key={s.idx} className="block">
                            <span className="font-medium">{s.name}</span>{" "}
                            <span className="text-muted-foreground">
                              (Lv {s.unlockLevel}) {s.text}
                            </span>
                          </span>
                        ))}
                      </TableCell>
                    </TableRow>
                  );
                })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}

function Awakening({ sys }: { sys: SystemsData }) {
  const { profile } = useProfile();
  const [spec, setSpec] = useState(profile?.spec ?? 41);
  const lines = sys.awakening.filter((a) => a.spec === spec);
  return (
    <div className="grid gap-block">
      <SpecPicker value={spec} onChange={setSpec} />
      {lines.length ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-block">
          {lines.map((a) => (
            <Card key={a.id}>
              <CardHeader>
                <CardTitle>{a.name}</CardTitle>
                <CardDescription>{a.desc}</CardDescription>
              </CardHeader>
              <CardContent>
                <ol className="grid gap-2 text-sm">
                  {a.tiers.map((t) => (
                    <li key={t.tier} className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-3">
                      <span className="tabular font-semibold">
                        {a.gateName} {full(t.req)}
                      </span>
                      <span>
                        {t.skill ? (
                          <>
                            <span className="font-medium">{t.skill.name}</span>
                            <span className="block text-muted-foreground">{t.skill.text}</span>
                          </>
                        ) : (
                          <Lines attrs={t.attrs} />
                        )}
                      </span>
                    </li>
                  ))}
                </ol>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <p className="game-panel text-sm text-muted-foreground">
          This class has no awakening lines.
        </p>
      )}
    </div>
  );
}

function Guild({ sys }: { sys: SystemsData }) {
  return (
    <Card>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Skill</TableHead>
              <TableHead className="text-right">Max level</TableHead>
              <TableHead>At max level</TableHead>
              <TableHead className="text-right">Total cost</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {sys.guild.skills.map((s) => {
              const last = s.levels.at(-1);
              const cost = s.levels.reduce((a, l) => a + (l.cost?.num ?? 0), 0);
              const item = s.levels.find((l) => l.cost)?.cost?.name ?? "";
              return (
                <TableRow key={s.id}>
                  <TableCell>
                    <span className="flex items-center gap-2.5">
                      <Icon kind="guildskill" id={s.id} show={1} glyph />
                      <span className="grid leading-tight">
                        <span className="font-medium">{s.name}</span>
                        <span className="text-xs text-muted-foreground">
                          {s.kindName} · guild level {s.unlockGuildLevel}
                        </span>
                      </span>
                    </span>
                  </TableCell>
                  <TableCell className="tabular text-right">{s.maxLevel}</TableCell>
                  <TableCell className="text-sm whitespace-normal">{last?.text}</TableCell>
                  <TableCell className="tabular text-right text-sm">
                    {cost ? `${full(cost)} ${item}` : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}

function Avatars({ sys }: { sys: SystemsData }) {
  const a = sys.avatars;
  const withStats = a.items.filter((i) => Object.keys(i.attrs).length);
  const totalProgress = a.items.reduce((s, i) => s + i.progress, 0);
  return (
    <div className="grid gap-block">
      <div className="tiles-lead">
        <Stat
          lead
          label="Costumes and looks"
          value={a.items.length}
          hint={`${withStats.length} give stats on unlock`}
        />
        <Stat label="Collection progress, all unlocked" value={full(totalProgress)} />
      </div>
      <div className="split-main items-start">
        <Card>
          <CardHeader>
            <CardTitle>Collection progress rewards</CardTitle>
            <CardDescription>Each milestone you pass adds its stats for good.</CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Progress</TableHead>
                  <TableHead>Adds</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {a.progressRewards.map((r) => (
                  <TableRow key={r.progress}>
                    <TableCell className="tabular font-medium">{full(r.progress)}</TableCell>
                    <TableCell className="text-sm whitespace-normal">
                      <Lines attrs={r.attrs} />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle>Looks with stats</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="grid gap-2 text-sm">
              {withStats.map((i) => (
                <li key={i.id} className="grid gap-0.5 border-b border-gold/20 pb-2 last:border-0">
                  <span className="font-medium">
                    {i.name}{" "}
                    <span className="text-muted-foreground">· {a.categories[i.category]}</span>
                  </span>
                  <span>
                    <Lines attrs={i.attrs} />
                  </span>
                  <span className="text-xs text-muted-foreground">{i.unlock.text}</span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
