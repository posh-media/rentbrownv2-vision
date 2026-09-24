import Link from "next/link";
import { Button } from "@rentbrown/ui";

export default function NotFound() {
  return (
    <div className="flex flex-col items-center gap-4 py-20 text-center">
      <p className="font-display text-7xl text-primary">404</p>
      <h1 className="text-xl font-extrabold text-foreground">This page doesn’t exist</h1>
      <p className="max-w-sm text-sm text-muted-foreground">
        The link may be broken or the page was moved.
      </p>
      <Button asChild>
        <Link href="/dashboard">Go home</Link>
      </Button>
    </div>
  );
}
