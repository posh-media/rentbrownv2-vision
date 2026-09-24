import type { MetadataRoute } from "next";
import { createPublicCatalogueSource, properties } from "@rentbrown/mock-data";

const base = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const content = await createPublicCatalogueSource().getContent();

  const publicRoutes = ["", "/explore", "/how-it-works", "/faq", "/company", "/property-proof", "/help", "/login", "/signup"];
  const opportunityRoutes = properties.map((p) => `/opportunities/${p.slug}`);
  const legalRoutes = content.legal.map((d) => `/legal/${d.id}`);

  return [...publicRoutes, ...opportunityRoutes, ...legalRoutes].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" || path === "/explore" ? "daily" : "weekly",
    priority: path === "" || path === "/explore" ? 1 : 0.7,
  }));
}
