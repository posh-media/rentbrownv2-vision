import * as React from "react";

import { cn } from "./lib/cn";

export interface AvatarProps extends React.HTMLAttributes<HTMLDivElement> {
  initials: string;
  size?: "sm" | "md" | "lg";
  src?: string | null;
  alt?: string;
}

const sizeClasses = {
  sm: "size-8 text-xs",
  md: "size-10 text-sm",
  lg: "size-14 text-lg",
};

export function Avatar({ initials, size = "md", src, alt = "", className, ...props }: AvatarProps) {
  if (src) {
    return (
      <img src={src} alt={alt} className={cn("rounded-full object-cover", sizeClasses[size], className)} />
    );
  }
  return (
    <div
      aria-hidden
      className={cn(
        "flex items-center justify-center rounded-full bg-secondary font-bold text-secondary-foreground",
        sizeClasses[size],
        className,
      )}
      {...props}
    >
      {initials}
    </div>
  );
}
