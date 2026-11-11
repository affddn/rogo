import { useEffect, useState } from "react";
import type { GameData } from "@rogo/game/types";

const FILES = {
  stages: "stages",
  monsters: "monsters",
  attrs: "attrs",
  chapters: "chapters",
  battleRate: "battle-rate",
  formulas: "formulas",
  attrTransfer: "attr-transfer",
  cards: "cards",
} as const;

let cache: Promise<GameData> | null = null;

export function loadGameData(): Promise<GameData> {
  cache ??= Promise.all(
    Object.entries(FILES).map(async ([key, file]) => {
      const res = await fetch(`${import.meta.env.BASE_URL}data/${file}.json`);
      if (!res.ok) throw new Error(`Couldn't load data/${file}.json (HTTP ${res.status})`);
      return [key, await res.json()] as const;
    }),
  ).then((pairs) => Object.fromEntries(pairs) as unknown as GameData);
  return cache;
}

export type Loaded<T> =
  | { status: "loading" }
  | { status: "error"; error: string }
  | { status: "ready"; data: T };

export function useGameData(): Loaded<GameData> {
  const [state, setState] = useState<Loaded<GameData>>({ status: "loading" });
  useEffect(() => {
    let live = true;
    loadGameData().then(
      (data) => live && setState({ status: "ready", data }),
      (e: unknown) => live && setState({ status: "error", error: String(e) }),
    );
    return () => {
      live = false;
    };
  }, []);
  return state;
}

export function stageName(data: GameData, id: string): string {
  const [c, s] = id.split("-");
  return `${c}.${data.chapters[c] ?? "Chapter " + c}-${s}`;
}
