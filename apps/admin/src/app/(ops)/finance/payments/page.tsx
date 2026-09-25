"use client";

import * as React from "react";
import { useQuery } from "@tanstack/react-query";
import { StatePanel } from "@rentbrown/ui";
import { Check, Copy } from "lucide-react";

import { useAdminAuth } from "../../../../lib/data/provider";
import { PageHeader } from "../../../../components/page-header";
import { PermissionGate } from "../../../../components/permission-gate";
import { StatusCell } from "../../../../components/status-cell";

/**
 * Payment Infrastructure — Phase 5B operational surface.
 * Data: `admin_payment_overview` RPC (server truth; secret values are never
 * returned — only configured/last4 markers). Demo mode renders a
 * representative snapshot so the layout stays reviewable without a backend.
 */

interface Overview {
  config: Record<string, string>;
  deposits: Record<string, number> | null;
  review: {
    deposits_review_required: number;
    provider_events_unresolved: number;
    withdrawals_open: number;
    outbound_pending: number;
  };
}

const DEMO: Overview = {
  config: {
    "payment.endpoint.environment": "demo",
    "payment.endpoint.paystack.webhook": "https://example.supabase.co/functions/v1/payment-webhook-paystack",
    "payment.endpoint.korapay.webhook": "https://example.supabase.co/functions/v1/payment-webhook-korapay",
    "payment.provider.paystack.enabled": "true",
    "payment.provider.korapay.enabled": "true",
    "payment.provider.paystack.secret_set": "false",
    "payment.provider.paystack.secret_last4": "",
    "payment.provider.korapay.secret_set": "false",
    "payment.provider.korapay.secret_last4": "",
    "payment.provider.korapay.public_key": "",
    "payment.deposit.max_minor": "",
    "payment.deposit.expiry_minutes": "",
    "withdrawal.webhook.url": "https://hook.eu2.make.com/…",
    "withdrawal.webhook.enabled": "true",
  },
  deposits: null,
  review: {
    deposits_review_required: 0,
    provider_events_unresolved: 0,
    withdrawals_open: 0,
    outbound_pending: 0,
  },
};

const flag = (v: string | undefined) => v === "true";

function usePaymentOverview() {
  const { mode, client } = useAdminAuth();
  return useQuery<Overview>({
    queryKey: ["rb-admin", mode, "payment-overview"],
    queryFn: async () => {
      if (!client) return DEMO;
      const { data, error } = await client.rpc("admin_payment_overview");
      if (error) throw new Error(error.message);
      return data as unknown as Overview;
    },
  });
}

function CopyRow({ label, value, mono = true }: { label: string; value: string; mono?: boolean }) {
  const [copied, setCopied] = React.useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch { /* clipboard unavailable */ }
  };
  return (
    <div className="flex items-start justify-between gap-3 border-b border-border py-2.5 last:border-0">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <span className="flex items-center gap-1.5">
        <span className={`max-w-65 truncate text-xs font-semibold ${mono ? "font-mono" : ""}`} title={value}>
          {value || "—"}
        </span>
        {value ? (
          <button
            type="button"
            onClick={() => void copy()}
            aria-label={`Copy ${label}`}
            className="text-muted-foreground transition-colors hover:text-foreground"
          >
            {copied ? <Check className="size-3.5 text-[var(--success-fg)]" /> : <Copy className="size-3.5" />}
          </button>
        ) : null}
      </span>
    </div>
  );
}

function ProviderCard({
  name,
  prefix,
  cfg,
}: {
  name: string;
  prefix: string;
  cfg: Record<string, string>;
}) {
  const enabled = flag(cfg[`${prefix}.enabled`]);
  const secretSet = flag(cfg[`${prefix}.secret_set`]);
  const last4 = cfg[`${prefix}.secret_last4`] ?? "";
  const endpoint = cfg[`payment.endpoint.${name.toLowerCase()}.webhook`] ?? "";
  const status = enabled && secretSet ? "Ready" : enabled ? "Awaiting secret" : "Disabled";

  return (
    <section className="financial-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-extrabold">{name}</h2>
        <StatusCell
          status={status === "Ready" ? "CREDITED" : status === "Disabled" ? "neutral" : "AWAITING_TRANSFER"}
          label={status}
        />
      </div>
      <CopyRow label="Enabled" value={enabled ? "Yes" : "No"} mono={false} />
      <CopyRow label="Secret configured" value={secretSet ? "Yes" : "No — set provider secret"} mono={false} />
      <CopyRow label="Secret ending" value={last4 ? `…${last4}` : "—"} />
      <CopyRow label="Webhook endpoint" value={endpoint} />
      {name === "KoraPay" ? (
        <CopyRow label="Public key" value={cfg["payment.provider.korapay.public_key"] ?? "—"} />
      ) : null}
    </section>
  );
}

function Payments() {
  const { data, isLoading, isError, refetch } = usePaymentOverview();

  if (isLoading) {
    return <div className="financial-card h-72 animate-pulse" />;
  }
  if (isError || !data) {
    return (
      <StatePanel
        tone="error"
        title="Couldn't load payment configuration"
        copy="The admin_payment_overview RPC is unavailable or you lack access."
        action={
          <button onClick={() => refetch()} className="text-xs font-bold underline">
            Retry
          </button>
        }
      />
    );
  }

  const cfg = data.config;
  const env = cfg["payment.endpoint.environment"] ?? "—";
  const whEnabled = flag(cfg["withdrawal.webhook.enabled"]);
  const whUrl = cfg["withdrawal.webhook.url"] ?? "";
  const maxMinor = cfg["payment.deposit.max_minor"];
  const expiry = cfg["payment.deposit.expiry_minutes"];

  return (
    <div>
      <PageHeader
        title="Payment Infrastructure"
        description={`Provider rails, webhook endpoints and delivery health · Environment: ${env}`}
      />

      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="financial-card p-4">
          <p className="eyebrow text-muted-foreground">Review required</p>
          <p className="tabular mt-2 text-2xl font-extrabold">{data.review.deposits_review_required}</p>
          <p className="mt-1 text-xs text-muted-foreground">Deposits awaiting finance</p>
        </div>
        <div className="financial-card p-4">
          <p className="eyebrow text-muted-foreground">Unresolved events</p>
          <p className="tabular mt-2 text-2xl font-extrabold">{data.review.provider_events_unresolved}</p>
          <p className="mt-1 text-xs text-muted-foreground">Provider events needing attention</p>
        </div>
        <div className="financial-card p-4">
          <p className="eyebrow text-muted-foreground">Open withdrawals</p>
          <p className="tabular mt-2 text-2xl font-extrabold">{data.review.withdrawals_open}</p>
          <p className="mt-1 text-xs text-muted-foreground">In the payout pipeline</p>
        </div>
        <div className="financial-card p-4">
          <p className="eyebrow text-muted-foreground">Outbound queue</p>
          <p className="tabular mt-2 text-2xl font-extrabold">{data.review.outbound_pending}</p>
          <p className="mt-1 text-xs text-muted-foreground">Webhook deliveries queued/retrying</p>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-2">
        <ProviderCard name="Paystack" prefix="payment.provider.paystack" cfg={cfg} />
        <ProviderCard name="KoraPay" prefix="payment.provider.korapay" cfg={cfg} />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2">
        <section className="financial-card p-4">
          <h2 className="eyebrow mb-3 text-muted-foreground">Withdrawal automation</h2>
          <CopyRow label="Webhook enabled" value={whEnabled ? "Yes" : "No"} mono={false} />
          <CopyRow label="Webhook endpoint" value={whUrl ? `${whUrl.slice(0, 34)}…` : "—"} />
          <CopyRow
            label="Delivery health"
            value={
              data.review.outbound_pending === 0
                ? "Queue clear"
                : `${data.review.outbound_pending} pending`
            }
            mono={false}
          />
        </section>
        <section className="financial-card p-4">
          <h2 className="eyebrow mb-3 text-muted-foreground">Deposit policy</h2>
          <CopyRow label="Currency" value="NGN" mono={false} />
          <CopyRow label="Maximum deposit" value={maxMinor ? `${Number(maxMinor) / 100} (minor)` : "Not configured"} mono={false} />
          <CopyRow label="Pending expiry" value={expiry ? `${expiry} min` : "Not configured"} mono={false} />
        </section>
      </div>
    </div>
  );
}

export default function PaymentsPage() {
  return (
    <PermissionGate permission="finance.read" mode="page">
      <Payments />
    </PermissionGate>
  );
}
