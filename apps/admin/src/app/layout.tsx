import type { Metadata } from "next";
import localFont from "next/font/local";
import "./globals.css";

import { Providers } from "../components/providers";

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
  title: "RentBrown Admin",
  description: "RentBrown admin and operations",
  robots: { index: false, follow: false },
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
