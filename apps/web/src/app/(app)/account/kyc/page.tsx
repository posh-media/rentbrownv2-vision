"use client";

import { Button, StatePanel } from "@rentbrown/ui";

import { useKyc } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";
import { KycStatusPanel } from "../../../../components/account/kyc-status-panel";

export default function KycPage() {
  const session = useRequireSession();
  const kyc = useKyc();

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

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader
        title="Identity verification"
        copy="Verification protects your account and is required before withdrawals."
      />
      <KycStatusPanel kyc={kyc.data} />
    </div>
  );
}
