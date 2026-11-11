// Skill build arithmetic: a damage rate for a set of skill levels, and which next point raises it most.
// Rate = Σ over auto-cast active skills of coef ÷ max(cooldown, cast + animation) + normal attack coef × ATK Freq,
// all against one lone target. It ignores that only one action runs at a time and that normal attacks and skills
// use different damage pools, so read it as a ranking of skill points, not as real damage.
import {
  castTime,
  collectMods,
  evalSkill,
  skillCdUnder,
  skillCooldown,
  type SkillsData,
} from "./data/skills";

export interface SkillRate {
  skill: number;
  coef: number;
  period: number;
  rate: number;
}

export function buildRate(
  d: SkillsData,
  spec: number,
  levels: Record<string, number>,
  haste: number,
  atkFreq: number,
): { total: number; parts: SkillRate[] } {
  const tree = d.specs[spec];
  if (!tree) return { total: 0, parts: [] };
  const lv: Record<number, number> = {};
  for (const [k, v] of Object.entries(levels)) if (v > 0) lv[Number(k)] = v;
  if (tree.normal) lv[tree.normal] = Math.max(1, lv[tree.normal] ?? 0);
  const mods = collectMods(d, lv);
  const parts: SkillRate[] = [];
  for (const [id, level] of Object.entries(lv)) {
    const s = d.skills[id];
    if (!s || level <= 0) continue;
    const ev = evalSkill(d, Number(id), mods);
    if (!ev || !ev.coef) continue;
    if (s.spell === 1 || Number(id) === tree.normal) {
      parts.push({
        skill: Number(id),
        coef: ev.coef,
        period: 1 / atkFreq,
        rate: ev.coef * atkFreq,
      });
      continue;
    }
    if (s.spell !== 2) continue;
    const cd = skillCooldown(skillCdUnder(d, Number(id), mods), haste);
    const busy = castTime(s.sing, haste) + (s.anim ?? 0);
    const period = Math.max(cd, busy, 0.5);
    parts.push({ skill: Number(id), coef: ev.coef, period, rate: ev.coef / period });
  }
  return { total: parts.reduce((a, p) => a + p.rate, 0), parts };
}

export interface NextPoint {
  skill: number;
  from: number;
  gain: number;
}

/** Every skill that can take one more point (max not reached, prerequisite met), by how much it raises the rate. */
export function nextPoints(
  d: SkillsData,
  spec: number,
  levels: Record<string, number>,
  haste: number,
  atkFreq: number,
): NextPoint[] {
  const tree = d.specs[spec];
  if (!tree) return [];
  const base = buildRate(d, spec, levels, haste, atkFreq).total;
  const out: NextPoint[] = [];
  for (const n of tree.nodes) {
    const cur = levels[n.skill] ?? 0;
    if (cur >= n.max) continue;
    if (n.front && (levels[n.front[0]] ?? 0) < n.front[1]) continue;
    const next = buildRate(d, spec, { ...levels, [n.skill]: cur + 1 }, haste, atkFreq).total;
    out.push({ skill: n.skill, from: cur, gain: base ? next / base - 1 : next });
  }
  return out.sort((a, b) => b.gain - a.gain);
}
