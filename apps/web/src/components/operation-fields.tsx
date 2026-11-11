import { useGame } from "@/lib/game/game-data-context";
import { useSystems } from "@/lib/game/extra-data";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import type { Draft } from "@/lib/game/operation-fields";

export type CardInventory = { stars: Record<number, number>; slots: Record<number, number> };
const selectStyle = "min-h-11 w-full min-w-0 rounded-md border bg-background px-3 text-base";
export function OperationFields({
  fields,
  draft,
  set,
  command,
  disabled,
  inventory,
}: {
  fields: { name: string; type: string }[];
  draft: Draft;
  set: (v: Draft) => void;
  command: number;
  disabled: boolean;
  inventory: CardInventory | null;
}) {
  const { data } = useGame();
  const systems = useSystems();
  const card = data.cards.find((c) => c.id === Number(draft.card_entry));
  const order = [...fields].sort(
    (a, b) => Number(b.name === "card_entry") - Number(a.name === "card_entry"),
  );
  if (!fields.length) return <p className="text-sm text-muted-foreground">No inputs needed.</p>;
  return (
    <fieldset disabled={disabled} className="grid gap-3">
      {order.map((f) => {
        const value = draft[f.name] ?? "";
        const change = (v: string) =>
          set({ ...draft, ...(f.name === "card_entry" ? { slot_entry: "" } : {}), [f.name]: v });
        const choosingCard = f.name === "card_entry" && command >= 4653 && command <= 4667;
        const choosingSlot = f.name === "slot_entry" && (command === 4661 || command === 4663);
        return (
          <label className="grid gap-1.5 text-sm" key={f.name}>
            <span>{choosingCard ? "Card" : choosingSlot ? "Equipment slot" : f.name}</span>
            {choosingCard ? (
              <select
                className={selectStyle}
                value={value}
                onChange={(e) => change(e.target.value)}
              >
                <option value="">Choose a card</option>
                {data.cards
                  .filter((c) => !inventory || !!inventory.stars[c.id])
                  .map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} · {c.slotName}
                      {inventory
                        ? ` · ${inventory.stars[c.id]}★${Object.values(inventory.slots).includes(c.id) ? " · equipped" : ""}`
                        : ""}
                    </option>
                  ))}
              </select>
            ) : choosingSlot ? (
              <select
                className={selectStyle}
                value={value}
                disabled={!systems || (command === 4661 && !card)}
                onChange={(e) => change(e.target.value)}
              >
                <option value="">Choose a slot</option>
                {systems?.cards.slots
                  .filter((s) => !card || card.slot === s.category)
                  .map((s) => (
                    <option key={s.entry} value={s.entry}>
                      {systems.cards.slotCategories[s.category]} {s.idx} · Lv. {s.unlockLevel}
                      {inventory
                        ? ` · ${inventory.slots[s.entry] ? (data.cards.find((c) => c.id === inventory.slots[s.entry])?.name ?? "Occupied") : "Empty"}`
                        : ""}
                    </option>
                  ))}
              </select>
            ) : f.type === "bool" ? (
              <select
                className={selectStyle}
                value={value}
                onChange={(e) => change(e.target.value)}
              >
                <option value="">Default</option>
                <option value="true">True</option>
                <option value="false">False</option>
              </select>
            ) : /^(proto\.|repeated |map<)/.test(f.type) ? (
              <Textarea
                value={value}
                onChange={(e) => change(e.target.value)}
                placeholder={f.type}
                spellCheck={false}
              />
            ) : (
              <Input
                value={value}
                onChange={(e) => change(e.target.value)}
                placeholder={f.type}
                autoComplete="off"
                spellCheck={false}
              />
            )}
          </label>
        );
      })}
    </fieldset>
  );
}
