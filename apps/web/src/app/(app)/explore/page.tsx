import type { Metadata } from "next";
import { createPublicCatalogueSource } from "@rentbrown/mock-data";

import { ExploreView } from "./explore-view";

export const metadata: Metadata = {
  title: "Explore opportunities",
  description:
    "Compare property-backed investment rounds by slot price, expected return, duration and reviewed evidence. Prototype build — all properties and figures are fictional.",
  alternates: { canonical: "/explore" },
};

export default async function ExplorePage() {
  const initialOpportunities = await createPublicCatalogueSource().listOpportunities();
  return <ExploreView initialOpportunities={initialOpportunities} />;
}
