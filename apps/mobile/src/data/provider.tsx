import AsyncStorage from "@react-native-async-storage/async-storage";
import {
  QueryClient,
  QueryClientProvider,
  useQuery,
} from "@tanstack/react-query";
import { router } from "expo-router";
import * as React from "react";

import { createMockDataSource, type MockScenario } from "@rentbrown/mock-data";
import { createSupabaseInvestorDataSource } from "@rentbrown/supabase";
import type { AuthGateway, InvestorDataSource, Session } from "@rentbrown/types";

import { supabase } from "../lib/supabase";

const SCENARIO_KEY = "rentbrown.prototype.scenario";
const LATENCY_KEY = "rentbrown.prototype.latency";

/**
 * The app's data source always carries an `auth` slot: the live
 * `AuthGateway` when Supabase env is configured, `null` in pure mock mode
 * (review builds without .env). Domain reads stay mock either way until
 * per-domain Supabase adapters land.
 */
export type AppDataSource = InvestorDataSource & { auth: AuthGateway | null };

interface ScenarioState {
  scenario: MockScenario;
  latency: number;
  setScenario: (s: MockScenario) => void;
  setLatency: (ms: number) => void;
  /** Recreate the data source (e.g. after Reset). */
  resetSource: () => void;
}

const ScenarioContext = React.createContext<ScenarioState | null>(null);
const DataSourceContext = React.createContext<AppDataSource | null>(null);

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

  // Domain layer — always mock today; the prototype scenario/latency
  // controls keep working regardless of auth mode.
  const domain = React.useMemo(
    () => createMockDataSource({ scenario, latencyMs: latency }),
    // nonce intentionally recreates the source for Reset
    [scenario, latency, nonce],
  );

  // Identity layer — real Supabase Auth when env resolves, otherwise the
  // same mock source with `auth: null` so review builds still run.
  const source = React.useMemo<AppDataSource>(
    () =>
      supabase
        ? createSupabaseInvestorDataSource(supabase, domain)
        : { ...domain, auth: null },
    [domain],
  );

  // Keep react-query in sync with Supabase auth transitions.
  React.useEffect(() => {
    const auth = source.auth;
    if (!auth) return;
    return auth.onAuthStateChange((event) => {
      if (event === "SIGNED_OUT") {
        // Drop every cached domain query; group layouts redirect on session.
        queryClient.clear();
      } else if (event === "PASSWORD_RECOVERY") {
        // A recovery session was just established — land on the reset form.
        router.push("/reset-password" as never);
      } else {
        // SIGNED_IN / TOKEN_REFRESHED / USER_UPDATED
        void queryClient.invalidateQueries({ queryKey: ["session"] });
        void queryClient.invalidateQueries({ queryKey: ["profile"] });
      }
    });
  }, [source]);

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

export function useDataSource(): AppDataSource {
  const ctx = React.useContext(DataSourceContext);
  if (!ctx) throw new Error("useDataSource must be used inside DataProvider");
  return ctx;
}

/** Live Supabase auth gateway, or null when this build runs in mock mode. */
export function useAuth(): AuthGateway | null {
  return useDataSource().auth;
}

export function useSession() {
  const ds = useDataSource();
  return useQuery<Session | null>({
    queryKey: ["session"],
    queryFn: () => ds.getSession(),
  });
}
