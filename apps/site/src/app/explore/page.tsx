import type { Metadata } from "next";

import { ExploreBrowser } from "../../components/explore-browser";
import { PrototypeNotice } from "../../components/prototype-notice";
import { SectionHeading } from "../../components/section-heading";
import { catalogue } from "../../lib/site";

export const metadata: Metadata = {
  title: "Explore opportunities",
  description:
    "Compare property-backed investment rounds by slot price, expected return, duration and capacity — with reviewed documents on every property. Prototype build; all figures fictional.",
  alternates: { canonical: "/explore" },
};

export default async function ExplorePage() {
  const opportunities = await catalogue.listOpportunities();

  return (
    <section aria-label="Explore opportunities" className="rb-container py-14 sm:py-16">
      <SectionHeading
        as="h1"
        eyebrow="Opportunities"
        title="Every round, every figure, up front"
        body="Slot price, expected full-term return, duration and honest capacity — plus the documents behind each property."
      />
      <PrototypeNotice className="mt-8" />
      <div className="mt-8">
        <ExploreBrowser opportunities={opportunities} />
      </div>
    </section>
  );
}
