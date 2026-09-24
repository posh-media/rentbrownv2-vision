"use client";

import { Toaster as SonnerToaster, toast } from "sonner";

/** App toast host — mount once inside Providers. */
export function Toaster() {
  return (
    <SonnerToaster
      position="bottom-right"
      mobileOffset={88}
      gap={8}
      toastOptions={{
        style: {
          background: "var(--card)",
          color: "var(--foreground)",
          border: "1px solid var(--border)",
          borderRadius: "var(--radius-md)",
          boxShadow: "var(--shadow-md)",
          fontFamily: "var(--font-sans)",
        },
      }}
    />
  );
}

export { toast };
