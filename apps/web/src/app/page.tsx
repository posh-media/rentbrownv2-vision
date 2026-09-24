import type { Metadata } from "next";
import { redirect } from "next/navigation";

export const metadata: Metadata = {
  title: "RentBrown",
  description:
    "Compare property-backed investment rounds in Nigeria — slot prices, expected returns, terms and reviewed evidence, shown plainly.",
};

export default function Home() {
  redirect("/dashboard");
}
