const compact = new Intl.NumberFormat("en", { notation: "compact", maximumFractionDigits: 1 });
const whole = new Intl.NumberFormat("en", { maximumFractionDigits: 0 });

/** 8380700 -> "8.4M", matching how the game abbreviates. */
export const short = (n: number) => (Number.isFinite(n) ? compact.format(n) : "–");
export const full = (n: number) => (Number.isFinite(n) ? whole.format(n) : "–");
export const pct = (n: number, digits = 1) =>
  Number.isFinite(n) ? `${(n * 100).toFixed(digits)}%` : "–";
export const fixed = (n: number, digits = 2) => (Number.isFinite(n) ? n.toFixed(digits) : "–");
export const mult = (n: number) => (Number.isFinite(n) ? `×${n.toFixed(3)}` : "–");

const SUFFIX: Record<string, number> = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };

/** "8,380,700", "8.38M" or "120k" -> a number; NaN when it isn't one. */
export function parseAmount(text: string): number {
  const m = /^\s*([0-9][0-9,]*(?:\.[0-9]+)?|\.[0-9]+)\s*([kmbt])?\s*$/i.exec(text);
  if (!m) return Number.NaN;
  return Number(m[1].replaceAll(",", "")) * (m[2] ? SUFFIX[m[2].toLowerCase()] : 1);
}
