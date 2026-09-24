"use client";

import * as React from "react";
import { useQueryClient } from "@tanstack/react-query";
import type { InvestorDataSource } from "@rentbrown/types";
import { createMockDataSource, type MockScenario } from "@rentbrown/mock-data";

const SCENARIO_KEY = "rb.scenario";
const LATENCY_KEY = "rb.latency";
const FAILING_KEY = "rb.failing";

const SCENARIOS: MockScenario[] = [
  "default",
  "new-investor",
  "kyc-pending",
  "kyc-rejected",
  "no-opportunities",
  "signed-out",
];

function readStored(): { scenario: MockScenario; latency: number; failing: Array<keyof InvestorDataSource> } {
  if (typeof window === "undefined") return { scenario: "default", latency: 450, failing: [] };
  const raw = window.localStorage.getItem(SCENARIO_KEY);
  const scenario = (SCENARIOS as string[]).includes(raw ?? "") ? (raw as MockScenario) : "default";
  const latency = Number(window.localStorage.getItem(LATENCY_KEY) ?? "450");
  let failing: Array<keyof InvestorDataSource> = [];
  try {
    const parsed = JSON.parse(window.localStorage.getItem(FAILING_KEY) ?? "[]") as unknown;
    if (Array.isArray(parsed)) failing = parsed as Array<keyof InvestorDataSource>;
  } catch {
    failing = [];
  }
  return { scenario, latency: Number.isFinite(latency) ? latency : 450, failing };
}

interface ScenarioControls {
  scenario: MockScenario;
  setScenario: (s: MockScenario) => void;
  latency: number;
  setLatency: (ms: number) => void;
  failing: Array<keyof InvestorDataSource>;
  setFailing: (methods: Array<keyof InvestorDataSource>) => void;
}

const DataSourceContext = React.createContext<InvestorDataSource | null>(null);
const ScenarioContext = React.createContext<ScenarioControls | null>(null);

const DEFAULT_CONFIG: { scenario: MockScenario; latency: number; failing: Array<keyof InvestorDataSource> } = {
  scenario: "default",
  latency: 450,
  failing: [],
};

const sameConfig = (
  a: { scenario: MockScenario; latency: number; failing: Array<keyof InvestorDataSource> },
  b: { scenario: MockScenario; latency: number; failing: Array<keyof InvestorDataSource> },
) => a.scenario === b.scenario && a.latency === b.latency && a.failing.length === b.failing.length && a.failing.every((m, i) => m === b.failing[i]);

export function DataProvider({ children }: { children: React.ReactNode }) {
  const queryClient = useQueryClient();
  // Server and first client render both use the default config — no hydration
  // mismatch. Stored overrides are applied in a mount effect.
  const [config, setConfig] = React.useState(DEFAULT_CONFIG);

  // The cache must be cleared BEFORE the source changes, not in an effect
  // watching it: child effects run before parent effects, so a post-change
  // clear() would destroy the freshly created queries and leave observers
  // bound to dead queries (everything stuck pending).
  const applyChange = React.useCallback(
    (
      current: { scenario: MockScenario; latency: number; failing: Array<keyof InvestorDataSource> },
      next: { scenario: MockScenario; latency: number; failing: Array<keyof InvestorDataSource> },
    ) => {
      if (sameConfig(current, next)) return;
      queryClient.clear();
      setConfig(next);
    },
    [queryClient],
  );

  React.useEffect(() => {
    // localStorage is only readable after mount; updating once here is
    // intentional, so the cascading-render warning does not apply. Config is
    // still DEFAULT at this point, so compare stored values against it.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    applyChange(DEFAULT_CONFIG, readStored());
  }, [applyChange]);

  const source = React.useMemo(
    () =>
      createMockDataSource({
        scenario: config.scenario,
        latencyMs: config.latency,
        failing: config.failing,
      }),
    [config],
  );

  const controls = React.useMemo<ScenarioControls>(
    () => ({
      ...config,
      setScenario: (scenario) => {
        window.localStorage.setItem(SCENARIO_KEY, scenario);
        applyChange(config, { ...config, scenario });
      },
      setLatency: (latency) => {
        window.localStorage.setItem(LATENCY_KEY, String(latency));
        applyChange(config, { ...config, latency });
      },
      setFailing: (failing) => {
        window.localStorage.setItem(FAILING_KEY, JSON.stringify(failing));
        applyChange(config, { ...config, failing });
      },
    }),
    [config, applyChange],
  );

  return (
    <DataSourceContext.Provider value={source}>
      <ScenarioContext.Provider value={controls}>{children}</ScenarioContext.Provider>
    </DataSourceContext.Provider>
  );
}

export function useDataSource(): InvestorDataSource {
  const ctx = React.useContext(DataSourceContext);
  if (!ctx) throw new Error("useDataSource must be used inside <DataProvider>");
  return ctx;
}

export function useScenario(): ScenarioControls {
  const ctx = React.useContext(ScenarioContext);
  if (!ctx) throw new Error("useScenario must be used inside <DataProvider>");
  return ctx;
}

/** Scenario id embedded in every query key so caches never cross scenarios. */
export function useScenarioKey(): string {
  return useScenario().scenario;
}
