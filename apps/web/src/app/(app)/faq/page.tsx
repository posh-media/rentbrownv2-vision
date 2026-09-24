import type { Metadata } from "next";
import { createPublicCatalogueSource } from "@rentbrown/mock-data";

import { PageHeader } from "../../../components/layout/page-header";
import { FaqView } from "./faq-view";

export const metadata: Metadata = {
  title: "FAQ",
  description: "Short, plain answers about investment slots, expected returns, the wallet, verification and referrals.",
  alternates: { canonical: "/faq" },
};

export default async function FaqPage() {
  const content = await createPublicCatalogueSource().getContent();

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-6">
      <PageHeader eyebrow="FAQ" title="Questions, answered plainly" copy="Short answers about slots, returns, the wallet and verification." />
      <FaqView faqs={content.faqs} />
    </div>
  );
}
