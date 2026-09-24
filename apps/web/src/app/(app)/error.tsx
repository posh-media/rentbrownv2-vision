"use client";

import Link from "next/link";
import { Button, StatePanel } from "@rentbrown/ui";

export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="mx-auto max-w-xl py-16">
      <StatePanel
        tone="error"
        title="Something went wrong"
        copy={error.message || "An unexpected error occurred."}
        action={
          <>
            <Button variant="outline" size="sm" onClick={reset}>
              Try again
            </Button>
            <Button variant="ghost" size="sm" asChild>
              <Link href="/dashboard">Go home</Link>
            </Button>
          </>
        }
      />
    </div>
  );
}
