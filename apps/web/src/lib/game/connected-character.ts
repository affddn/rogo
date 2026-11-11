import { readCharacter, type RogoCharacter } from "@rogo/game/connected-character";
export { readCharacter, type RogoCharacter } from "@rogo/game/connected-character";

const KEY = "rgo-guide.vmos-snapshot.v1";
export interface Snapshot {
  character: RogoCharacter;
  capturedAt: number;
}

export function savedSnapshot(): Snapshot | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(KEY) ?? "null");
    if (
      !stored ||
      typeof stored !== "object" ||
      !("character" in stored) ||
      !("capturedAt" in stored) ||
      typeof stored.capturedAt !== "number" ||
      !Number.isSafeInteger(stored.capturedAt) ||
      stored.capturedAt < 0
    )
      return null;
    return { character: readCharacter(stored.character), capturedAt: stored.capturedAt };
  } catch {
    return null;
  }
}

export function saveSnapshot(snapshot: Snapshot | null) {
  if (snapshot) localStorage.setItem(KEY, JSON.stringify(snapshot));
  else localStorage.removeItem(KEY);
}

// Planner IDs also travel in user-initiated file exports. Don't put the game ID itself there.
export async function plannerIdFor(c: RogoCharacter): Promise<string> {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(`rogo:${c.serverId}:${c.playerId}`),
  );
  return `vm-${[...new Uint8Array(digest)].map((n) => n.toString(16).padStart(2, "0")).join("")}`;
}
