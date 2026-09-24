import * as React from "react";
import { StatusPill, cn } from "@rentbrown/ui";

import { labelFor, toneFor } from "../lib/status";

/** Locked status vocabulary → pill. Every domain status renders through this. */
export function StatusCell({ status, label, className }: { status: string; label?: string; className?: string }) {
  return (
    <StatusPill tone={toneFor(status)} className={cn("whitespace-nowrap", className)}>
      {label ?? labelFor(status)}
    </StatusPill>
  );
}
