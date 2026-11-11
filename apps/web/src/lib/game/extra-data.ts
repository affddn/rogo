// The bigger reference files load on the page that needs them, once, and are shared after that.
import { useEffect, useState } from "react";
import type { ModesData, StageRewardsData } from "@rogo/game/data/content";
import type { EquipmentData } from "@rogo/game/data/equipment";
import type { ItemsFile, ShopsFile, SummonsFile } from "@rogo/game/data/items";
import type { SystemsData } from "@rogo/game/data/systems";
import type { JobsData, SkillsData } from "@rogo/game/data/skills";

const cache = new Map<string, Promise<unknown>>();

function load<T>(file: string, fallback?: T): Promise<T> {
  let p = cache.get(file);
  if (!p) {
    p = fetch(`${import.meta.env.BASE_URL}data/${file}.json`).then((r) => {
      const json = r.headers.get("content-type")?.includes("json");
      if (r.ok && json) return r.json();
      // an optional file that isn't there is an answer, not an error: keep it so nobody asks again.
      // (A dev server answers a missing file with the app's HTML page, hence the type check.)
      if (fallback !== undefined && (r.status === 404 || (r.ok && !json))) return fallback;
      throw new Error(`Couldn't load data/${file}.json (HTTP ${r.status})`);
    });
    // a failed load can be retried by the next page that asks
    p.catch(() => cache.delete(file));
    cache.set(file, p);
  }
  return p as Promise<T>;
}

/** The parsed file, or null while it loads (or if it failed). */
export function useExtra<T>(file: string, fallback?: T): T | null {
  const [data, setData] = useState<T | null>(null);
  useEffect(() => {
    let live = true;
    load<T>(file, fallback).then(
      (d) => live && setData(d),
      () => live && setData(null),
    );
    return () => {
      live = false;
    };
    // fallback is a constant per call site
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [file]);
  return data;
}

export const useSystems = () => useExtra<SystemsData>("systems");
export const useEquipment = () => useExtra<EquipmentData>("equipment");
export const useItems = () => useExtra<ItemsFile>("items");
export const useSummons = () => useExtra<SummonsFile>("summons");
export const useShops = () => useExtra<ShopsFile>("shops");
export const useModes = () => useExtra<ModesData>("modes");
export const useStageRewards = () => useExtra<StageRewardsData>("stage-rewards");
export const useSkills = () => useExtra<SkillsData>("skills");
export const useJobs = () => useExtra<JobsData>("jobs");
/** Which icon files exist under public/game (written by the asset extraction); null until loaded. */
const NO_ICONS: Record<string, (number | string)[]> = {};
export const useAssetIndex = () =>
  useExtra<Record<string, (number | string)[]>>("../game/index", NO_ICONS);
