import type { MetadataRoute } from "next";

const base = process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000";

export default function robots(): MetadataRoute.Robots {
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: [
        "/dashboard",
        "/portfolio",
        "/wallet",
        "/account",
        "/checkout",
        "/payment",
        "/notifications",
        "/referrals",
      ],
    },
    sitemap: `${base}/sitemap.xml`,
  };
}
