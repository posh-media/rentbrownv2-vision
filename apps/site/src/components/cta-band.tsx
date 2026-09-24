import { Button } from "@rentbrown/ui";

import { appLinks } from "../lib/site";

/** Final conversion band — links out to the investor app. */
export function CtaBand({
  id,
  title = "Start with as little as one slot",
  body = "Create an account, review the terms and the evidence, and choose the round that fits.",
}: {
  id?: string;
  title?: string;
  body?: string;
}) {
  return (
    <section id={id} aria-label="Get started" className="band-inverse rounded-2xl px-6 py-14 text-center sm:px-12">
      <h2 className="mx-auto max-w-xl font-display text-3xl leading-tight tracking-tight sm:text-4xl">{title}</h2>
      <p className="mx-auto mt-4 max-w-lg text-sm leading-relaxed text-primary-foreground/75">{body}</p>
      <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
        <Button size="lg" asChild className="bg-primary-foreground text-primary hover:bg-primary-foreground/90">
          <a href={appLinks.getStarted}>Get started</a>
        </Button>
        <Button
          size="lg"
          variant="outline"
          asChild
          className="border-primary-foreground/30 bg-transparent text-primary-foreground hover:bg-primary-foreground/10"
        >
          <a href={appLinks.signIn}>Sign in</a>
        </Button>
      </div>
      <p className="mt-5 text-xs text-primary-foreground/60">
        Expected returns are not guaranteed. Every opportunity carries full risk disclosures.
      </p>
    </section>
  );
}
