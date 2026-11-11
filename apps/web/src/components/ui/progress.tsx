import * as React from "react";
import { cn } from "cn";
import { Progress as ProgressPrimitive } from "radix-ui";

function Progress({
  className,
  value,
  ...props
}: React.ComponentProps<typeof ProgressPrimitive.Root>) {
  return (
    <ProgressPrimitive.Root
      data-slot="progress"
      className={cn(
        "relative flex h-2.5 w-full items-center overflow-x-hidden rounded-full bg-leather/85 p-px shadow-[inset_0_0.06rem_0.15rem_oklch(0_0_0/35%)] ring-1 ring-gold/40",
        className,
      )}
      {...props}
    >
      <ProgressPrimitive.Indicator
        data-slot="progress-indicator"
        className="size-full flex-1 rounded-full bg-[linear-gradient(180deg,oklch(0.86_0.12_82),oklch(0.66_0.14_55))] transition-transform"
        style={{ transform: `translateX(-${100 - (value || 0)}%)` }}
      />
    </ProgressPrimitive.Root>
  );
}

export { Progress };
