import { useId, useState } from "react";
import { UserPlus } from "lucide-react";
import { toast } from "sonner";
import { SpecSelect } from "@/components/character/spec-select";
import { StageField } from "@/components/stage-field";
import { StatField } from "@/components/stat-field";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { createCharacter } from "@/lib/game/characters";
import { useGame } from "@/lib/game/game-data-context";
import { useProfile } from "@/lib/game/profile-context";
import { short } from "@/lib/format";

/** Four numbers every player can read off the main screen; detailed stats can come later. */
export function QuickSetup({ onCreated }: { onCreated?: () => void }) {
  const id = useId();
  const { data, stageById } = useGame();
  const { add } = useProfile();
  const [name, setName] = useState("");
  const [spec, setSpec] = useState(41);
  const [level, setLevel] = useState(30);
  const [power, setPower] = useState(0);
  const [cleared, setCleared] = useState("");
  const levelOk = level >= 1 && level <= 120;
  const ready = power > 0 && levelOk && (cleared === "" || stageById.has(cleared));

  return (
    <Card>
      <CardHeader>
        <CardTitle>Your character</CardTitle>
        <CardDescription>
          Four things from the game's main screen are enough to start. Stats are estimated from your
          power until you enter the real ones from Attribute Details.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          className="form-grid"
          onSubmit={(e) => {
            e.preventDefault();
            if (!ready) return;
            const c = add(
              createCharacter(
                { name, spec, level, power, cleared },
                data.battleRate,
                data.attrTransfer,
              ),
            );
            toast.success(`${c.name} added`, {
              description: `Power ${short(c.power)}. Enter detailed stats any time for exact numbers.`,
            });
            onCreated?.();
          }}
        >
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-name`}>Name</Label>
            <Input
              id={`${id}-name`}
              value={name}
              placeholder="Your character's name"
              autoComplete="off"
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-spec`}>Class build</Label>
            <SpecSelect id={`${id}-spec`} value={spec} onChange={setSpec} />
          </div>
          <div className="grid gap-1.5">
            <Label htmlFor={`${id}-level`}>Base level</Label>
            <Input
              id={`${id}-level`}
              inputMode="numeric"
              className="tabular"
              value={level || ""}
              onChange={(e) => setLevel(Math.floor(Number(e.target.value) || 0))}
              aria-invalid={!levelOk}
              aria-describedby={`${id}-level-hint`}
            />
            <span
              id={`${id}-level-hint`}
              className={`text-xs ${levelOk ? "text-muted-foreground" : "text-destructive"}`}
            >
              {levelOk ? "Sets how many attribute points you have" : "Levels run from 1 to 120."}
            </span>
          </div>
          <StatField
            label="Power"
            unit="flat"
            value={power}
            onChange={setPower}
            plainLabel
            blankZero
            hint="As the game shows it: 8,380,700 or 8.38M both work"
          />
          <StageField
            label="Furthest stage cleared"
            value={cleared}
            onChange={setCleared}
            optional
          />
          <div className="flex items-end md:mt-6">
            <Button type="submit" disabled={!ready} size="lg" className="w-full sm:w-auto">
              <UserPlus aria-hidden /> Create character
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
