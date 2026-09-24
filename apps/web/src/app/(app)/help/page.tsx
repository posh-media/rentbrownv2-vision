import type { Metadata } from "next";
import { createPublicCatalogueSource } from "@rentbrown/mock-data";

import { PageHeader } from "../../../components/layout/page-header";
import { HelpView } from "./help-view";

export const metadata: Metadata = {
  title: "Help & tutorials",
  description: "Short guides for the common things you'll do on RentBrown — investing, the wallet, security and referrals.",
  alternates: { canonical: "/help" },
};

export default async function HelpPage() {
  const content = await createPublicCatalogueSource().getContent();

  return (
    <div className="flex flex-col gap-6">
      <PageHeader title="Help & tutorials" copy="Short guides for the common things you'll do here." />
      <HelpView articles={content.help} />
    </div>
  );
}
