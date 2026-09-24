"use client";

import * as React from "react";
import Link from "next/link";
import { formatDateTime, formatMoney } from "@rentbrown/utils";
import { StatePanel } from "@rentbrown/ui";
import { CheckCircle2 } from "lucide-react";

import { useLedgerOverview } from "../../lib/data/hooks";
import { MetricSkeleton, PageHeader } from "../../components/page-header";
import { PermissionGate } from "../../components/permission-gate";

function FinanceOverview() {
  const { data, isLoading, isError, refetch } = useLedgerOverview();

  return (
    <div>
      <PageHeader
        title="Ledger overview"
        description={data ? `Platform wallet totals as of ${formatDateTime(data.asOf)}. Invariants are computed by the mock server — never recomputed here.` : "Platform wallet totals."}
      />
      {isLoading ? (
        <MetricSkeleton count={4} />
      ) : isError || !data ? (
        <StatePanel tone="error" title="Couldn't load the ledger" copy="The mock data source failed to respond." action={<button onClick={() => refetch()} className="text-xs font-bold underline">Retry</button>} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {data.accounts.map((a) => (
              <div key={a.account} className="financial-card p-4">
                <p className="eyebrow text-muted-foreground">{a.label}</p>
                <p className="tabular mt-2.5 text-2xl font-extrabold">{formatMoney(a.total, a.currency)}</p>
                <p className="mt-1 text-xs text-muted-foreground">{a.holders} holders</p>
              </div>
            ))}
          </div>

          <div className="mt-6 grid gap-6 lg:grid-cols-3">
            <section className="financial-card p-4 lg:col-span-2">
              <h2 className="eyebrow mb-3 text-muted-foreground">Invariants</h2>
              <div className="flex flex-col gap-2">
                {data.invariants.map((inv) => (
                  <div key={inv.id} className="flex items-start gap-3 rounded-md border border-border p-3">
                    <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[var(--success-fg)]" />
                    <div>
                      <p className="text-sm font-semibold">{inv.label}</p>
                      <p className="mt-0.5 text-xs text-muted-foreground">{inv.detail}</p>
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="financial-card h-fit p-4">
              <h2 className="eyebrow mb-3 text-muted-foreground">Today</h2>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md border p-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Entries posted</p>
                  <p className="tabular mt-1 text-xl font-extrabold">{data.postedToday}</p>
                </div>
                <div className="rounded-md border p-3">
                  <p className="text-[10px] font-bold uppercase text-muted-foreground">Reversals</p>
                  <p className="tabular mt-1 text-xl font-extrabold">{data.reversalsToday}</p>
                </div>
              </div>
              <div className="mt-4 flex flex-col gap-1.5 text-xs font-semibold">
                <Link href="/finance/deposits" className="text-primary hover:underline">Deposits →</Link>
                <Link href="/finance/withdrawals" className="text-primary hover:underline">Withdrawal review queue →</Link>
                <Link href="/finance/transactions" className="text-primary hover:underline">All transactions →</Link>
                <Link href="/finance/reconciliation" className="text-primary hover:underline">Reconciliation →</Link>
              </div>
            </section>
          </div>
        </>
      )}
    </div>
  );
}

export default function FinancePage() {
  return (
    <PermissionGate permission="finance.read" mode="page">
      <FinanceOverview />
    </PermissionGate>
  );
}
