import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";
import { Providers } from "../components/providers";
import { absoluteUrl } from "@rentbrown/utils";

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

export const metadata: Metadata = {
  // Env origin may lack a scheme — absoluteUrl normalizes instead of throwing
  // at module scope during page-data collection.
  metadataBase: new URL(absoluteUrl(process.env.NEXT_PUBLIC_WEB_URL, "http://localhost:3000")),
  title: {
    default: "RentBrown",
    template: "%s · RentBrown",
  },
  description:
    "Compare property-backed investment rounds in Nigeria — slot prices, expected returns, terms and reviewed evidence, shown plainly. Prototype build with fictional data.",
  openGraph: {
    type: "website",
    siteName: "RentBrown",
    title: "RentBrown",
    description:
      "Compare property-backed investment rounds in Nigeria — slot prices, expected returns, terms and reviewed evidence, shown plainly.",
    images: ["/properties/ikoyi-residences.jpg"],
  },
  twitter: {
    card: "summary_large_image",
    title: "RentBrown",
    description:
      "Compare property-backed investment rounds in Nigeria — slot prices, expected returns, terms and reviewed evidence, shown plainly.",
    images: ["/properties/ikoyi-residences.jpg"],
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${plusJakarta.variable} ${dmSerif.variable}`}>
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
