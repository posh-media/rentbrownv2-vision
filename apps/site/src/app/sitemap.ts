import type { MetadataRoute } from "next";
import { createPublicCatalogueSource, properties, siteContent } from "@rentbrown/mock-data";

const base = process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3003";

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const content = await createPublicCatalogueSource().getContent();

  const staticRoutes = ["", "/how-it-works", "/explore", "/learn", "/about", "/trust", "/faq"];
  const opportunityRoutes = properties.map((p) => `/explore/${p.slug}`);
  const learnRoutes = siteContent.learnArticles.map((a) => `/learn/${a.slug}`);
  const legalRoutes = content.legal.map((d) => `/legal/${d.id}`);

  return [...staticRoutes, ...opportunityRoutes, ...learnRoutes, ...legalRoutes].map((path) => ({
    url: `${base}${path}`,
    lastModified: new Date(),
    changeFrequency: path === "" || path === "/explore" ? "daily" : "weekly",
    priority: path === "" || path === "/explore" ? 1 : 0.7,
  }));
}
