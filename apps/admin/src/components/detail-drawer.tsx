"use client";

import * as React from "react";
import { Drawer } from "vaul";
import { X } from "lucide-react";
import { cn } from "@rentbrown/ui";

/**
 * Right-side detail sheet for table-row drill-down. Uses the same vaul
 * Drawer primitive that @rentbrown/ui's Sheet wraps, configured for the
 * desktop ops pattern (right edge panel, not a bottom sheet).
 */
export function DetailDrawer({
  open,
  onOpenChange,
  title,
  description,
  children,
  footer,
  width = "max-w-xl",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: React.ReactNode;
  description?: React.ReactNode;
  children: React.ReactNode;
  footer?: React.ReactNode;
  width?: string;
}) {
  return (
    <Drawer.Root direction="right" open={open} onOpenChange={onOpenChange}>
      <Drawer.Portal>
        <Drawer.Overlay className="fixed inset-0 z-50 bg-foreground/30" />
        <Drawer.Content
          className={cn("fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-border bg-card shadow-lg focus-visible:outline-none", width)}
          aria-describedby={undefined}
        >
          <div className="flex items-start justify-between gap-4 border-b px-5 py-4">
            <div className="min-w-0">
              <Drawer.Title className="text-base font-extrabold text-foreground">{title}</Drawer.Title>
              {description ? <Drawer.Description className="mt-0.5 text-xs text-muted-foreground">{description}</Drawer.Description> : null}
            </div>
            <Drawer.Close
              aria-label="Close"
              className="flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
            >
              <X className="size-4" />
            </Drawer.Close>
          </div>
          <div className="flex-1 overflow-y-auto px-5 py-4">{children}</div>
          {footer ? <div className="border-t px-5 py-3">{footer}</div> : null}
        </Drawer.Content>
      </Drawer.Portal>
    </Drawer.Root>
  );
}

/** Label/value row used inside drawers and detail cards. */
export function DetailRow({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-border/60 py-2.5 text-sm last:border-0">
      <span className="shrink-0 text-xs font-semibold text-muted-foreground">{label}</span>
      <span className={cn("text-right font-medium text-foreground", mono && "font-mono text-xs")}>{children}</span>
    </div>
  );
}
