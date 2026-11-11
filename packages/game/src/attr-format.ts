// Attribute values as the game prints them (GL/AttrUtils.cs, NumberDisplayTransform.cs):
// show 0 whole numbers (K/M/B past 10,000), 1 percent, 4 two decimals.
import type { Attr } from "./types";

const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const trim = (n: number, d: number) => String(+n.toFixed(d));

export const attrIdOf = (key: string | number) => Number(String(key).split(":")[0]);

export function attrName(attrs: Record<string, Attr>, key: string | number): string {
  const id = attrIdOf(key);
  const a = attrs[id];
  return a?.name || String(key).split(":")[1] || String(id);
}

export function attrValue(attrs: Record<string, Attr>, key: string | number, v: number): string {
  const a = attrs[attrIdOf(key)];
  const show = a?.show ?? (Math.abs(v) < 1 && v !== 0 ? 1 : 0);
  const sign = v < 0 ? "−" : "+";
  const n = Math.abs(v);
  if (show === 1) return `${sign}${trim(n * 100, 2)}%`;
  if (show === 4) return `${sign}${trim(n, 2)}`;
  // whole-number stats are floored, as the game does; values under 1 keep their decimals
  return `${sign}${n >= 10_000 ? compact.format(n) : n >= 1 ? Math.floor(n) : trim(n, 2)}`;
}

/** "PATK +40", "DMG Boost +1.5%" */
export const attrLine = (attrs: Record<string, Attr>, key: string | number, v: number) =>
  `${attrName(attrs, key)} ${attrValue(attrs, key, v)}`;

/** Add `from` into `into` (attr key -> value), optionally scaled. */
export function sumAttrs(
  into: Record<string, number>,
  from: Record<string, number>,
  scale = 1,
): Record<string, number> {
  for (const [k, v] of Object.entries(from)) into[k] = (into[k] ?? 0) + v * scale;
  return into;
}
