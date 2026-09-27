"use client";

import * as React from "react";
import { Button, StatePanel } from "@rentbrown/ui";

import { useKyc } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";
import { KycForm } from "../../../../components/account/kyc-form";
import { KycStatusPanel } from "../../../../components/account/kyc-status-panel";

export default function KycPage() {
  const session = useRequireSession();
  const kyc = useKyc();
  const [formOpen, setFormOpen] = React.useState(false);

  if (session.isPending || kyc.isPending) return <PageSkeleton />;

  if (kyc.isError || !kyc.data) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load verification status"
        copy={kyc.error?.message}
        action={
          <Button variant="outline" size="sm" onClick={() => kyc.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const actionable = kyc.data.status === "NOT_STARTED" || kyc.data.status === "IN_PROGRESS" || kyc.data.status === "REJECTED";
  // An open draft always shows the form; NOT_STARTED/REJECTED open it on demand.
  const showForm = actionable && (formOpen || kyc.data.status === "IN_PROGRESS");

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader
        title="Identity verification"
        copy="Verification protects your account and is required before withdrawals."
      />
      <KycStatusPanel kyc={kyc.data} onStart={() => setFormOpen(true)} />
      {showForm ? <KycForm kyc={kyc.data} /> : null}
    </div>
  );
}
