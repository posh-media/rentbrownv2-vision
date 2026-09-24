"use client";

import * as React from "react";
import { FlaskConical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
  SegmentedControl,
  cn,
} from "@rentbrown/ui";
import { MOCK_SCENARIOS, type MockScenario } from "@rentbrown/mock-data";
import type { InvestorDataSource } from "@rentbrown/types";

import { useScenario } from "../../lib/data/provider";

const FAILABLE: Array<{ method: keyof InvestorDataSource; label: string }> = [
  { method: "getDashboard", label: "Dashboard" },
  { method: "listOpportunities", label: "Opportunities" },
  { method: "getWallet", label: "Wallet" },
  { method: "listTransactions", label: "Transactions" },
];

const LATENCIES = [
  { value: "0", label: "0 ms" },
  { value: "450", label: "450 ms" },
  { value: "1500", label: "1.5 s" },
];

/** Dev/review tooling: scenario, latency and failure simulation. */
export function PrototypeToolbar() {
  const { scenario, setScenario, latency, setLatency, failing, setFailing } = useScenario();
  const active = MOCK_SCENARIOS.find((s) => s.id === scenario);

  const toggleFailing = (method: keyof InvestorDataSource) => {
    setFailing(failing.includes(method) ? failing.filter((m) => m !== method) : [...failing, method]);
  };

  return (
    <div className="fixed bottom-[calc(env(safe-area-inset-bottom)+76px)] left-3 z-40 lg:bottom-6 lg:left-4">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Prototype settings — ${active?.label ?? scenario}`}
            className="glass flex min-h-11 items-center gap-2 rounded-full px-3 text-xs font-bold text-foreground shadow-md focus-visible:outline-2 focus-visible:outline-ring focus-visible:outline-offset-2 sm:px-4"
          >
            <FlaskConical className="size-4" aria-hidden />
            <span className="hidden sm:inline">Prototype · {active?.label ?? scenario}</span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" side="top" className="w-80 p-4">
          <p className="eyebrow text-muted-foreground">Scenario</p>
          <div role="radiogroup" aria-label="Scenario" className="mt-2 flex flex-col gap-1">
            {MOCK_SCENARIOS.map((s) => (
              <label
                key={s.id}
                className={cn(
                  "flex cursor-pointer flex-col gap-0.5 rounded-md border px-3 py-2",
                  s.id === scenario ? "border-primary bg-accent" : "border-border hover:bg-surface-subtle",
                )}
              >
                <span className="flex items-center gap-2 text-sm font-semibold text-foreground">
                  <input
                    type="radio"
                    name="rb-scenario"
                    className="accent-[var(--primary)]"
                    checked={s.id === scenario}
                    onChange={() => setScenario(s.id as MockScenario)}
                  />
                  {s.label}
                </span>
                <span className="pl-6 text-xs text-muted-foreground">{s.description}</span>
              </label>
            ))}
          </div>

          <p className="eyebrow mt-4 text-muted-foreground">Latency</p>
          <SegmentedControl
            className="mt-2 w-full"
            label="Simulated latency"
            options={LATENCIES}
            value={String(latency)}
            onChange={(v) => setLatency(Number(v))}
          />

          <p className="eyebrow mt-4 text-muted-foreground">Simulate failure</p>
          <div className="mt-2 flex flex-col gap-1.5">
            {FAILABLE.map((f) => (
              <label key={f.method} className="flex cursor-pointer items-center gap-2 text-sm text-foreground">
                <input
                  type="checkbox"
                  className="accent-[var(--primary)]"
                  checked={failing.includes(f.method)}
                  onChange={() => toggleFailing(f.method)}
                />
                {f.label}
              </label>
            ))}
          </div>

          <button
            type="button"
            className="mt-4 w-full rounded-md border border-border py-2 text-xs font-bold text-muted-foreground hover:bg-surface-subtle hover:text-foreground"
            onClick={() => {
              setScenario("default");
              setLatency(450);
              setFailing([]);
            }}
          >
            Reset
          </button>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
