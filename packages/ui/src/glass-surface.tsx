import * as React from "react";

import { cn } from "./lib/cn";

export interface GlassSurfaceProps extends React.HTMLAttributes<HTMLDivElement> {
  tone?: "light" | "dark";
  strength?: "soft" | "default" | "strong";
}

const glassClasses: Record<
  NonNullable<GlassSurfaceProps["tone"]>,
  Record<NonNullable<GlassSurfaceProps["strength"]>, string>
> = {
  light: { soft: "glass-soft", default: "glass", strong: "glass-strong" },
  dark: { soft: "glass-dark", default: "glass-dark", strong: "glass-dark" },
};

export const GlassSurface = React.forwardRef<HTMLDivElement, GlassSurfaceProps>(
  ({ tone = "light", strength = "default", className, style, ...props }, ref) => (
    <div
      ref={ref}
      className={cn("rounded-lg", glassClasses[tone][strength], className)}
      style={
        tone === "dark" && strength === "strong"
          ? { background: "var(--glass-dark-strong)", ...style }
          : style
      }
      {...props}
    />
  ),
);
GlassSurface.displayName = "GlassSurface";
