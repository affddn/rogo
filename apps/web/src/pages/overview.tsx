import { Link } from "react-router";
import { ArrowRight } from "lucide-react";
import { Banner, SpecIcon } from "@/components/game-icon";
import { SectionTitle, Stat } from "@/components/page-header";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { useGame } from "@/lib/game/game-data-context";
import { useProfile } from "@/lib/game/profile-context";
import { stageName } from "@/lib/game/data";
import { furthestClear } from "@rogo/game/stage";
import { specName } from "@rogo/game/classes";
import { NAV } from "@/nav";
import { full, pct, short } from "@/lib/format";

const FINDINGS = [
  {
    title: "No stage asks for a power number",
    body: "Every stage's minimum-power field is 0. A stage clears when all of its enemies die inside 40 seconds, so damage on that stage's monsters is what counts.",
    to: "/formulas",
  },
  {
    title: "DMG RED is the real wall",
    body: "Enemy DMG RED climbs about 2% per stage and passes 100% at 10-1. Below your own damage boosts it divides your damage, so DMG Boost often beats raw ATK there.",
    to: "/planner",
  },
  {
    title: "Refine ATK skips DEF",
    body: "Refine ATK is added after the DEF division, so it keeps its full value as enemy DEF grows, unlike PATK.",
    to: "/formulas",
  },
  {
    title: "Waves hold most of the HP",
    body: "About 30 monsters spawn in the first 20 seconds and usually outweigh the boss several times over. Chapter bosses are the exception: one target, so area damage can't help.",
    to: "/progression",
  },
];

export default function OverviewPage() {
  const { data, estimates } = useGame();
  const { profile } = useProfile();
  const furthest = profile ? furthestClear(estimates, profile.power) : undefined;
  const next = profile ? estimates.find((e) => e.progress < 1) : undefined;
  const chapters = Object.keys(data.chapters).length;

  return (
    <>
      <Banner image="bg_atlas_pgfl6sfkm">
        <div className="grid max-w-[min(100%,40rem)] gap-4 p-[clamp(1.5rem,5vw,4rem)] text-white">
          <span className="game-chip w-fit text-[0.7rem] tracking-[0.14em] text-foreground uppercase">
            Ragnarok: GO · SEA client 0.0.163
          </span>
          <h1 className="text-[clamp(2rem,4.6vw,3.5rem)] leading-[1.05] font-semibold">
            Know what each stage takes, and what to raise next
          </h1>
          <p className="measure text-[clamp(1rem,1.4vw,1.125rem)] text-white/85">
            Built from the game's own data: {data.stages.length} campaign stages,{" "}
            {Object.keys(data.monsters).length} monsters, every card, and the damage and power
            formulas, read from the client and checked against live fights.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <Button asChild size="lg">
              <Link to="/character">
                {profile ? `Open ${profile.name}` : "Set up your character"}{" "}
                <ArrowRight aria-hidden />
              </Link>
            </Button>
            <Button
              asChild
              variant="ghost"
              className="text-white hover:bg-white/15 hover:text-white"
            >
              <Link to="/progression">See all stages</Link>
            </Button>
          </div>
        </div>
      </Banner>

      {profile ? (
        <div className="tiles-lead">
          <Stat
            lead
            label={profile.name}
            value={
              <span className="flex items-center gap-3">
                <SpecIcon spec={profile.spec} className="size-10 shrink-0" />
                {full(profile.power)}
              </span>
            }
            hint={`${specName(profile.spec)} · level ${profile.level}`}
          />
          <Stat
            label="Furthest stage these stats clear"
            value={furthest ? stageName(data, furthest.id) : "–"}
          />
          <Stat
            label="Next stage"
            value={next ? stageName(data, next.id) : "All clear"}
            hint={
              next
                ? `about ${short(next.power)} (${pct(next.power / profile.power - 1, 0)} more)`
                : undefined
            }
          />
        </div>
      ) : (
        <div className="tiles-lead">
          <Stat
            lead
            label="Campaign"
            value={`${data.stages.length} stages`}
            hint={`${chapters} chapters, 40 seconds a fight`}
          />
          <Stat label="Monsters" value={full(Object.keys(data.monsters).length)} />
          <Stat label="Cards" value={full(data.cards.length)} />
        </div>
      )}

      <section className="grid gap-block">
        <SectionTitle>What the data shows</SectionTitle>
        <div className="split-main">
          {[FINDINGS.slice(0, 2), FINDINGS.slice(2)].map((col, i) => (
            <div key={i} className="grid content-start gap-block">
              {col.map((f) => (
                <Card key={f.title}>
                  <CardHeader>
                    <CardTitle>{f.title}</CardTitle>
                    <CardDescription className="measure leading-relaxed">{f.body}</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <Link
                      to={f.to}
                      className="inline-flex min-h-(--touch) items-center gap-1 text-sm font-semibold text-primary hover:underline"
                    >
                      Read more <ArrowRight className="size-3.5" aria-hidden />
                    </Link>
                  </CardContent>
                </Card>
              ))}
            </div>
          ))}
        </div>
      </section>

      <section className="grid gap-block">
        <SectionTitle>Everything in the guide</SectionTitle>
        <div className="grid gap-block lg:grid-cols-[minmax(0,1fr)_minmax(0,1.618fr)]">
          {NAV.slice(1).map((g) => (
            <div key={g.group} className="grid content-start gap-3">
              <h3 className="text-sm font-semibold tracking-[0.12em] text-muted-foreground uppercase">
                {g.group}
              </h3>
              <div className="grid gap-3 sm:grid-cols-[repeat(auto-fit,minmax(min(100%,15rem),1fr))]">
                {g.items.map((t) => (
                  <Link
                    key={t.to}
                    to={t.to}
                    className="game-panel grid content-start gap-1.5 px-1 transition-[filter] hover:brightness-[1.03] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  >
                    <span className="flex items-center gap-2 font-heading font-semibold">
                      <t.icon className="size-5 text-primary" aria-hidden /> {t.label}
                    </span>
                    <span className="text-sm text-muted-foreground">{t.blurb}</span>
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>
    </>
  );
}
