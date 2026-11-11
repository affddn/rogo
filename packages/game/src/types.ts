import type { AttrTransfer } from "./attributes";
import type { Card } from "./cards";

export interface Enemy {
  id: number;
  count: number;
  spawnAt: number;
  spawnOver: number;
  hpBar: boolean;
  boss: boolean;
  patk: number;
  matk: number;
  pdef: number;
  mdef: number;
  hp: number;
  pveDmg: number;
  dmgUp: number;
  dmgRed: number;
  finalUp: number;
  finalRed: number;
  hit: number;
  flee: number;
}

export interface Stage {
  id: string;
  entry: number;
  chapter: number;
  index: number;
  chapterBoss: boolean;
  time: number;
  maxOnField: number;
  idleExp: [number, number];
  minPower: number;
  enemies: Enemy[];
}

export interface Monster {
  name: string;
  tags: number[];
  head: number;
  element: number;
  damageType: number;
  base: { patk: number; matk: number; pdef: number; mdef: number; hp: number };
  skills: number[];
  skillInfo: { id: number; name: string; desc: string; cd: number; active: boolean }[];
  /** soldier_tag names: Monster, Boss, Mini, Mvp, Elite, ... */
  tagNames: string[];
}

export interface Attr {
  key: string;
  name: string;
  desc: string;
  template: number;
  params: number[];
  /** display style: 0 whole number, 1 percent, 4 two decimals */
  show: 0 | 1 | 4;
  min: number | null;
  max: number | null;
}

export interface BattleRateRow {
  attr: number;
  layer: number;
  base: number;
  weights: Record<string, number>;
}

export interface FormulaParam {
  [kind: string]: Record<string, unknown>;
}

export interface Formula {
  id: number;
  key: string;
  cn: string;
  template: number;
  params: FormulaParam[];
}

export interface GameData {
  attrTransfer: AttrTransfer;
  cards: Card[];
  stages: Stage[];
  monsters: Record<string, Monster>;
  attrs: Record<string, Attr>;
  chapters: Record<string, string>;
  battleRate: BattleRateRow[];
  formulas: { formulas: Formula[]; templates: Record<string, { key: string; desc: string }> };
}
