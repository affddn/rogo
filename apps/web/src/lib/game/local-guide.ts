export type Session = {
  available: boolean;
  connected: boolean;
  serverId: string;
  characterName?: string;
};

export async function localJson(path: string, body?: object) {
  const r = await fetch(
    "/api/rogo/" + path,
    body
      ? {
          method: "POST",
          credentials: "same-origin",
          cache: "no-store",
          headers: { "Content-Type": "application/json", "X-Rogo-Connect": "1" },
          body: JSON.stringify(body),
        }
      : { cache: "no-store", credentials: "same-origin" },
  );
  if (!r.headers.get("content-type")?.includes("application/json"))
    throw new Error("Local helper unavailable. Open the guide with the connector enabled.");
  const value = await r.json();
  if (!r.ok)
    throw new Error(
      typeof value?.error === "string" ? value.error : "The local helper rejected the request.",
    );
  return value;
}
