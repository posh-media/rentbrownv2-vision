/**
 * @rentbrown/mock-data — realistic, clearly fictional fixtures and an
 * in-memory `InvestorDataSource` for Phase 1. Replaced by a Firebase-backed
 * adapter in a later phase; the UI depends only on the interface.
 */
export { createMockDataSource, MockNetworkError, type MockDataSourceOptions } from "./mock-data-source";
export { buildScenario, MOCK_SCENARIOS, type MockScenario, type ScenarioState } from "./scenarios";
export { MOCK_NOW } from "./fixtures/investor";
export { plans, properties, rounds } from "./fixtures/catalogue";
export { content } from "./fixtures/content";
export * as investorFixtures from "./fixtures/investor";

/**
 * Property image asset keys used by fixtures. Each platform maps these to a
 * URL (`/properties/<key>.jpg` on web) or a `require()` on mobile.
 */
export const PROPERTY_IMAGE_KEYS = ["ikoyi-residences", "lekki-courts", "wuse-square"] as const;
export type PropertyImageKey = (typeof PROPERTY_IMAGE_KEYS)[number];

export const PROTOTYPE_NOTICE =
  "Prototype data. All properties, figures, people, documents and references are fictional.";
