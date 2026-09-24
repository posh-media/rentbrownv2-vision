"use client";

import * as React from "react";
import * as SwitchPrimitive from "@radix-ui/react-switch";

import { cn } from "./lib/cn";

export const Switch = React.forwardRef<
  React.ComponentRef<typeof SwitchPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof SwitchPrimitive.Root>
>(({ className, ...props }, ref) => (
  <SwitchPrimitive.Root
    ref={ref}
    className={cn(
      "inline-flex h-6 w-11 shrink-0 items-center rounded-full border border-transparent transition-colors",
      "data-[state=checked]:bg-primary data-[state=unchecked]:bg-muted",
      "focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2",
      "disabled:cursor-not-allowed disabled:opacity-50",
      className,
    )}
    {...props}
  >
    <SwitchPrimitive.Thumb
      className={cn(
        "block size-5 rounded-full bg-card shadow-sm transition-transform",
        "data-[state=checked]:translate-x-[1.375rem] data-[state=unchecked]:translate-x-0.5",
        "motion-reduce:transition-none",
      )}
    />
  </SwitchPrimitive.Root>
));
Switch.displayName = "Switch";
