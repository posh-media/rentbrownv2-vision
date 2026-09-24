"use client";

import * as React from "react";
import { Drawer } from "vaul";

import { cn } from "./lib/cn";

export const Sheet = Drawer.Root;
export const SheetTrigger = Drawer.Trigger;
export const SheetClose = Drawer.Close;

export interface SheetContentProps extends React.ComponentPropsWithoutRef<typeof Drawer.Content> {
  overlayClassName?: string;
}

/** Bottom sheet (vaul) for mobile-web. Glass surface, xl top radius, drag handle. */
export const SheetContent = React.forwardRef<
  React.ComponentRef<typeof Drawer.Content>,
  SheetContentProps
>(({ className, overlayClassName, children, ...props }, ref) => (
  <Drawer.Portal>
    <Drawer.Overlay className={cn("fixed inset-0 z-50 bg-foreground/30", overlayClassName)} />
    <Drawer.Content
      ref={ref}
      className={cn(
        "glass-strong fixed inset-x-0 bottom-0 z-50 flex max-h-[85vh] flex-col rounded-t-xl p-5 focus-visible:outline-none",
        className,
      )}
      {...props}
    >
      <div aria-hidden className="mx-auto mb-4 h-1 w-9 shrink-0 rounded-full bg-border-strong" />
      {children}
    </Drawer.Content>
  </Drawer.Portal>
));
SheetContent.displayName = "SheetContent";

export function SheetHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("mb-3 flex flex-col gap-1", className)} {...props} />;
}

export const SheetTitle = React.forwardRef<
  React.ComponentRef<typeof Drawer.Title>,
  React.ComponentPropsWithoutRef<typeof Drawer.Title>
>(({ className, ...props }, ref) => (
  <Drawer.Title ref={ref} className={cn("text-lg font-extrabold text-foreground", className)} {...props} />
));
SheetTitle.displayName = "SheetTitle";

export const SheetDescription = React.forwardRef<
  React.ComponentRef<typeof Drawer.Description>,
  React.ComponentPropsWithoutRef<typeof Drawer.Description>
>(({ className, ...props }, ref) => (
  <Drawer.Description ref={ref} className={cn("text-sm text-muted-foreground", className)} {...props} />
));
SheetDescription.displayName = "SheetDescription";
