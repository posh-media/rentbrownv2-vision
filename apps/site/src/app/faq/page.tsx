import type { Metadata } from "next";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@rentbrown/ui";
import type { FaqItem } from "@rentbrown/types";

import { CtaBand } from "../../components/cta-band";
import { SectionHeading } from "../../components/section-heading";
import { catalogue } from "../../lib/site";

export const metadata: Metadata = {
  title: "FAQ",
  description:
    "Straight answers on slots, expected returns, withdrawals, wallet balances, verification and referral rewards.",
  alternates: { canonical: "/faq" },
};

const CATEGORY_LABELS: Record<FaqItem["category"], string> = {
  BASICS: "Basics",
  INVESTING: "Investing",
  WALLET: "Wallet",
  SECURITY: "Security",
  REFERRALS: "Referrals",
};

const CATEGORY_ORDER: FaqItem["category"][] = ["BASICS", "INVESTING", "WALLET", "SECURITY", "REFERRALS"];

export default async function FaqPage() {
  const content = await catalogue.getContent();
  const grouped = CATEGORY_ORDER.map((cat) => ({
    cat,
    faqs: content.faqs.filter((f) => f.category === cat),
  })).filter((g) => g.faqs.length > 0);

  return (
    <section aria-label="Frequently asked questions" className="rb-container py-14 sm:py-16">
      <SectionHeading
        as="h1"
        eyebrow="FAQ"
        title="Straight answers"
        body="Everything investors ask before their first slot — expected returns, withdrawals, wallet balances and rewards."
      />

      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        {grouped.map(({ cat, faqs }) => (
          <section key={cat} aria-label={CATEGORY_LABELS[cat]}>
            <h2 className="eyebrow text-secondary">{CATEGORY_LABELS[cat]}</h2>
            <div className="financial-card mt-4 px-5">
              <Accordion type="single" collapsible>
                {faqs.map((f) => (
                  <AccordionItem key={f.id} value={f.id}>
                    <AccordionTrigger>{f.question}</AccordionTrigger>
                    <AccordionContent>{f.answer}</AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>
          </section>
        ))}
      </div>

      <div className="mt-16">
        <CtaBand />
      </div>
    </section>
  );
}
