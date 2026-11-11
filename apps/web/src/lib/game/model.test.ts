import { readFileSync } from "node:fs";
import { describe, expect, it } from "vite-plus/test";
import { hit } from "@rogo/game/damage";
import { computePower, solveSkillPower } from "@rogo/game/power";
import {
  applyAllocation,
  pointCost,
  recommended,
  spentCost,
  derive,
  totals,
  type AttrTransfer,
} from "@rogo/game/attributes";
import { withAttrs, type Card } from "@rogo/game/cards";
import { REFERENCE } from "@rogo/game/reference";
import { createCharacter, estimateStats, migrate, readShared } from "./characters";
import { calibrationOf, estimateAll } from "@rogo/game/stage";
import { SPECS } from "@rogo/game/classes";
import type { BattleRateRow, Stage } from "@rogo/game/types";

const load = <T>(name: string): T =>
  JSON.parse(
    readFileSync(new URL(`../../../public/data/${name}.json`, import.meta.url), "utf8"),
  ) as T;
const stages = load<Stage[]>("stages");
const battleRate = load<BattleRateRow[]>("battle-rate");
const transfer = load<AttrTransfer>("attr-transfer");
const cards = load<Card[]>("cards");
const p = REFERENCE;
const stageById = new Map(stages.map((s) => [s.id, s]));

describe("damage", () => {
  it("matches the live 6-10 fight: predicted ~100.1K, the game showed 101.5K", () => {
    const mob = stages.find((s) => s.id === "6-10")!.enemies.find((e) => !e.boss)!;
    expect(hit(p, mob).normal).toBeCloseTo(100_100, -3);
  });
});

describe("power", () => {
  it("reproduces the shown power once the hidden skill term is solved", () => {
    const skill = solveSkillPower(battleRate, p.spec, p.stats, p.power);
    expect(skill).toBeCloseTo(1.03, 1);
    expect(computePower(battleRate, p.spec, p.stats, skill).power).toBeCloseTo(p.power, 0);
  });
});

describe("attribute points", () => {
  it("costs floor(n/5)+1 per point: the reference AGI 57 / DEX 46 / LUK 23 is 654 units", () => {
    expect(pointCost(5)).toBe(5);
    expect(pointCost(6)).toBe(7);
    expect(spentCost(p.attributes.alloc)).toBe(654);
    // 654 spent + 26 free = the 680 a level-55 character earns
    expect(spentCost(p.attributes.alloc) + p.attributes.free).toBe(transfer.pointsByLevel["55"]);
  });

  it("reproduces the game's Recommended Allocation for the Archer", () => {
    const archer = SPECS.find((s) => s.id === 41)!;
    expect(recommended(archer.recommend, 654)).toMatchObject({ agi: 57, dex: 46, luk: 23 });
  });

  it("derives the shown Final PATK and Aspd from the primary stats", () => {
    const d = derive(transfer, 41, totals(p.attributes));
    expect(d.patkL6).toBeCloseTo(0.102, 6); // Final PATK 10.2%
    expect(d.aspdAdd).toBeCloseTo(30.15, 2); // AGI 64
  });

  it("leaves stats unchanged when the allocation doesn't change", () => {
    const s = applyAllocation(transfer, p, p.attributes, p.attributes.alloc);
    expect(s.patk).toBeCloseTo(p.stats.patk, 3);
    expect(s.atkFreq).toBeCloseTo(p.stats.atkFreq, 6);
  });
});

describe("cards", () => {
  it("adds a weapon card's flat PATK through the PATK % layers", () => {
    const hornet = cards.find((c) => c.name === "Hornet Card")!;
    const s = withAttrs(transfer, p, p.attributes, hornet.stars[0].equip);
    // +40 PATK x (1 + DEX 51%) x (1 + 10.2%) plus +1 STR (nothing for archers)
    expect(s.patk - p.stats.patk).toBeCloseTo(40 * 1.51 * 1.102, 1);
  });
});

describe("characters", () => {
  it("estimates stats that reproduce the entered power, for physical and magic classes", () => {
    for (const spec of [21, 31, 41, 51]) {
      const s = estimateStats(battleRate, spec, 2_000_000);
      const skill = solveSkillPower(battleRate, 41, p.stats, p.power);
      expect(computePower(battleRate, spec, s, skill).power / 2_000_000).toBeCloseTo(1, 2);
    }
    const mage = estimateStats(battleRate, 31, 2_000_000);
    expect(mage.matk).toBeGreaterThan(mage.patk);
  });

  it("gives a new character the Recommended allocation for its level", () => {
    const c = createCharacter(
      { name: "", spec: 41, level: 55, power: p.power, cleared: "6-9" },
      battleRate,
      transfer,
    );
    // all 680 points at level 55, where the example had spent 654
    expect(c.attributes.alloc).toMatchObject({ agi: 58, dex: 47, luk: 23 });
    expect(spentCost(c.attributes.alloc) + c.attributes.free).toBe(680);
    expect(c.statsSource).toBe("estimated");
  });

  it("fills in missing fields of an imported character and never reuses the reference id", () => {
    const c = migrate({ spec: 31, power: 1_000_000 })!;
    expect(c.progress).toEqual({ cleared: "", stuck: null });
    expect(c.damage).toBe("magic");
    expect(migrate({ ...p })!.id).not.toBe("reference");
    expect(migrate({ name: "no class" })).toBeNull();
  });

  it("reads a character back from a share link", () => {
    const json = JSON.stringify({ ...p, name: "Shared" });
    const hash = `#character=${Buffer.from(json).toString("base64url")}`;
    expect(readShared(hash)?.name).toBe("Shared");
    expect(readShared("#nothing")).toBeNull();
  });
});

describe("stage model", () => {
  it("calibrates from a lost fight, a furthest clear, or the reference build", () => {
    expect(calibrationOf(p, stageById)?.source).toBe("fight");
    const cleared = { ...p, progress: { cleared: "6-9", stuck: null } };
    expect(calibrationOf(cleared, stageById)?.source).toBe("cleared");
    const none = { ...p, progress: { cleared: "", stuck: null } };
    const ref = calibrationOf(none, stageById)!;
    expect(ref.source).toBe("reference");
    expect(ref.cap).toBeCloseTo(calibrationOf(p, stageById)!.cap, 6);
  });

  it("puts a furthest clear inside the stages the model says you clear", () => {
    const cleared = { ...p, progress: { cleared: "6-9", stuck: null } };
    const est = new Map(estimateAll(cleared, stages).map((e) => [e.id, e]));
    expect(est.get("6-9")!.progress).toBe(1);
    expect(est.get("6-10")!.progress).toBeLessThan(1);
  });
});

describe("gear ATK %", () => {
  it("shrinks what a point of DEX adds when the weapon already fills the % pool", () => {
    const more = { ...p.attributes.alloc, dex: p.attributes.alloc.dex + 10 };
    const plain = applyAllocation(transfer, p, p.attributes, more).patk / p.stats.patk;
    const geared = { ...p, stats: { ...p.stats, gearAtkPct: 1 } };
    const withGear = applyAllocation(transfer, geared, p.attributes, more).patk / p.stats.patk;
    expect(withGear).toBeLessThan(plain);
    expect(withGear).toBeGreaterThan(1);
  });
});
