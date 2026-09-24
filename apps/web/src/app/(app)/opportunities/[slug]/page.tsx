import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createPublicCatalogueSource, properties } from "@rentbrown/mock-data";

import { propertyImage } from "../../../../lib/images";
import { OpportunityView } from "./opportunity-view";

export function generateStaticParams() {
  return properties.map((p) => ({ slug: p.slug }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const opportunity = await createPublicCatalogueSource().getOpportunity(slug);
  if (!opportunity) return { title: "Opportunity not found" };
  const { property, plan } = opportunity;
  return {
    title: `${property.name} · ${plan.name}`,
    description: property.summary,
    alternates: { canonical: `/opportunities/${slug}` },
    openGraph: {
      title: `${property.name} · ${plan.name}`,
      description: property.summary,
      images: [propertyImage(property.images[0] ?? "ikoyi-residences")],
    },
  };
}

export default async function OpportunityPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const opportunity = await createPublicCatalogueSource().getOpportunity(slug);
  if (!opportunity) notFound();
  return <OpportunityView slug={slug} initialOpportunity={opportunity} />;
}
