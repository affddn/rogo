import { computePower, solveSkillPower } from "./power";
import { work } from "./stage";
import type { Profile, Stats } from "./profile";
import type { BattleRateRow, Stage } from "./types";

export interface Upgrade {
  id: string;
  label: string;
  /** what the upgrade looks like in game terms */
  detail: string;
  apply: (s: Stats) => Partial<Stats>;
}

/** Typical single steps a player can take, sized to be roughly comparable. */
export function upgradesFor(profile: Profile): Upgrade[] {
  const phys = profile.damage === "physical";
  const atk = phys ? "patk" : "matk";
  const ratk = phys ? "refinePatk" : "refineMatk";
  const typed = phys ? "physBoost" : "magicBoost";
  const atkLabel = phys ? "PATK" : "MATK";
  return [
    {
      id: "atk",
      label: `+10% ${atkLabel}`,
      detail: "gear, enhance, cards with flat ATK",
      apply: (s) => ({ [atk]: s[atk] * 1.1 }),
    },
    {
      id: "ratk",
      label: `+2,000 Refine ${atkLabel}`,
      detail: "refining weapon and gear",
      apply: (s) => ({ [ratk]: s[ratk] + 2000 }),
    },
    {
      id: "dmg",
      label: "+5% DMG Boost",
      detail: "cards, awakening, collection bonuses",
      apply: (s) => ({ dmgBoost: s.dmgBoost + 0.05 }),
    },
    {
      id: "typed",
      label: `+5% ${phys ? "Physical" : "Magic"} DMG Boost`,
      detail: "class-type boosts",
      apply: (s) => ({ [typed]: s[typed] + 0.05 }),
    },
    {
      id: "normal",
      label: "+5% Normal Attack DMG Boost",
      detail: "helps auto-attack builds",
      apply: (s) => ({ normalAtkBoost: s.normalAtkBoost + 0.05 }),
    },
    {
      id: "skill",
      label: "+5% Skill DMG Boost",
      detail: "helps skill builds",
      apply: (s) => ({ skillBoost: s.skillBoost + 0.05 }),
    },
    {
      id: "minion",
      label: "+5% Normal Monster DMG UP",
      detail: "waves are most of a stage's HP",
      apply: (s) => ({ minionUp: s.minionUp + 0.05 }),
    },
    {
      id: "boss",
      label: "+5% Boss DMG UP",
      detail: "boss group and chapter bosses",
      apply: (s) => ({ bossUp: s.bossUp + 0.05 }),
    },
    {
      id: "final",
      label: "+5% Final DMG Boost",
      detail: "rare; its own layer",
      apply: (s) => ({ finalDmgBoost: s.finalDmgBoost + 0.05 }),
    },
    {
      id: "hp",
      label: "+10% Max HP",
      detail: "survival only; no damage",
      apply: (s) => ({ hp: s.hp * 1.1 }),
    },
  ];
}

export interface UpgradeResult {
  upgrade: Upgrade;
  /** how much less work the target stage takes, as a damage-equivalent gain (0.1 = 10% more damage) */
  damageGain: number;
  /** how much power the game would show for it */
  powerGain: number;
  /** new share of the target stage you get through */
  progress: number;
}

export function rankUpgrades(
  profile: Profile,
  stage: Stage,
  cap: number,
  rows: BattleRateRow[],
): UpgradeResult[] {
  const before = work(profile, stage);
  const skillPower = solveSkillPower(rows, profile.spec, profile.stats, profile.power);
  const p0 = computePower(rows, profile.spec, profile.stats, skillPower).power;
  return upgradesFor(profile)
    .map((upgrade) => {
      const stats = { ...profile.stats, ...upgrade.apply(profile.stats) };
      const next = { ...profile, stats };
      const after = work(next, stage);
      const p1 = computePower(rows, profile.spec, stats, skillPower).power;
      return {
        upgrade,
        damageGain: before / after - 1,
        powerGain: p0 ? p1 / p0 - 1 : 0,
        progress: cap ? Math.min(1, cap / after) : 0,
      };
    })
    .sort((a, b) => b.damageGain - a.damageGain);
}
