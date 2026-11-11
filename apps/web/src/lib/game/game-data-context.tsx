import { createContext, useContext, useMemo, type ReactNode } from "react";
import { useProfile } from "./profile-context";
import { REFERENCE } from "@rogo/game/reference";
import { estimateAll, type StageEstimate } from "@rogo/game/stage";
import type { GameData, Stage } from "@rogo/game/types";

interface Ctx {
  data: GameData;
  stageById: Map<string, Stage>;
  /** Estimates in stage order: for the active character, or for the reference build until one exists.
   * Only read `progress` when `personal` is true. */
  estimates: StageEstimate[];
  estimateById: Map<string, StageEstimate>;
  personal: boolean;
}

const GameDataContext = createContext<Ctx | null>(null);

export function GameDataProvider({ data, children }: { data: GameData; children: ReactNode }) {
  const { profile } = useProfile();
  const stageById = useMemo(() => new Map(data.stages.map((s) => [s.id, s])), [data]);
  const estimates = useMemo(() => estimateAll(profile ?? REFERENCE, data.stages), [profile, data]);
  const estimateById = useMemo(() => new Map(estimates.map((e) => [e.id, e])), [estimates]);
  const value = useMemo(
    () => ({ data, stageById, estimates, estimateById, personal: !!profile }),
    [data, stageById, estimates, estimateById, profile],
  );
  return <GameDataContext.Provider value={value}>{children}</GameDataContext.Provider>;
}

export function useGame(): Ctx {
  const ctx = useContext(GameDataContext);
  if (!ctx) throw new Error("useGame needs GameDataProvider");
  return ctx;
}
