/**
 * Marketing-site editorial content. Fictional prototype copy — every claim is
 * about the product's design, never about regulatory status or performance.
 * Rule: no "guaranteed", "approved", "insured", "risk-free", "SEC", "CBN",
 * or invented registration facts anywhere in this file.
 */
import type { HowItWorksStep } from "@rentbrown/types";

export interface SiteHero {
  eyebrow: string;
  headline: string;
  subline: string;
  primaryCta: { label: string; href: string };
  secondaryCta: { label: string; href: string };
  /** Honest microcopy under the CTAs — no stats theatre. */
  footnote: string;
}

export interface SiteSection {
  eyebrow: string;
  title: string;
  body: string;
}

export interface LearnArticle {
  slug: string;
  title: string;
  excerpt: string;
  category: "CONCEPTS" | "PLATFORM" | "PROPERTY" | "GLOSSARY";
  readMinutes: number;
  body: Array<{ heading: string; paragraphs: string[] }>;
}

export interface AboutBlock {
  mission: SiteSection;
  principles: Array<{ title: string; body: string }>;
  prototypeNotice: string;
}

export const siteHero: SiteHero = {
  eyebrow: "Property-backed investing · Nigeria",
  headline: "Invest in property income, one clear slot at a time",
  subline:
    "RentBrown structures real property income into fixed-term investment slots — with the principal, the expected profit and the maturity value shown as three separate figures before you commit a single naira.",
  primaryCta: { label: "Get started", href: "#get-started" },
  secondaryCta: { label: "Explore opportunities", href: "/explore" },
  footnote: "Expected returns are not guaranteed. Review the risk disclosure on every opportunity.",
};

export const siteHowItWorks: HowItWorksStep[] = [
  { step: "01", title: "Create your account", body: "Sign up in minutes and complete identity verification when you're ready to withdraw." },
  { step: "02", title: "Explore opportunities", body: "Compare open rounds by slot price, expected return, duration, capacity — and the documents behind each property." },
  { step: "03", title: "Choose a plan", body: "Every plan states its full-term expected return, its duration, its limits and its risk disclosures up front." },
  { step: "04", title: "Invest", body: "Pick your number of slots and pay from your wallet, by bank transfer or by debit card. Review every amount before confirming." },
  { step: "05", title: "Track the term", body: "Follow each investment from activation to maturity — principal, expected profit and maturity value kept separate throughout." },
  { step: "06", title: "Receive proceeds", body: "At maturity, principal and any realised profit settle to your wallet according to the plan's terms." },
];

export const siteDifferentiators: Array<{ title: string; body: string }> = [
  {
    title: "Three figures, always separate",
    body: "Principal, expected profit and maturity value are never blurred into one number. You always know what you put in and what the plan expects to add.",
  },
  {
    title: "Evidence before commitment",
    body: "Every opportunity links to the documents behind it — title summaries, valuations, inspections, operator agreements — each with a reviewer and a date.",
  },
  {
    title: "A wallet you can actually read",
    body: "Available, reserved, bonus and pending balances are distinct, so what you can invest or withdraw is never ambiguous.",
  },
  {
    title: "Honest availability",
    body: "Slots show real capacity. When a round is sold out, it says sold out — there is no countdown theatre and no manufactured urgency.",
  },
];

export const siteTrust: SiteSection & { points: Array<{ title: string; body: string }> } = {
  eyebrow: "Trust & transparency",
  title: "Trust is a design decision",
  body: "RentBrown's approach is to earn confidence through clarity — not slogans. Every screen answers one question: what is your money doing right now?",
  points: [
    { title: "Terms before payment", body: "Duration, fees, limits and risk disclosures sit above the pay button, not behind it." },
    { title: "Documents, dated and reviewed", body: "Property evidence carries a reviewer and a version, so you can see when it was last checked." },
    { title: "Qualified language, always", body: "We say expected return, never guaranteed. Risk disclosures are part of every opportunity page." },
  ],
};

export const siteReferral: SiteSection & { footnote: string } = {
  eyebrow: "Referrals",
  title: "Share it, earn when it counts",
  body: "Invite people you know. When a referral completes verification and makes a qualifying first deposit, a fixed ₦1,500 signup reward is credited to your bonus balance — plus 1% of their qualifying deposits, up to ₦10,000 per person.",
  footnote: "Rewards are part of the product's referral policy and can change; the current terms are always shown in the app.",
};

export const siteAbout: AboutBlock = {
  mission: {
    eyebrow: "About RentBrown",
    title: "Property income shouldn't need a decoder",
    body: "RentBrown exists to make structured participation in Nigerian property income understandable for everyday investors — clear slots, clear terms, clear wallets. The product is built around one habit: showing you the whole picture before you commit.",
  },
  principles: [
    { title: "Clarity over cleverness", body: "Three separate figures, plain-language terms, fees itemised before confirmation." },
    { title: "Evidence over enthusiasm", body: "Documents carry reviewers and dates; availability is honest; nothing is dressed up." },
    { title: "Structure over scale", body: "Fixed-term slots in specific rounds — not a faceless fund — so each investment has a name, a term and a settlement event." },
  ],
  prototypeNotice:
    "RentBrown V2 is a design prototype. All properties, figures, people, documents and records shown are fictional and do not represent real offers, approvals or licences.",
};

export const learnArticles: LearnArticle[] = [
  {
    slug: "principal-profit-maturity",
    title: "Principal, expected profit and maturity value",
    excerpt: "The three figures on every RentBrown screen — and why we never merge them.",
    category: "CONCEPTS",
    readMinutes: 3,
    body: [
      {
        heading: "Your principal",
        paragraphs: [
          "Principal is what you commit — the number of slots multiplied by the slot price. It is allocated to the round for the full term and cannot be withdrawn early.",
        ],
      },
      {
        heading: "Expected profit",
        paragraphs: [
          "Expected profit is the plan's stated full-term return applied to your principal. It is expected, not guaranteed — settlement depends on the issuer meeting its obligations.",
        ],
      },
      {
        heading: "Maturity value",
        paragraphs: [
          "Maturity value is principal plus expected profit — the amount the plan expects to settle to your wallet at the end of the term. Keeping the three figures separate means you can always audit where a number came from.",
        ],
      },
    ],
  },
  {
    slug: "how-slots-and-rounds-work",
    title: "How slots, plans and rounds fit together",
    excerpt: "Property → plan → round → investment: the four-level structure behind every opportunity.",
    category: "PLATFORM",
    readMinutes: 4,
    body: [
      {
        heading: "A property produces income",
        paragraphs: [
          "Every opportunity starts with a real asset — serviced apartments, a development's finishing phase, a commercial block — and a stated revenue model.",
        ],
      },
      {
        heading: "A plan defines the terms",
        paragraphs: [
          "The plan sets the slot price, the expected full-term return, the duration, the limits and the risk disclosures. Plans can be reused across multiple funding rounds.",
        ],
      },
      {
        heading: "A round allocates capacity",
        paragraphs: [
          "Each round releases a fixed number of slots. Availability is shown honestly — open, nearing capacity, sold out, or coming soon.",
        ],
      },
      {
        heading: "Your investment snapshots the terms",
        paragraphs: [
          "When you invest, your principal, expected profit and maturity value are fixed at activation and tracked to settlement.",
        ],
      },
    ],
  },
  {
    slug: "wallet-balances-explained",
    title: "Available, reserved, bonus and pending",
    excerpt: "Four wallet balances that answer one question: what can you actually use right now?",
    category: "PLATFORM",
    readMinutes: 3,
    body: [
      {
        heading: "Available",
        paragraphs: ["Cleared funds you can invest or withdraw immediately."],
      },
      {
        heading: "Reserved",
        paragraphs: ["Funds committed to an in-flight request — a withdrawal under review or a pending investment. Held, not spent."],
      },
      {
        heading: "Pending",
        paragraphs: ["Inbound funds still confirming, like a bank-transfer deposit awaiting settlement."],
      },
      {
        heading: "Bonus",
        paragraphs: ["Rewards credited by policy — referral rewards, for example. Bonus funds can be invested or moved to available under the wallet's rules."],
      },
    ],
  },
  {
    slug: "reading-risk-disclosures",
    title: "How to read a risk disclosure",
    excerpt: "Expected, not guaranteed — what that phrase means and what to look for.",
    category: "CONCEPTS",
    readMinutes: 3,
    body: [
      {
        heading: "Expected ≠ guaranteed",
        paragraphs: [
          "Expected profit assumes the issuer settles its obligations. Rental income can be delayed; completion timelines can slip; markets can move. The plan's disclosures name the specific risks.",
        ],
      },
      {
        heading: "Illiquidity is real",
        paragraphs: ["Principal cannot be withdrawn before maturity. Only invest money you will not need during the term."],
      },
      {
        heading: "Concentration is a choice",
        paragraphs: ["Spreading principal across several opportunities reduces exposure to any single property or operator."],
      },
    ],
  },
];

export const siteFooter = {
  tagline: "Property-backed investing, clearly structured.",
  disclaimer:
    "RentBrown V2 is a design prototype. All properties, figures, people, documents and records shown are fictional and do not represent real offers, approvals or licences. Expected returns are not guaranteed.",
  columns: [
    {
      title: "Product",
      links: [
        { label: "How it works", href: "/how-it-works" },
        { label: "Explore", href: "/explore" },
        { label: "Learn", href: "/learn" },
        { label: "FAQ", href: "/faq" },
      ],
    },
    {
      title: "Company",
      links: [
        { label: "About", href: "/about" },
        { label: "Trust & transparency", href: "/trust" },
        { label: "Contact", href: "/about#contact" },
      ],
    },
    {
      title: "Legal",
      links: [
        { label: "Terms", href: "/legal/terms" },
        { label: "Privacy", href: "/legal/privacy" },
        { label: "Risk disclosure", href: "/legal/risk" },
      ],
    },
  ],
};
