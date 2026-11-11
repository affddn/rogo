import { useState } from "react";
import { PageHeader } from "@/components/page-header";
import { RequireCharacter } from "@/components/character/require-character";
import { StageField } from "@/components/stage-field";
import { CardsPanel } from "@/components/planner/cards";
import { StatPointsPanel } from "@/components/planner/stat-points";
import { UpgradesPanel } from "@/components/planner/upgrades";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useGame } from "@/lib/game/game-data-context";

export default function PlannerPage() {
  return (
    <RequireCharacter
      title="Planner"
      why="The planner ranks upgrades, attribute points and cards against the stage you're stuck on, so it needs your character first."
    >
      <Planner />
    </RequireCharacter>
  );
}

function Planner() {
  const { estimates, stageById } = useGame();
  const next = estimates.find((e) => e.progress < 1);
  const [target, setTarget] = useState(next?.id ?? "1-1");
  const stage = stageById.get(target);

  return (
    <>
      <PageHeader eyebrow="Your character" title="Planner">
        What to raise next. Every option is run through the game's damage formula against the stage
        you're stuck on, so the ranking reflects that stage's DEF and DMG RED, not the power number.
      </PageHeader>

      <div className="flex flex-wrap items-end gap-x-block gap-y-3">
        <StageField
          label="Target stage"
          value={target}
          onChange={setTarget}
          className="grid w-[min(100%,18rem)] gap-1.5"
        />
        {next && target !== next.id && (
          <Button variant="outline" onClick={() => setTarget(next.id)} className="mb-6">
            Use your next stage ({next.id})
          </Button>
        )}
      </div>

      {stage && (
        <Tabs defaultValue="upgrades" className="gap-block">
          <TabsList>
            <TabsTrigger value="upgrades">Upgrades</TabsTrigger>
            <TabsTrigger value="points">Stat points</TabsTrigger>
            <TabsTrigger value="cards">Cards</TabsTrigger>
          </TabsList>
          <TabsContent value="upgrades">
            <UpgradesPanel stage={stage} />
          </TabsContent>
          <TabsContent value="points">
            <StatPointsPanel stage={stage} />
          </TabsContent>
          <TabsContent value="cards">
            <CardsPanel stage={stage} />
          </TabsContent>
        </Tabs>
      )}
    </>
  );
}
