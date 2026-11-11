import { MonsterBadge } from "@/components/game-icon";
import { SectionTitle } from "@/components/page-header";
import { useGame } from "@/lib/game/game-data-context";
import type { Enemy, Stage } from "@rogo/game/types";
import { full, pct, short } from "@/lib/format";

const base = import.meta.env.BASE_URL;

/** The stage boss as the game's monster info shows it: portrait, tags, every combat stat, skills. */
export function BossPanel({ boss, stage }: { boss: Enemy; stage: Stage }) {
  const { data } = useGame();
  const m = data.monsters[boss.id];
  const tags = (m?.tagNames ?? []).filter((t) => t !== "Monster" && t !== "NormalMonster");
  const stats: [string, string, string?][] = [
    ["HP", full(boss.hp), boss.count > 1 ? `×${boss.count}` : undefined],
    ["PATK", short(boss.patk)],
    ["MATK", short(boss.matk)],
    ["PDEF", short(boss.pdef)],
    ["MDEF", short(boss.mdef)],
    ["HIT", full(boss.hit)],
    ["FLEE", full(boss.flee)],
    ["DMG Boost", pct(boss.dmgUp)],
    ["DMG RED", pct(boss.dmgRed)],
    ["Final DMG Boost", pct(boss.finalUp)],
    ["Final DMG RED", pct(boss.finalRed)],
    ["PvE DMG", pct(boss.pveDmg)],
  ];
  return (
    <section className="grid gap-block">
      <SectionTitle aside={`Arrives at ${boss.spawnAt}s of ${stage.time}s`}>
        Stage boss
      </SectionTitle>
      <div className="split-aside items-start">
        <div className="game-panel grid justify-items-center gap-3 text-center">
          <span
            className="grid size-[clamp(7rem,14vw,9rem)] place-items-center bg-[length:100%_100%]"
            style={{ backgroundImage: `url(${base}game/ui/frame_boss.png)` }}
          >
            <MonsterBadge id={boss.id} name={m?.name ?? "?"} boss className="size-[62%] text-3xl" />
          </span>
          <h2 className="text-[clamp(1.25rem,2vw,1.6rem)] leading-tight font-semibold">
            {m?.name ?? `Monster ${boss.id}`}
          </h2>
          <div className="flex flex-wrap justify-center gap-2">
            {tags.map((t) => (
              <span key={t} className="game-chip">
                {t === "Mvp" ? "MVP" : t}
              </span>
            ))}
            <span className="game-chip">
              {m?.damageType === 2 ? "Magic damage" : "Physical damage"}
            </span>
            {boss.count > 1 && <span className="game-chip">{boss.count} at once</span>}
          </div>
        </div>
        <div className="grid min-w-0 content-start gap-block">
          <dl className="game-panel grid grid-cols-[repeat(auto-fill,minmax(min(100%,8.5rem),1fr))] gap-x-block gap-y-4">
            {stats.map(([k, v, note]) => (
              <div key={k} className="grid min-w-0 gap-0.5">
                <dt className="text-xs font-semibold tracking-[0.08em] text-muted-foreground uppercase">
                  {k}
                </dt>
                <dd className="tabular font-heading text-lg font-semibold">
                  {v}
                  {note && (
                    <span className="ml-1 font-sans text-xs text-muted-foreground">{note}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
          {m?.skillInfo.length ? (
            <ul className="grid gap-3">
              {m.skillInfo.map((s) => (
                <li
                  key={s.id}
                  className="grid grid-cols-[minmax(0,1fr)_auto] items-start gap-x-4 gap-y-0.5 border-b border-gold/20 pb-3 last:border-0"
                >
                  <span className="font-semibold">{s.name || `Skill ${s.id}`}</span>
                  <span className="tabular text-sm text-muted-foreground">
                    {s.cd ? `${s.cd}s cooldown` : s.active ? "" : "Passive"}
                  </span>
                  {s.desc && (
                    <span className="col-span-2 text-sm text-muted-foreground">{s.desc}</span>
                  )}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
