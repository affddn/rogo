type Field = { name: string; type: string };
export type Draft = Record<string, string>;

export function parsePayload(text: string): unknown {
  return JSON.parse(text, (_, value: unknown) => {
    if (
      typeof value === "number" &&
      (!Number.isFinite(value) || (Number.isInteger(value) && !Number.isSafeInteger(value)))
    )
      throw new Error("Quote large integer IDs.");
    return value;
  });
}

// Blank fields are omitted so the protobuf descriptor supplies its own defaults.
export function formPayload(fields: Field[], draft: Draft): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const { name, type } of fields) {
    const s = draft[name];
    if (s === undefined || s === "") continue;
    if (type === "string" || type === "bytes" || /^(u?int|sint|s?fixed)64$/.test(type))
      out[name] = s;
    else if (type === "bool") {
      if (s !== "true" && s !== "false") throw new Error(`Choose true or false for ${name}.`);
      out[name] = s === "true";
    } else if (/^(u?int|sint|s?fixed)32$/.test(type) || type === "float" || type === "double") {
      if (
        !s.trim() ||
        !Number.isFinite(Number(s)) ||
        (/32$/.test(type) && !Number.isSafeInteger(Number(s)))
      )
        throw new Error(`Enter a valid number for ${name}.`);
      out[name] = Number(s);
    } else {
      try {
        out[name] = parsePayload(s);
      } catch {
        if (type.startsWith("proto.") && /^[A-Za-z_][A-Za-z0-9_]*$/.test(s)) out[name] = s;
        else throw new Error(`Enter a JSON value for ${name}; quote large integer IDs.`);
      }
    }
  }
  return out;
}
