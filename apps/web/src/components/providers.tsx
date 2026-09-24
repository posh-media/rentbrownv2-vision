"use client";

import * as React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Toaster, TooltipProvider } from "@rentbrown/ui";

import { DataProvider } from "../lib/data/provider";

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = React.useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 30_000, retry: 1 },
        },
      }),
  );

  return (
    <QueryClientProvider client={queryClient}>
      <DataProvider>
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster />
      </DataProvider>
    </QueryClientProvider>
  );
}
