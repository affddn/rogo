import type { ReactNode } from "react";
import { CharacterBanner } from "@/components/character/banners";

/** Page title on the wide side, actions on the narrow side: an asymmetric header, never centered. */
export function PageHeader({
  title,
  eyebrow,
  children,
  actions,
}: {
  title: string;
  /** a short label above the title, like the section it belongs to */
  eyebrow?: string;
  children?: ReactNode;
  actions?: ReactNode;
}) {
  return (
    <header className="grid items-end gap-x-block gap-y-4 md:grid-cols-[minmax(0,1.618fr)_minmax(0,1fr)]">
      <div className="grid min-w-0 gap-3">
        {eyebrow && (
          <span className="game-chip w-fit text-[0.7rem] tracking-[0.12em] uppercase">
            {eyebrow}
          </span>
        )}
        <h1 className="text-[clamp(1.75rem,3.4vw,2.75rem)] leading-[1.1] font-semibold">{title}</h1>
        {children && <p className="measure text-base text-muted-foreground">{children}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2 md:justify-end">{actions}</div>}
      <div className="empty:hidden md:col-span-2">
        <CharacterBanner />
      </div>
    </header>
  );
}

/** A section title on the game's brown ribbon, with optional text to its right. */
export function SectionTitle({ children, aside }: { children: ReactNode; aside?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-block gap-y-2">
      <h2 className="game-ribbon text-base">{children}</h2>
      {aside && <div className="text-sm text-muted-foreground">{aside}</div>}
    </div>
  );
}

export function Stat({
  label,
  value,
  hint,
  lead,
}: {
  label: string;
  value: ReactNode;
  hint?: ReactNode;
  /** the headline tile: larger figure */
  lead?: boolean;
}) {
  return (
    <div className="game-panel grid min-w-0 content-start gap-1.5 px-1 py-0.5">
      <span className="text-xs font-semibold tracking-[0.1em] text-muted-foreground uppercase">
        {label}
      </span>
      <span
        className={`tabular min-w-0 font-heading leading-tight font-semibold ${lead ? "text-[clamp(1.6rem,2.6vw,2.25rem)]" : "text-[clamp(1.25rem,1.8vw,1.6rem)]"}`}
      >
        {value}
      </span>
      {hint && <span className="text-sm text-muted-foreground">{hint}</span>}
    </div>
  );
}
