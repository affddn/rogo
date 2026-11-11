// Characters: creating one from a few numbers, migrating saved ones, and share links.
import { recommended, spentCost, type AttrTransfer, type Six } from "@rogo/game/attributes";
import { specInfo } from "@rogo/game/classes";
import { computePower, solveSkillPower } from "@rogo/game/power";
import type { Profile, Stats } from "@rogo/game/profile";
import { REFERENCE } from "@rogo/game/reference";
import type { BattleRateRow } from "@rogo/game/types";

export const newId = () => Math.random().toString(36).slice(2, 10);

/** Flat stats: the ones that grow with gear and levels and carry the power formula's first layer. */
const FLAT: (keyof Stats)[] = [
  "patk",
  "matk",
  "pdef",
  "mdef",
  "hp",
  "refinePatk",
  "refinePdef",
  "refineMatk",
  "refineMdef",
];

/** Attribute points a character has at a base level (all spent and unspent, in cost units). */
export const pointsAt = (t: AttrTransfer, level: number) =>
  t.pointsByLevel[String(Math.min(120, Math.max(1, Math.round(level))))] ?? 0;

export const freePoints = (t: AttrTransfer, level: number, alloc: Six) =>
  Math.max(0, pointsAt(t, level) - spentCost(alloc));

/** Stats for a character we only know the class and power of: the reference build's stat mix, with attack and
 * damage-type boosts moved to the class's damage type, and flat stats scaled until the power formula
 * gives the entered power. Power is linear in flat stats, so one ratio does it. */
export function estimateStats(rows: BattleRateRow[], spec: number, power: number): Stats {
  const ex = REFERENCE.stats;
  const s: Stats = { ...ex };
  if (specInfo(spec)?.damage === "magic") {
    s.patk = ex.matk;
    s.matk = ex.patk;
    s.refinePatk = ex.refineMatk;
    s.refineMatk = ex.refinePatk;
    s.physBoost = ex.magicBoost;
    s.magicBoost = ex.physBoost;
  }
  const skill = solveSkillPower(rows, REFERENCE.spec, ex, REFERENCE.power);
  const now = computePower(rows, spec, s, skill).power;
  const g = now > 0 && power > 0 ? power / now : 1;
  for (const k of FLAT) s[k] = Math.round(s[k] * g);
  return s;
}

export interface QuickSetup {
  name: string;
  spec: number;
  level: number;
  power: number;
  cleared: string;
}

/** A new character from the quick-setup fields: estimated stats and the game's Recommended allocation. */
export function createCharacter(q: QuickSetup, rows: BattleRateRow[], t: AttrTransfer): Profile {
  const info = specInfo(q.spec);
  const budget = pointsAt(t, q.level);
  const alloc = recommended(info?.recommend ?? [1, 1, 1, 1, 1, 1], budget);
  return {
    id: newId(),
    name: q.name.trim() || `${info?.name ?? "New"} character`,
    spec: q.spec,
    level: q.level,
    power: q.power,
    damage: info?.damage ?? "physical",
    statsSource: "estimated",
    stats: estimateStats(rows, q.spec, q.power),
    attributes: {
      base: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 },
      alloc,
      free: Math.max(0, budget - spentCost(alloc)),
    },
    normalShare: 0.5,
    progress: { cleared: q.cleared, stuck: null },
    cards: {},
    skills: {},
  };
}

/** A character read from storage, a file or a share link, with any missing field filled in. */
export function migrate(raw: unknown): Profile | null {
  if (!raw || typeof raw !== "object") return null;
  const p = raw as Partial<Profile>;
  if (typeof p.spec !== "number" || typeof p.power !== "number") return null;
  const level = p.level ?? 1;
  return {
    id: typeof p.id === "string" && p.id !== REFERENCE.id ? p.id : newId(),
    name: p.name ?? "Character",
    spec: p.spec,
    level,
    power: p.power,
    damage: p.damage ?? specInfo(p.spec)?.damage ?? "physical",
    statsSource: p.statsSource ?? "entered",
    stats: { ...REFERENCE.stats, ...p.stats },
    attributes: p.attributes ?? {
      base: { str: 1, agi: 1, vit: 1, int: 1, dex: 1, luk: 1 },
      alloc: { str: 0, agi: 0, vit: 0, int: 0, dex: 0, luk: 0 },
      free: 0,
    },
    normalShare: p.normalShare ?? 0.5,
    progress: p.progress ?? { cleared: "", stuck: null },
    cards: p.cards && typeof p.cards === "object" ? p.cards : {},
    skills: p.skills && typeof p.skills === "object" ? p.skills : {},
  };
}

// Share links carry the character in the URL fragment, which never reaches a server.
const toBase64Url = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

const fromBase64Url = (s: string) =>
  new TextDecoder().decode(
    Uint8Array.from(atob(s.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0)),
  );

export function shareUrl(p: Profile): string {
  const { id: _id, ...rest } = p;
  const url = new URL(window.location.href);
  url.hash = `character=${toBase64Url(JSON.stringify(rest))}`;
  return url.toString();
}

/** The character in a share link's fragment, or null. */
export function readShared(hash: string): Profile | null {
  const m = /character=([\w-]+)/.exec(hash);
  if (!m) return null;
  try {
    return migrate(JSON.parse(fromBase64Url(m[1])));
  } catch {
    return null;
  }
}
