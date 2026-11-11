export interface RogoCharacter {
  serverId: string;
  playerId: string;
  name: string;
  level: number;
  power: string | null;
  spec: number | null;
  stageEntry: number | null;
  cards: Record<string, number> | null;
  skills: Record<string, number> | null;
}

const object = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);
const integer = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;
const decimal = (v: unknown): v is string => typeof v === "string" && /^\d+$/.test(v);

function levels(value: unknown): Record<string, number> | null {
  if (value === null) return null;
  if (
    !object(value) ||
    !Object.entries(value).every(([id, level]) => decimal(id) && integer(level))
  )
    throw new Error("Invalid levels");
  return Object.fromEntries(Object.entries(value)) as Record<string, number>;
}

// Pick only the fields this screen uses: neither storage nor planner imports receive the raw response.
export function readCharacter(raw: unknown): RogoCharacter {
  if (!object(raw)) throw new Error("Invalid character");
  const { serverId, playerId, name, level, power, spec, stageEntry } = raw;
  if (
    !decimal(serverId) ||
    !decimal(playerId) ||
    typeof name !== "string" ||
    !name.trim() ||
    !integer(level) ||
    !level ||
    (power !== null && !decimal(power)) ||
    (spec !== null && !integer(spec)) ||
    (stageEntry !== null && !integer(stageEntry))
  )
    throw new Error("Invalid character fields");
  return {
    serverId,
    playerId,
    name,
    level,
    power,
    spec,
    stageEntry,
    cards: levels(raw.cards),
    skills: levels(raw.skills),
  };
}
