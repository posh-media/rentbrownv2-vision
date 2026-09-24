/**
 * Fictional properties, plans and rounds. Every name, figure, document,
 * operator and location detail is invented for prototype review only.
 */
import type { InvestmentPlan, InvestmentRound, Property } from "@rentbrown/types";
import { naira } from "@rentbrown/utils";

const reviewed = (title: string, type: Property["proofDocuments"][number]["type"], summary: string, at: string, version = "v1.0"): Property["proofDocuments"][number] => ({
  id: `${type.toLowerCase()}-${at}`,
  type,
  title,
  summary,
  reviewedBy: "RentBrown review desk (fictional)",
  reviewedAt: at,
  version,
  status: "VERIFIED",
});

export const properties: Property[] = [
  {
    id: "prop_terraces",
    slug: "the-terraces-ikoyi",
    name: "The Terraces, Ikoyi",
    type: "Serviced residential apartments",
    location: { area: "Ikoyi", city: "Lagos", state: "Lagos", label: "Ikoyi, Lagos" },
    summary: "Twelve fully serviced two-bedroom apartments let to corporate tenants on annual leases.",
    description:
      "The Terraces is a completed, fully occupied residential block of twelve serviced apartments in Old Ikoyi. Units are let to corporate tenants on 12-month leases with rent paid annually in advance. The operator manages facilities, security and tenant relations under a fixed-fee agreement.",
    images: ["ikoyi-residences", "lekki-courts", "wuse-square"],
    operator: { name: "Brownstone Living Ltd (fictional)", description: "Residential operator managing 140 serviced units across Lagos in this prototype." },
    highlights: ["100% occupancy for the last 24 months", "Rent collected annually in advance", "Independent valuation completed Jul 2026", "Facilities managed under fixed-fee agreement"],
    revenueModel: "Investor returns are funded from annual rental income received in advance, held in a designated collections account.",
    proofDocuments: [
      reviewed("Title search summary", "TITLE", "Summary of registered title and encumbrance search for the Ikoyi parcel.", "2026-07-14T09:00:00Z"),
      reviewed("Independent valuation", "VALUATION", "Open-market valuation prepared by a registered estate surveyor.", "2026-07-21T09:00:00Z"),
      reviewed("Site inspection report", "INSPECTION", "Dated inspection covering condition, occupancy and facilities.", "2026-08-02T09:00:00Z"),
      reviewed("Operator agreement", "OPERATOR_AGREEMENT", "Fixed-fee management agreement between the issuer and the operator.", "2026-06-30T09:00:00Z"),
    ],
    updates: [
      { id: "u1", title: "Round 2 opened", body: "Capacity of 500 slots released after Round 1 closed fully subscribed.", publishedAt: "2026-09-01T08:00:00Z" },
      { id: "u2", title: "Annual leases renewed", body: "All twelve tenancies renewed for the 2026/27 lease year.", publishedAt: "2026-08-15T08:00:00Z" },
    ],
  },
  {
    id: "prop_palm_court",
    slug: "palm-court-lekki",
    name: "Palm Court, Lekki",
    type: "Residential development (final phase)",
    location: { area: "Lekki Phase 1", city: "Lagos", state: "Lagos", label: "Lekki Phase 1, Lagos" },
    summary: "Final finishing phase of eight terrace duplexes, six already pre-sold with deposits received.",
    description:
      "Palm Court is a gated cluster of eight four-bedroom terraces in Lekki Phase 1. Structural work is complete; this round funds finishing and external works. Six units are pre-sold with 30% deposits held in escrow, and completion payments fund the maturity value.",
    images: ["lekki-courts", "ikoyi-residences"],
    operator: { name: "Coastline Developments (fictional)", description: "Residential developer with four completed Lekki schemes in this prototype." },
    highlights: ["Structure complete, finishing phase only", "6 of 8 units pre-sold", "Deposits held in escrow", "Quantity surveyor cost schedule reviewed"],
    revenueModel: "Maturity value is funded from completion payments on pre-sold units and the sale of the two remaining units.",
    proofDocuments: [
      reviewed("Title search summary", "TITLE", "Registered title summary for the Lekki Phase 1 plot.", "2026-01-20T09:00:00Z"),
      reviewed("Project cost schedule", "COST_SCHEDULE", "Quantity surveyor's finishing-phase cost schedule and contingency.", "2026-02-11T09:00:00Z"),
      reviewed("Site progress report", "INSPECTION", "Monthly progress report with dated photographs.", "2026-09-05T09:00:00Z", "v7.0"),
      reviewed("Legal opinion", "LEGAL_OPINION", "Opinion on pre-sale agreements and escrow arrangements.", "2026-02-25T09:00:00Z"),
    ],
    updates: [{ id: "u1", title: "Finishing 80% complete", body: "Tiling and joinery complete in six units; external works underway.", publishedAt: "2026-09-05T08:00:00Z" }],
  },
  {
    id: "prop_wuse",
    slug: "wuse-square-residences",
    name: "Wuse Square Residences",
    type: "Rental apartments",
    location: { area: "Wuse II", city: "Abuja", state: "FCT", label: "Wuse II, Abuja" },
    summary: "Twenty studio and one-bedroom apartments let to young professionals in central Abuja.",
    description:
      "Wuse Square is an occupied block of twenty compact apartments a short walk from the Wuse II commercial district. Rents are collected annually and the block has maintained above 95% occupancy since 2023.",
    images: ["wuse-square", "ikoyi-residences"],
    operator: { name: "Capital Homes Management (fictional)", description: "Abuja lettings and facilities operator in this prototype." },
    highlights: ["95%+ occupancy since 2023", "Compact units with strong demand", "Two prior rounds settled on time"],
    revenueModel: "Investor returns are funded from annual rental income collected in advance.",
    proofDocuments: [
      reviewed("Title search summary", "TITLE", "Registered title summary for the Wuse II plot.", "2025-11-03T09:00:00Z"),
      reviewed("Independent valuation", "VALUATION", "Valuation by a registered estate surveyor.", "2025-11-18T09:00:00Z"),
      reviewed("Site inspection report", "INSPECTION", "Condition and occupancy inspection.", "2026-04-10T09:00:00Z", "v3.0"),
    ],
    updates: [{ id: "u1", title: "Round 3 fully subscribed", body: "All 2,000 slots allocated. The next round will be announced after maturity.", publishedAt: "2026-05-04T08:00:00Z" }],
  },
  {
    id: "prop_harbour",
    slug: "harbour-view-suites",
    name: "Harbour View Suites",
    type: "Short-let serviced suites",
    location: { area: "Old GRA", city: "Port Harcourt", state: "Rivers", label: "Old GRA, Port Harcourt" },
    summary: "Sixteen serviced suites operated for corporate short-let stays near the Port Harcourt business district.",
    description:
      "Harbour View is a purpose-built short-let block of sixteen suites serving corporate travellers. The operator holds framework agreements with three energy-sector employers that account for the majority of nights sold.",
    images: ["ikoyi-residences", "wuse-square"],
    operator: { name: "Riverside Hospitality (fictional)", description: "Short-let operator with two Port Harcourt properties in this prototype." },
    highlights: ["Corporate framework agreements in place", "68% average occupancy over 12 months", "Insurance cover reviewed"],
    revenueModel: "Investor returns are funded from short-let operating income under the operator agreement, with a reserve held by the issuer.",
    proofDocuments: [
      reviewed("Title search summary", "TITLE", "Registered title summary for the Old GRA parcel.", "2026-06-02T09:00:00Z"),
      reviewed("Insurance schedule", "INSURANCE", "Building and public-liability cover summary.", "2026-06-15T09:00:00Z"),
      reviewed("Operator agreement", "OPERATOR_AGREEMENT", "Operating agreement and reserve arrangements.", "2026-06-20T09:00:00Z"),
      reviewed("Site inspection report", "INSPECTION", "Condition and occupancy inspection.", "2026-08-28T09:00:00Z"),
    ],
    updates: [{ id: "u1", title: "Round 1 open", body: "First RentBrown round for this property. 1,000 slots released.", publishedAt: "2026-09-10T08:00:00Z" }],
  },
  {
    id: "prop_bodija",
    slug: "bodija-gardens",
    name: "Bodija Gardens",
    type: "Purpose-built student housing",
    location: { area: "Bodija", city: "Ibadan", state: "Oyo", label: "Bodija, Ibadan" },
    summary: "Forty-room student residence beside the University of Ibadan with sessional rent paid in advance.",
    description:
      "Bodija Gardens is a forty-room student residence with shared kitchens and study areas. Rooms are let per academic session with rent paid in advance, and the residence has been fully let for the last three sessions.",
    images: ["lekki-courts", "wuse-square"],
    operator: { name: "Campus Living Partners (fictional)", description: "Student accommodation operator in this prototype." },
    highlights: ["Fully let for three consecutive sessions", "Sessional rent paid in advance", "Low entry slot price"],
    revenueModel: "Investor returns are funded from sessional rent collected in advance.",
    proofDocuments: [
      reviewed("Title search summary", "TITLE", "Registered title summary for the Bodija plot.", "2026-07-30T09:00:00Z"),
      reviewed("Independent valuation", "VALUATION", "Valuation by a registered estate surveyor.", "2026-08-06T09:00:00Z"),
      reviewed("Site inspection report", "INSPECTION", "Condition and occupancy inspection.", "2026-08-20T09:00:00Z"),
    ],
    updates: [],
  },
  {
    id: "prop_maitama",
    slug: "maitama-heights",
    name: "Maitama Heights",
    type: "Premium residential apartments",
    location: { area: "Maitama", city: "Abuja", state: "FCT", label: "Maitama, Abuja" },
    summary: "Eight premium three-bedroom apartments let to diplomatic and corporate tenants.",
    description:
      "Maitama Heights is a low-rise block of eight premium apartments. Tenancies are with diplomatic missions and corporate occupiers on two-year leases. The round opens in October after document review completes.",
    images: ["wuse-square", "lekki-courts", "ikoyi-residences"],
    operator: { name: "Brownstone Living Ltd (fictional)", description: "Residential operator managing 140 serviced units across Lagos and Abuja in this prototype." },
    highlights: ["Two-year corporate leases", "Premium location", "Documents under review before opening"],
    revenueModel: "Investor returns are funded from lease income received in advance under two-year corporate tenancies.",
    proofDocuments: [
      reviewed("Title search summary", "TITLE", "Registered title summary for the Maitama parcel.", "2026-09-12T09:00:00Z"),
      { id: "val-maitama", type: "VALUATION", title: "Independent valuation", summary: "Valuation in progress; publication expected before the round opens.", reviewedBy: "Pending review", reviewedAt: "2026-09-12T09:00:00Z", version: "draft", status: "PENDING_REVIEW" },
    ],
    updates: [{ id: "u1", title: "Round scheduled", body: "Round 1 is scheduled to open on 15 October 2026 once the valuation is published.", publishedAt: "2026-09-12T08:00:00Z" }],
  },
];

const commonTerms = [
  "Principal is allocated to the round on activation and cannot be withdrawn before maturity.",
  "The stated return applies to the full term, not per month.",
  "Principal and expected profit are credited to your available balance at settlement after maturity.",
  "No investment fee is charged. Withdrawal fees are shown before you confirm a withdrawal.",
];
const commonRisks = [
  "Returns are expected, not guaranteed. Settlement depends on the issuer meeting its obligations.",
  "Property income and completion timelines can be delayed.",
  "This prototype does not offer financial products; all figures are illustrative.",
];

export const plans: InvestmentPlan[] = [
  { id: "plan_terraces_income", propertyId: "prop_terraces", name: "Residential income note", currency: "NGN", slotPrice: naira(100_000), roiBps: 1650, duration: { value: 12, unit: "MONTHS" }, minSlots: 1, maxSlotsPerUser: 50, investmentFeeBps: 0, terms: commonTerms, riskDisclosures: commonRisks, status: "PUBLISHED" },
  { id: "plan_palm_dev", propertyId: "prop_palm_court", name: "Development finance note", currency: "NGN", slotPrice: naira(50_000), roiBps: 1400, duration: { value: 9, unit: "MONTHS" }, minSlots: 2, maxSlotsPerUser: 100, investmentFeeBps: 0, terms: commonTerms, riskDisclosures: [...commonRisks, "Development finance carries completion risk; pre-sale deposits are held in escrow."], status: "PUBLISHED" },
  { id: "plan_wuse_yield", propertyId: "prop_wuse", name: "Rental yield note", currency: "NGN", slotPrice: naira(10_000), roiBps: 1250, duration: { value: 6, unit: "MONTHS" }, minSlots: 5, maxSlotsPerUser: 500, investmentFeeBps: 0, terms: commonTerms, riskDisclosures: commonRisks, status: "PUBLISHED" },
  { id: "plan_harbour_shortlet", propertyId: "prop_harbour", name: "Short-let income note", currency: "NGN", slotPrice: naira(25_000), roiBps: 1500, duration: { value: 8, unit: "MONTHS" }, minSlots: 2, maxSlotsPerUser: 200, investmentFeeBps: 0, terms: commonTerms, riskDisclosures: [...commonRisks, "Short-let income varies with occupancy; a reserve is held by the issuer."], status: "PUBLISHED" },
  { id: "plan_bodija_yield", propertyId: "prop_bodija", name: "Rental yield note", currency: "NGN", slotPrice: naira(10_000), roiBps: 1300, duration: { value: 6, unit: "MONTHS" }, minSlots: 1, maxSlotsPerUser: 300, investmentFeeBps: 0, terms: commonTerms, riskDisclosures: commonRisks, status: "PUBLISHED" },
  { id: "plan_maitama_income", propertyId: "prop_maitama", name: "Residential income note", currency: "NGN", slotPrice: naira(250_000), roiBps: 1700, duration: { value: 18, unit: "MONTHS" }, minSlots: 1, maxSlotsPerUser: 20, investmentFeeBps: 0, terms: commonTerms, riskDisclosures: commonRisks, status: "PUBLISHED" },
];

const round = (r: Omit<InvestmentRound, "availableSlots" | "allocatedPct">): InvestmentRound => ({
  ...r,
  availableSlots: r.totalSlots - r.allocatedSlots - r.reservedSlots,
  allocatedPct: Math.round(((r.allocatedSlots + r.reservedSlots) / r.totalSlots) * 100),
});

export const rounds: InvestmentRound[] = [
  round({ id: "rnd_terraces_2", planId: "plan_terraces_income", roundNumber: 2, status: "OPEN", totalSlots: 500, allocatedSlots: 332, reservedSlots: 8, opensAt: "2026-09-01T08:00:00Z", closesAt: "2026-10-31T17:00:00Z", projectedStartAt: "2026-09-30T00:00:00Z", projectedMaturityAt: "2027-09-30T00:00:00Z" }),
  round({ id: "rnd_palm_2", planId: "plan_palm_dev", roundNumber: 2, status: "NEARING_CAPACITY", totalSlots: 1200, allocatedSlots: 1086, reservedSlots: 6, opensAt: "2026-08-01T08:00:00Z", closesAt: "2026-10-15T17:00:00Z", projectedStartAt: "2026-10-15T00:00:00Z", projectedMaturityAt: "2027-07-15T00:00:00Z" }),
  round({ id: "rnd_wuse_3", planId: "plan_wuse_yield", roundNumber: 3, status: "SOLD_OUT", totalSlots: 2000, allocatedSlots: 2000, reservedSlots: 0, opensAt: "2026-04-15T08:00:00Z", closesAt: "2026-05-04T17:00:00Z", projectedStartAt: "2026-05-02T00:00:00Z", projectedMaturityAt: "2026-11-02T00:00:00Z" }),
  round({ id: "rnd_harbour_1", planId: "plan_harbour_shortlet", roundNumber: 1, status: "OPEN", totalSlots: 1000, allocatedSlots: 322, reservedSlots: 18, opensAt: "2026-09-10T08:00:00Z", closesAt: "2026-11-30T17:00:00Z", projectedStartAt: "2026-12-01T00:00:00Z", projectedMaturityAt: "2027-08-01T00:00:00Z" }),
  round({ id: "rnd_bodija_1", planId: "plan_bodija_yield", roundNumber: 1, status: "OPEN", totalSlots: 3000, allocatedSlots: 340, reservedSlots: 20, opensAt: "2026-09-20T08:00:00Z", closesAt: "2026-11-15T17:00:00Z", projectedStartAt: "2026-11-16T00:00:00Z", projectedMaturityAt: "2027-05-16T00:00:00Z" }),
  round({ id: "rnd_maitama_1", planId: "plan_maitama_income", roundNumber: 1, status: "SCHEDULED", totalSlots: 200, allocatedSlots: 0, reservedSlots: 0, opensAt: "2026-10-15T08:00:00Z", closesAt: "2026-12-15T17:00:00Z", projectedStartAt: "2026-12-16T00:00:00Z", projectedMaturityAt: "2028-06-16T00:00:00Z" }),
];
