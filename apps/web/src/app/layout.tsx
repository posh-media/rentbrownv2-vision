import type { Metadata } from "next";
import { Plus_Jakarta_Sans, DM_Serif_Display } from "next/font/google";
import "./globals.css";
import { Providers } from "../components/providers";

const plusJakarta = Plus_Jakarta_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-plus-jakarta",
});

const dmSerif = DM_Serif_Display({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-dm-serif",
});

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_WEB_URL ?? "http://localhost:3000"),
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
