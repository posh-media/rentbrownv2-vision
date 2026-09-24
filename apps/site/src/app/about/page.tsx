import type { Metadata } from "next";
import { Mail, MonitorSmartphone, Phone } from "lucide-react";
import { siteContent } from "@rentbrown/mock-data";

import { CtaBand } from "../../components/cta-band";
import { PrototypeNotice } from "../../components/prototype-notice";
import { SectionHeading } from "../../components/section-heading";
import { catalogue } from "../../lib/site";

export const metadata: Metadata = {
  title: "About",
  description:
    "Why RentBrown exists — making structured participation in Nigerian property income understandable for everyday investors. Phase 1 design prototype.",
  alternates: { canonical: "/about" },
};

export default async function AboutPage() {
  const { mission, principles, prototypeNotice } = siteContent.siteAbout;
  const content = await catalogue.getContent();
  const { contact } = content.company;

  return (
    <>
      <section aria-label="Mission" className="hero-wash border-b border-border">
        <div className="rb-container py-16 sm:py-24">
          <div className="max-w-3xl">
            <p className="eyebrow text-secondary">{mission.eyebrow}</p>
            <h1 className="mt-4 font-display text-4xl leading-[1.08] tracking-tight text-foreground sm:text-5xl">
              {mission.title}
            </h1>
            <p className="mt-6 text-base leading-relaxed text-muted-foreground sm:text-lg">{mission.body}</p>
          </div>
        </div>
      </section>

      <section aria-label="Principles" className="rb-container py-16 sm:py-20">
        <SectionHeading eyebrow="Principles" title="Three rules the product holds itself to" />
        <div className="mt-10 grid gap-4 sm:grid-cols-3">
          {principles.map((p) => (
            <div key={p.title} className="financial-card p-6">
              <h2 className="font-display text-xl tracking-tight text-foreground">{p.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{p.body}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-label="The product today" className="border-y border-border bg-surface-subtle py-16 sm:py-20">
        <div className="rb-container grid gap-10 lg:grid-cols-2">
          <div>
            <SectionHeading eyebrow="The product today" title="A working design prototype, end to end" />
            <div className="mt-6 flex gap-4">
              <span className="flex size-11 shrink-0 items-center justify-center rounded-lg bg-accent text-primary">
                <MonitorSmartphone className="size-5" aria-hidden />
              </span>
              <p className="text-sm leading-relaxed text-muted-foreground">
                RentBrown V2 exists today as three prototype surfaces: this marketing site, an investor web app
                (dashboard, explore, checkout, wallet, portfolio) and an investor mobile app. Everything runs on
                fictional mock data — there is no backend, no real money and no live properties.
              </p>
            </div>
            <PrototypeNotice className="mt-6" />
          </div>

          <div id="contact" className="financial-card scroll-mt-24 p-6 sm:p-8">
            <p className="eyebrow text-muted-foreground">Contact</p>
            <h2 className="mt-2 font-display text-2xl tracking-tight text-foreground">Talk to the team</h2>
            <ul className="mt-5 space-y-4 text-sm">
              <li className="flex items-center gap-3">
                <Mail className="size-4 shrink-0 text-secondary" aria-hidden />
                <a href={`mailto:${contact.email}`} className="font-semibold text-primary hover:underline">
                  {contact.email}
                </a>
              </li>
              <li className="flex items-center gap-3">
                <Phone className="size-4 shrink-0 text-secondary" aria-hidden />
                <span className="tabular font-semibold text-foreground">{contact.phone}</span>
              </li>
            </ul>
            <p className="mt-5 rounded-lg bg-surface-subtle p-3 text-xs text-muted-foreground">
              {contact.address} — fictional contact details shown for design review.
            </p>
          </div>
        </div>
      </section>

      <div className="rb-container py-16 sm:py-20">
        <p className="mb-10 max-w-3xl text-xs leading-relaxed text-muted-foreground">{prototypeNotice}</p>
        <CtaBand />
      </div>
    </>
  );
}
