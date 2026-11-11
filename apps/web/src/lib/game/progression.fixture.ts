// Test-only fake game for the progression job. It has exactly the shape progression.tla models:
// two class lines (line 1 with specs 21/22, line 2 with spec 31), campaign stages, chores (claims)
// and dailies (sweeps). Not imported by app code.
import type { Run, Scan, Selection, Step } from "./daily-types.ts";

export type Build = [line: number, spec: number];
export type Outcome = "ok" | "win" | "lose" | "reject" | "skip" | "halt" | "unknown";
export const careerOf = (line: number) => (line === 1 ? 211 : 311);
export const lineKind = (line: number) => (line === 1 ? 200 : 300);
export const specOf = ([line, spec]: Build) => (line === 1 ? (spec === 1 ? 21 : 22) : 31);
export const buildOfSpec = (id: number): Build =>
  id === 21 ? [1, 1] : id === 22 ? [1, 2] : [2, 1];
export const buildOfCareer = (career: number): Build => (career === 211 ? [1, 1] : [2, 1]);
export const BUILDS: Build[] = [
  [1, 1],
  [1, 2],
  [2, 1],
];
const id = (b: Build) => b.join(",");

export class FakeGame {
  stage = 1;
  build: Build = [1, 1];
  // Power bands (each well over the lever re-arm rise) and small rises within a band.
  pw = 0;
  nudge = 0;
  rebuilt = new Set<string>();
  // Builds ("line,spec") whose scan reports no allocated skills.
  skillless = new Set<string>();
  // Opt-in: like the live server, a scan's login-data read settles idle time as offline income
  // every `settleEvery` scans; `onSettle` lets a test raise power with it.
  settleEvery = 0;
  // Opt-in: the server day rolls over at this time (ms, Date.now clock), then every 24 h.
  dayEndAt: number | null = null;
  settlements = 0;
  onSettle: (game: FakeGame) => void = () => {};
  // Opt-in: a build switched to for the first time arrives with unused stat and skill points.
  buildChores = false;
  pending = new Map<string, ("stats" | "skills" | "loadout")[]>();
  chores: string[];
  dailies: string[];
  scans = 0;
  sent: string[] = [];
  sessionId = "session";
  // Decides each sent step's outcome; defaults to confirmed, and campaign defeats.
  outcome: (step: Step, game: FakeGame) => Outcome = (s) => (s.command === 5001 ? "lose" : "ok");
  readonly stages: number;
  constructor(stages = 2, chores = 0, dailies = 0) {
    this.stages = stages;
    this.chores = Array.from({ length: chores }, (_, i) => `claim:${i}`);
    this.dailies = Array.from({ length: dailies }, (_, i) => `sweep:${i}`);
  }
  power(b: Build = this.build) {
    // Build and rebuild offsets stay under 10 so tests can read the nudge digit back.
    const extra = 10 * this.nudge + (this.rebuilt.has(id(b)) ? 5 : 0) + (b[0] === 1 ? b[1] : 3);
    return String(10_000 + 1_000 * this.pw + extra);
  }
  // Under 3% of the band: a new fingerprint, but build-change levers stay spent.
  smallRise() {
    this.nudge += 1;
  }
  progress(resetRebuilds = false) {
    this.pw += 1;
    if (resetRebuilds) this.rebuilt.clear();
  }
  steps(): Step[] {
    const steps: Step[] = [];
    const b = this.build;
    for (const key of this.chores)
      steps.push({ key, revision: "r", kind: "claim", command: 4223, title: key, detail: "" });
    if (this.stage <= this.stages)
      steps.push({
        key: `fight:5001:${this.stage}`,
        revision: `s${this.stage}`,
        kind: "fight",
        command: 5001,
        title: `Campaign boss ${this.stage}`,
        detail: "",
        autoGroup: "campaign",
        available: 1,
        stageEntry: 100 + this.stage,
        nextStage: 101 + this.stage,
      });
    const dev = (type: "rebuild" | "spec" | "class", to: Build) => ({
      type,
      line: lineKind(to[0]),
      career: careerOf(to[0]),
      spec: specOf(to),
    });
    if (!this.rebuilt.has(id(b)))
      steps.push({
        key: `build:4529:R${specOf(b)}`,
        revision: `p${this.pw}`,
        kind: "build",
        command: 4529,
        title: `Rebuild ${specOf(b)}`,
        detail: "",
        development: dev("rebuild", b),
      });
    for (const other of BUILDS) {
      if (other[0] === b[0] && other[1] !== b[1])
        steps.push({
          key: `build:4523:S${specOf(other)}`,
          revision: "r",
          kind: "build",
          command: 4523,
          title: `Activate ${specOf(other)}`,
          detail: "",
          development: dev("spec", other),
        });
      if (other[0] !== b[0] && other[1] === 1)
        steps.push({
          key: `build:4521:L${other[0]}`,
          revision: "r",
          kind: "build",
          command: 4521,
          title: `Switch class to line ${other[0]}`,
          detail: "",
          development: dev("class", other),
        });
    }
    // The planner offers equipping only after the skill points are confirmed.
    const chores = this.pending.get(id(b)) ?? [];
    const codes = { stats: [4529, "A"], skills: [4525, "K"], loadout: [4533, "Q"] } as const;
    for (const type of chores) {
      if (type === "loadout" && chores.includes("skills")) continue;
      const [command, tag] = codes[type];
      steps.push({
        key: `build:${command}:${tag}${specOf(b)}`,
        revision: "r",
        kind: "build",
        command,
        title: `${type} ${specOf(b)}`,
        detail: "",
        development: { type, line: lineKind(b[0]), career: careerOf(b[0]), spec: specOf(b) },
      });
    }
    for (const key of this.dailies)
      steps.push({
        key,
        revision: "r",
        kind: "sweep",
        command: 5011,
        title: key,
        detail: "",
        autoGroup: `realm:${key}`,
        available: 1,
      });
    return steps;
  }
  scan(): Scan {
    this.scans += 1;
    let offline: Scan["character"]["offline"] = null;
    if (this.settleEvery && this.scans % this.settleEvery === 0) {
      this.settlements += 1;
      this.onSettle(this);
      offline = { duration: 60, max: 43_200, items: 3, levelBefore: 50, levelAfter: 50 };
    }
    const b = this.build;
    return {
      scanId: `scan-${this.scans}`,
      sessionId: this.sessionId,
      checkedAt: 1_000_000,
      nextDayIn: this.nextDayIn(),
      character: {
        id: "1",
        name: "Fixture",
        realm: "realm",
        level: 50,
        power: this.power(),
        offline,
        build: {
          career: careerOf(b[0]),
          spec: specOf(b),
          line: lineKind(b[0]),
          className: "Class",
          specName: "Spec",
          freePoints: 0,
          stats: this.rebuilt.has(id(b)) ? [9, 9, 0, 0, 0, 0] : [5, 5, 0, 0, 0, 0],
          skillLevels:
            this.skillless.has(id(b)) || this.pending.get(id(b))?.includes("skills") ? 0 : 5,
          choices: [],
        },
      },
      steps: this.steps(),
      warnings: [],
      maxSteps: 24,
    };
  }
  nextDayIn() {
    if (this.dayEndAt === null) return null;
    while (this.dayEndAt <= Date.now()) this.dayEndAt += 86_400_000;
    return Math.ceil((this.dayEndAt - Date.now()) / 1000);
  }
  review(selection: Selection) {
    const step = this.steps().find((s) => s.key === selection.keys[0]);
    if (!step) throw new Error("routine_invalid_selection");
    return { steps: [step], normalized: selection };
  }
  // Removes a chore or daily the job will not be offered again (confirmed, skipped or blocked).
  drop(key: string) {
    this.chores = this.chores.filter((k) => k !== key);
    this.dailies = this.dailies.filter((k) => k !== key);
  }
  run(selection: Selection): Run {
    const step = this.steps().find((s) => s.key === selection.keys[0])!;
    this.sent.push(step.key);
    const result = this.outcome(step, this);
    const receipt: Run["receipts"][number] = {
      title: step.title,
      command: step.command,
      status: "confirmed",
    };
    if (result === "unknown" || result === "halt") {
      receipt.status = result === "unknown" ? "unknown" : "stopped";
      return { receipts: [receipt], notRun: 0 };
    }
    if (result !== "ok" && result !== "win" && result !== "lose") {
      receipt.status = result === "reject" ? "rejected" : "skipped";
      this.drop(step.key);
      return { receipts: [receipt], notRun: 0 };
    }
    if (step.command === 5001) {
      receipt.won = result === "win";
      if (receipt.won) this.stage += 1;
    } else if (step.development) {
      const d = step.development;
      if (d.type === "rebuild") this.rebuilt.add(id(this.build));
      else if (d.type === "stats" || d.type === "skills" || d.type === "loadout") {
        const left = (this.pending.get(id(this.build)) ?? []).filter((t) => t !== d.type);
        this.pending.set(id(this.build), left);
      } else {
        this.build = buildOfSpec(d.spec);
        if (this.buildChores && !this.pending.has(id(this.build)))
          this.pending.set(id(this.build), ["stats", "skills", "loadout"]);
        receipt.buildState = { career: d.career, spec: d.spec };
      }
    } else this.drop(step.key);
    return { receipts: [receipt], notRun: 0 };
  }
}
