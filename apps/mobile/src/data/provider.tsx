import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import * as React from "react";

import { createMockDataSource, type MockScenario } from "@rentbrown/mock-data";
import type { InvestorDataSource, Session } from "@rentbrown/types";

const SCENARIO_KEY = "rentbrown.prototype.scenario";
const LATENCY_KEY = "rentbrown.prototype.latency";

interface ScenarioState {
  scenario: MockScenario;
  latency: number;
  setScenario: (s: MockScenario) => void;
  setLatency: (ms: number) => void;
  /** Recreate the data source (e.g. after Reset). */
  resetSource: () => void;
}

const ScenarioContext = React.createContext<ScenarioState | null>(null);
const DataSourceContext = React.createContext<InvestorDataSource | null>(null);

const queryClient = new QueryClient({
  defaultOptions: {
    queries: { retry: 1, staleTime: 15_000 },
  },
});

export function DataProvider({ children }: { children: React.ReactNode }) {
  const [scenario, setScenarioState] = React.useState<MockScenario>("default");
  const [latency, setLatencyState] = React.useState(350);
  const [nonce, setNonce] = React.useState(0);

  React.useEffect(() => {
    void (async () => {
      const [s, l] = await Promise.all([
        AsyncStorage.getItem(SCENARIO_KEY),
        AsyncStorage.getItem(LATENCY_KEY),
      ]);
      if (s) setScenarioState(s as MockScenario);
      if (l) setLatencyState(Number(l) || 0);
    })();
  }, []);

  const source = React.useMemo(
    () => createMockDataSource({ scenario, latencyMs: latency }),
    // nonce intentionally recreates the source for Reset
    [scenario, latency, nonce],
  );

  const setScenario = React.useCallback((s: MockScenario) => {
    setScenarioState(s);
    void AsyncStorage.setItem(SCENARIO_KEY, s);
    queryClient.clear();
  }, []);
  const setLatency = React.useCallback((ms: number) => {
    setLatencyState(ms);
    void AsyncStorage.setItem(LATENCY_KEY, String(ms));
  }, []);
  const resetSource = React.useCallback(() => {
    setNonce((n) => n + 1);
    queryClient.clear();
  }, []);

  const value = React.useMemo(
    () => ({ scenario, latency, setScenario, setLatency, resetSource }),
    [scenario, latency, setScenario, setLatency, resetSource],
  );

  return (
    <ScenarioContext.Provider value={value}>
      <DataSourceContext.Provider value={source}>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </DataSourceContext.Provider>
    </ScenarioContext.Provider>
  );
}

export function useScenario(): ScenarioState {
  const ctx = React.useContext(ScenarioContext);
  if (!ctx) throw new Error("useScenario must be used inside DataProvider");
  return ctx;
}

export function useDataSource(): InvestorDataSource {
  const ctx = React.useContext(DataSourceContext);
  if (!ctx) throw new Error("useDataSource must be used inside DataProvider");
  return ctx;
}

export function useSession() {
  const ds = useDataSource();
  return useQuery<Session | null>({
    queryKey: ["session"],
    queryFn: () => ds.getSession(),
  });
}
