import Link from "next/link";
import { Button } from "@rentbrown/ui";

export default function NotFound() {
  return (
    <section className="hero-wash">
      <div className="rb-container flex flex-col items-center py-24 text-center sm:py-32">
        <p className="eyebrow text-secondary">404</p>
        <h1 className="mt-4 font-display text-4xl leading-tight tracking-tight text-foreground sm:text-5xl">
          This page isn&rsquo;t on the plan
        </h1>
        <p className="mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
          The link may be wrong, or the page moved. The opportunities are all still where you left them.
        </p>
        <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
          <Button asChild>
            <Link href="/">Back to home</Link>
          </Button>
          <Button variant="outline" asChild>
            <Link href="/explore">Explore opportunities</Link>
          </Button>
        </div>
      </div>
    </section>
  );
}
