// Saving characters to a file and reading them back, so they can move between browsers.
import { migrate } from "./characters";
import type { Profile } from "@rogo/game/profile";

export function downloadCharacters(characters: Profile[], filename: string) {
  const blob = new Blob([JSON.stringify({ app: "rgo-guide", version: 2, characters }, null, 1)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

/** Characters in a file saved by this guide: one character, a list, or the `{characters}` wrapper. */
export async function readCharacterFile(file: File): Promise<Profile[]> {
  const json: unknown = JSON.parse(await file.text());
  const list =
    json && typeof json === "object" && "characters" in json
      ? (json as { characters: unknown[] }).characters
      : Array.isArray(json)
        ? json
        : [json];
  return list.map(migrate).filter((p): p is Profile => !!p);
}

export const fileSafe = (name: string) =>
  name.replace(/[^\w.-]+/g, "-").replace(/^-+|-+$/g, "") || "character";
