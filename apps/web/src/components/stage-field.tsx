import { useId } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useGame } from "@/lib/game/game-data-context";
import { stageName } from "@/lib/game/data";

/** A campaign stage typed as chapter-stage ("7-12"), with the stage's name or a fix-it message below. */
export function StageField({
  label,
  value,
  onChange,
  optional,
  className,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  /** an empty field is fine */
  optional?: boolean;
  className?: string;
}) {
  const id = useId();
  const { data, stageById } = useGame();
  const known = stageById.has(value);
  const bad = !known && !(optional && value === "");
  return (
    <div className={className ?? "grid gap-1.5"}>
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        value={value}
        placeholder="e.g. 7-12"
        inputMode="text"
        autoComplete="off"
        spellCheck={false}
        onChange={(e) => onChange(e.target.value.trim())}
        aria-invalid={bad}
        aria-describedby={`${id}-hint`}
      />
      <span
        id={`${id}-hint`}
        className={`text-xs ${bad ? "text-destructive" : "text-muted-foreground"}`}
      >
        {known
          ? stageName(data, value)
          : bad
            ? `Use the chapter-stage form from the stage list, like 7-12 (1-1 to ${data.stages.at(-1)?.id}).`
            : "Optional"}
      </span>
    </div>
  );
}
