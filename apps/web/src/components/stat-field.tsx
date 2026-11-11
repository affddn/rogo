import { useId, useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { parseAmount } from "@/lib/format";

/** A number field that shows percentages as percent and stores fractions. Flat amounts also take the
 * game's short forms (8.38M, 120K). */
export function StatField({
  label,
  value,
  unit,
  onChange,
  hint,
  plainLabel,
  blankZero,
}: {
  label: string;
  value: number;
  unit: "flat" | "pct" | "pts" | "x";
  onChange: (v: number) => void;
  hint?: string;
  /** full-size label, for forms where the other labels are full size */
  plainLabel?: boolean;
  /** show 0 as an empty field, for values the player hasn't typed yet */
  blankZero?: boolean;
}) {
  const id = useId();
  const toText = (v: number) =>
    blankZero && v === 0 ? "" : unit === "pct" ? String(+(v * 100).toFixed(3)) : String(v);
  const [text, setText] = useState(toText(value));
  const [seen, setSeen] = useState(value);
  if (value !== seen) {
    // the value changed from outside (reset, another field): show it
    setSeen(value);
    setText(toText(value));
  }
  return (
    <div className="grid gap-1.5">
      <Label
        htmlFor={id}
        className={plainLabel ? undefined : "text-xs font-normal text-muted-foreground"}
      >
        {label}
      </Label>
      <div className="relative">
        <Input
          id={id}
          inputMode="decimal"
          className="tabular pr-7 text-right"
          value={text}
          onChange={(e) => {
            setText(e.target.value);
            const n = parseAmount(e.target.value);
            if (Number.isFinite(n)) {
              const v = unit === "pct" ? n / 100 : n;
              setSeen(v);
              onChange(v);
            }
          }}
          aria-invalid={text.trim() !== "" && !Number.isFinite(parseAmount(text))}
          aria-describedby={
            [unit === "pct" && `${id}-unit`, hint && `${id}-hint`].filter(Boolean).join(" ") ||
            undefined
          }
        />
        {unit === "pct" && (
          <span
            id={`${id}-unit`}
            className="pointer-events-none absolute top-1/2 right-2.5 -translate-y-1/2 text-xs text-muted-foreground"
          >
            %
          </span>
        )}
      </div>
      {hint && (
        <span id={`${id}-hint`} className="text-xs text-muted-foreground">
          {hint}
        </span>
      )}
    </div>
  );
}
