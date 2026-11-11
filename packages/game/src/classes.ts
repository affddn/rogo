/** Career spec entries: the ids fight_battle_rate weights power by, and the ic_spec_<id> icons.
 * Names from career_spec / career_info and the English text table. */
export interface SpecInfo {
  id: number;
  name: string;
  line: string;
  jobs: string;
  damage: "physical" | "magic";
  /** the game's Recommended Allocation ratio: STR, AGI, VIT, INT, DEX, LUK (career_spec.recommendRefRatio) */
  recommend: [number, number, number, number, number, number];
}

export const SPECS: SpecInfo[] = [
  {
    id: 11,
    name: "Novice",
    line: "Novice",
    jobs: "Novice",
    damage: "physical",
    recommend: [2, 2, 0, 0, 0, 0],
  },
  {
    id: 21,
    name: "Agi Sword",
    line: "Swordsman",
    jobs: "Swordsman → Knight → Lord Knight → Rune Knight",
    damage: "physical",
    recommend: [2, 2, 0, 0, 0, 0],
  },
  {
    id: 22,
    name: "Spear Knight",
    line: "Swordsman",
    jobs: "Swordsman → Knight → Lord Knight → Rune Knight",
    damage: "physical",
    recommend: [2, 0, 0, 0, 2, 0],
  },
  {
    id: 31,
    name: "Fire Mage",
    line: "Magician",
    jobs: "Magician → Wizard → High Wizard → Arch Mage",
    damage: "magic",
    recommend: [0, 0, 0, 2, 0, 2],
  },
  {
    id: 32,
    name: "Ice Mage",
    line: "Magician",
    jobs: "Magician → Wizard → High Wizard → Arch Mage",
    damage: "magic",
    recommend: [0, 0, 0, 2, 2, 0],
  },
  {
    id: 41,
    name: "Falcon Hunter",
    line: "Archer",
    jobs: "Archer → Hunter → Sniper → Ranger",
    damage: "physical",
    recommend: [0, 2.5, 0, 0, 2, 1],
  },
  {
    id: 51,
    name: "Crit Pierce",
    line: "Thief",
    jobs: "Thief → Assassin → Assassin Cross → Guillotine Cross",
    damage: "physical",
    recommend: [2, 1, 0, 0, 0, 2.5],
  },
];

export const specInfo = (id: number) => SPECS.find((s) => s.id === id);
export const specName = (id: number) => {
  const s = specInfo(id);
  return s ? `${s.line} · ${s.name}` : `Spec ${id}`;
};
