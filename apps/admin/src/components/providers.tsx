"use client";

import * as React from "react";
import { Toaster, TooltipProvider } from "@rentbrown/ui";

import { AdminDataProvider } from "../lib/data/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <AdminDataProvider>
      <TooltipProvider delayDuration={250}>{children}</TooltipProvider>
      <Toaster />
    </AdminDataProvider>
  );
}
