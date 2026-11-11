import type { CSSProperties, ReactNode } from "react";
import { cn } from "@/lib/utils";

/** A grade name in the game's own grade colours: the dark variant on parchment, the light one in dark mode. */
export function QualityText({
  dark,
  light,
  children,
  className,
}: {
  dark?: string;
  light?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn("font-semibold text-(--q-l) dark:text-(--q-d)", className)}
      style={{ "--q-l": dark ?? "inherit", "--q-d": light ?? dark ?? "inherit" } as CSSProperties}
    >
      {children}
    </span>
  );
}
