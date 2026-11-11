export type CharacterBuild = {
  career: number;
  spec: number;
  line: number;
  className: string;
  specName: string;
  freePoints: number;
  // Active build's primary allocation (STR..LUK) and summed skill levels; older helpers omit them.
  stats?: number[] | null;
  skillLevels?: number | null;
  // Unspent skill points and the five loadout slots (0 = empty); null when the build can't be read.
  freeSkillPoints?: number | null;
  loadout?: number[] | null;
  choices: {
    spec: number;
    line: number;
    name: string;
    available: boolean;
    reason?: string | null;
  }[];
};
export type Development = {
  type: "class" | "advance" | "spec" | "stats" | "rebuild" | "skills" | "loadout";
  line: number;
  career: number;
  spec: number;
  stats?: { name: string; before: number; after: number }[];
  totalPoints?: number;
  usedPoints?: number;
  // "skills": per-skill level changes and the unchanged loadout sent with them.
  skills?: { entry: number; name: string; before: number; after: number }[];
  slots?: number[];
  // "loadout": slots before and after, and the names of skills newly equipped.
  before?: number[];
  after?: number[];
  names?: string[];
};
export type Step = {
  key: string;
  revision: string;
  kind: "claim" | "sweep" | "fight" | "duel" | "offer" | "build" | "assist" | "idle";
  command: number;
  title: string;
  detail: string;
  powerRatio?: number | null;
  autoGroup?: string | null;
  available?: number | null;
  development?: Development | null;
  stageEntry?: number | null;
  nextStage?: number | null;
  assist?: { type: "watch" | "join"; day: string; used: number } | null;
  // Session-timed idle income (battery-saving mirror) or the free Quick Idle; progression job only.
  idle?:
    | { type: "online"; ticks: number }
    | { type: "fast"; freeBefore: number; paidBefore: number }
    | null;
};
export type Scan = {
  scanId: string;
  sessionId: string;
  checkedAt: number;
  character: {
    id: string;
    name: string;
    realm: string;
    level: number;
    power: string;
    build?: CharacterBuild | null;
  };
  steps: Step[];
  warnings: string[];
  maxSteps: number;
  dungeon?: {
    day: string | null;
    used: number;
    reserved: number;
    remaining: number;
    watching: boolean;
    eligible: boolean;
    reason?: string | null;
    uncertain?: boolean;
  } | null;
};
export type Selection = { scanId: string; keys: string[] };
export type Review = { ticket: string; normalized: Selection; steps: Step[] };
export type Reward = { items?: { entry: number; count?: string }[]; [kind: string]: unknown };
export type Receipt = {
  title: string;
  command: number;
  status: "confirmed" | "skipped" | "rejected" | "stopped" | "unknown";
  reply?: number;
  rewards?: Record<string, Reward>;
  won?: boolean;
  note?: string;
  score?: string;
  rank?: number;
  assists?: number;
  cleanupUncertain?: boolean;
  buildState?: { career: number; spec: number };
  substeps?: { command: number; reply: number; status: "confirmed" }[];
  idle?: { times?: number; kills?: number; pending?: number; freeUsed?: number; paidUsed?: number };
  idleDuration?: number;
  level?: { before?: number; after?: number } | null;
};
export type Run = { receipts: Receipt[]; notRun: number };
