/** Shared editorial content (site, web, mobile). Prototype copy — not legal advice. */
import type { ContentBundle } from "@rentbrown/types";

export const content: ContentBundle = {
  howItWorks: [
    { step: "01", title: "Discover", body: "Compare open rounds by slot price, expected return, duration, capacity and the property evidence behind each one." },
    { step: "02", title: "Review", body: "See principal, expected profit and maturity value separately, with start and maturity dates, terms and risk disclosures before you commit." },
    { step: "03", title: "Invest", body: "Choose your number of slots, review every amount, and fund from your wallet or by bank transfer or card." },
    { step: "04", title: "Track", body: "Follow each investment from activation through the term to maturity, then see principal and profit credited to your wallet." },
  ],
  trustPillars: [
    { title: "Evidence before commitment", body: "Every opportunity carries reviewed documents — title summaries, valuations, inspections and operator agreements — with reviewer and date." },
    { title: "Principal and profit, never blurred", body: "Your principal, expected profit and maturity value are always shown as separate figures with the term they apply to." },
    { title: "Your wallet is legible", body: "Available, reserved, bonus and pending balances are distinct so you always know what you can actually use or withdraw." },
    { title: "Fees shown before you confirm", body: "Withdrawal fees and the amount you will receive are itemised before you enter your transaction PIN." },
  ],
  faqs: [
    { id: "f1", category: "BASICS", question: "What is an investment slot?", answer: "A slot is a fixed unit of principal in a specific investment round — for example ₦100,000 per slot. You choose how many slots to take, subject to the round's minimum and available capacity." },
    { id: "f2", category: "INVESTING", question: "Are returns guaranteed?", answer: "No. Returns are expected returns for the full term as stated in the plan. Settlement depends on the issuer meeting its obligations. Risk disclosures are shown on every opportunity." },
    { id: "f3", category: "INVESTING", question: "Is the return per month or for the whole term?", answer: "For the whole term. A 16.5% return over 12 months means ₦100,000 principal is expected to settle at ₦116,500 at maturity." },
    { id: "f4", category: "INVESTING", question: "Can I withdraw invested principal early?", answer: "No. Principal is allocated to the round for the full term and is credited back to your wallet together with expected profit at settlement." },
    { id: "f5", category: "WALLET", question: "Which wallet balance can I withdraw?", answer: "Only your available balance. Reserved funds are committed to an in-flight request, pending funds are awaiting confirmation, and bonus funds can be invested or transferred to available first." },
    { id: "f6", category: "WALLET", question: "What does a withdrawal cost?", answer: "A fee of 5% of the amount, capped at ₦10,000, is shown before you confirm. The amount you will receive is itemised on the confirmation screen." },
    { id: "f7", category: "SECURITY", question: "Why do I need identity verification?", answer: "Verification protects your account and is required before withdrawals to a bank account. Your documents are used only for identity and account-security purposes." },
    { id: "f8", category: "REFERRALS", question: "When do referral rewards qualify?", answer: "When the person you referred completes verification and makes a qualifying first investment. Until then the reward is shown as pending." },
  ],
  legal: [
    {
      id: "terms",
      title: "Terms of service",
      version: "Prototype v0.3",
      effectiveAt: "2026-09-01T00:00:00Z",
      summary: "Prototype terms for design review. A production product requires counsel-approved, versioned terms with recorded acceptance.",
      sections: [
        { heading: "Prototype notice", body: "This interface is a design prototype. It does not offer financial products, hold funds, or process real transactions. All properties, plans, figures, people and records are fictional." },
        { heading: "Investment slots", body: "A slot is a fixed unit of principal within a specific investment round. Production terms would define the contractual right a slot grants, the issuer, and settlement obligations." },
        { heading: "Returns", body: "Returns are presented as expected returns for the stated full term. Production terms must set out how shortfalls, delays and losses are treated." },
        { heading: "Fees", body: "No fee is charged on deposits or investments in this prototype. Withdrawal fees are itemised before confirmation." },
      ],
    },
    {
      id: "privacy",
      title: "Privacy notice",
      version: "Prototype v0.2",
      effectiveAt: "2026-09-01T00:00:00Z",
      summary: "How a production RentBrown would collect and protect personal data. Nothing entered in this prototype is stored.",
      sections: [
        { heading: "What we would collect", body: "Account details, contact details, identity verification records, device and security events, and transaction history." },
        { heading: "Why", body: "To operate your account, meet identity and anti-fraud obligations, keep your account secure, and communicate about your investments." },
        { heading: "Identity documents", body: "Verification documents would be stored encrypted in private storage with restricted access, never in analytics or logs." },
        { heading: "Your choices", body: "Notification preferences are configurable by category. Security notifications cannot be disabled." },
      ],
    },
    {
      id: "risk",
      title: "Risk disclosure",
      version: "Prototype v0.2",
      effectiveAt: "2026-09-01T00:00:00Z",
      summary: "Key risks that a production product must disclose prominently, not only in a footer.",
      sections: [
        { heading: "Expected, not guaranteed", body: "Expected profit depends on the issuer settling its obligations at maturity. Underlying income and completion timelines can be delayed." },
        { heading: "Illiquidity", body: "Principal cannot be withdrawn before maturity." },
        { heading: "Concentration", body: "Spreading principal across several opportunities reduces exposure to any one property or operator." },
      ],
    },
  ],
  help: [
    { id: "h1", category: "GETTING_STARTED", title: "Your first investment in five minutes", summary: "From exploring opportunities to your first active position.", readMinutes: 4 },
    { id: "h2", category: "INVESTING", title: "Understanding principal, profit and maturity value", summary: "Why we show three figures and what each one means.", readMinutes: 3 },
    { id: "h3", category: "INVESTING", title: "Reading a property's proof documents", summary: "What title summaries, valuations and inspections tell you.", readMinutes: 5 },
    { id: "h4", category: "WALLET", title: "Available, reserved, bonus and pending balances", summary: "What each balance means and which one you can withdraw.", readMinutes: 3 },
    { id: "h5", category: "WALLET", title: "Withdrawing to your bank account", summary: "Fees, review times and verified destinations.", readMinutes: 3 },
    { id: "h6", category: "SECURITY", title: "Setting up your transaction PIN", summary: "How your PIN protects withdrawals and investments.", readMinutes: 2 },
    { id: "h7", category: "REFERRALS", title: "How referral rewards qualify", summary: "The three conditions and when rewards are credited.", readMinutes: 2 },
  ],
  company: {
    name: "RentBrown",
    tagline: "Property-backed investing, clearly structured.",
    purpose: "Make structured participation in Nigerian property income easier to understand, compare and track — for everyday investors.",
    standards: [
      "Present terms, evidence, fees and dates before commitment.",
      "Show principal and expected profit as separate figures, always.",
      "Keep wallet balances legible: available, reserved, bonus, pending.",
      "Use honest availability. No artificial urgency or countdown pressure.",
    ],
    prototypeNotice: "RentBrown V2 is a design prototype. All names, properties, documents, companies, registrations, returns, references and records shown are fictional and do not represent real offers, approvals or licences.",
    contact: { email: "hello@rentbrown.example", phone: "+234 700 000 0000", address: "Prototype — no registered office" },
  },
};
