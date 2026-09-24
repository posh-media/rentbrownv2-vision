import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { SiteHeader } from "../components/site-header";
import { SiteFooter } from "../components/site-footer";
import { appLinks, SITE_URL } from "../lib/site";

// Self-hosted (latin subset): production builds must not depend on a live
// fonts.googleapis.com fetch — a cold build environment without it fails
// page-data collection with an opaque error.
const plusJakarta = localFont({
  src: "../fonts/plus-jakarta-sans-var.woff2",
  variable: "--font-plus-jakarta",
  display: "swap",
});

const dmSerif = localFont({
  src: "../fonts/dm-serif-display-400.woff2",
  weight: "400",
  variable: "--font-dm-serif",
  display: "swap",
});

const DESCRIPTION =
  "RentBrown structures Nigerian property income into fixed-term investment slots — principal, expected profit and maturity value shown separately, with reviewed documents on every opportunity. Prototype build with fictional data.";

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: {
    default: "RentBrown — property-backed investing, clearly structured",
    template: "%s · RentBrown",
  },
  description: DESCRIPTION,
  openGraph: {
    type: "website",
    siteName: "RentBrown",
    title: "RentBrown — property-backed investing, clearly structured",
    description: DESCRIPTION,
    images: ["/properties/ikoyi-residences.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "RentBrown — property-backed investing, clearly structured",
    description: DESCRIPTION,
    images: ["/properties/ikoyi-residences.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${dmSerif.variable}`}>
      <body className="flex min-h-screen flex-col">
        <SiteHeader signInHref={appLinks.signIn} getStartedHref={appLinks.getStarted} />
        <main className="flex-1">{children}</main>
        <SiteFooter />
      </body>
    </html>
  );
}
