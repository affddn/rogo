import { cn } from "@/lib/utils";
import { specName } from "@rogo/game/classes";
import { useAssetIndex } from "@/lib/game/extra-data";

const base = import.meta.env.BASE_URL;

export function SpecIcon({ spec, className }: { spec: number; className?: string }) {
  return (
    <span
      className={cn(
        "grid place-items-center rounded-full bg-primary/90 p-1 text-primary-foreground",
        className,
      )}
      title={specName(spec)}
    >
      <img
        src={`${base}game/spec/ic_spec_${spec}.png`}
        alt={specName(spec)}
        className="size-full object-contain brightness-0 invert dark:invert-0"
        onError={(e) => (e.currentTarget.style.visibility = "hidden")}
      />
    </span>
  );
}

const MONSTER_PICS = new Set([2001, 2002, 3001]);

/** A monster portrait when the game ships one locally, otherwise a lettered disc. */
export function MonsterBadge({
  id,
  name,
  boss,
  className,
}: {
  id: number;
  name: string;
  boss?: boolean;
  className?: string;
}) {
  const index = useAssetIndex();
  if (index?.monster?.some((x) => String(x) === String(id))) {
    return (
      <img
        src={`${base}game/monster/${id}.webp`}
        alt=""
        width={36}
        height={36}
        className={cn("size-9 rounded-full object-cover", className)}
      />
    );
  }
  if (MONSTER_PICS.has(id)) {
    return (
      <img
        src={`${base}game/monster/${id}.png`}
        alt=""
        className={cn("size-9 rounded-full", className)}
      />
    );
  }
  return (
    <span
      aria-hidden
      className={cn(
        "grid size-9 shrink-0 place-items-center rounded-full text-sm font-semibold",
        boss ? "bg-primary text-primary-foreground" : "bg-secondary text-secondary-foreground",
        className,
      )}
    >
      {name
        .replace(/\(.*\)/, "")
        .trim()
        .charAt(0) || "?"}
    </span>
  );
}

/** A game backdrop with content over it. The layers share one grid cell, so the banner is as tall as
 * its content and nothing is positioned by hand. */
export function Banner({
  image,
  className,
  children,
}: {
  image: string;
  className?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "grid overflow-hidden rounded-2xl border border-gold/50 shadow-[0_0.4rem_1.6rem_oklch(0.3_0.05_50/18%)] *:[grid-area:1/1]",
        className,
      )}
    >
      <img
        src={`${base}game/bg/${image}.webp`}
        alt=""
        width={1024}
        height={512}
        // zero height so the art never sets the banner's size; it fills the row the content makes
        className="h-0 min-h-full w-full object-cover"
      />
      <div className="bg-[linear-gradient(100deg,oklch(0.18_0.03_45/88%)_0%,oklch(0.2_0.03_45/62%)_48%,oklch(0.2_0.03_45/12%)_100%)]" />
      <div className="min-w-0">{children}</div>
    </div>
  );
}
