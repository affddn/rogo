import { SpecIcon } from "@/components/game-icon";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { SPECS } from "@rogo/game/classes";

const LINES = [...new Set(SPECS.map((s) => s.line))];

/** Class build picker, grouped by class line. */
export function SpecSelect({
  id,
  value,
  onChange,
}: {
  id?: string;
  value: number;
  onChange: (spec: number) => void;
}) {
  return (
    <Select value={String(value)} onValueChange={(v) => onChange(Number(v))}>
      <SelectTrigger id={id} className="w-full">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {LINES.map((line) => (
          <SelectGroup key={line}>
            <SelectLabel>{line}</SelectLabel>
            {SPECS.filter((s) => s.line === line).map((s) => (
              <SelectItem key={s.id} value={String(s.id)}>
                <SpecIcon spec={s.id} className="size-5" /> {s.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  );
}
