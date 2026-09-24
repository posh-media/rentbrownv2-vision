import Link from "next/link";
import { Gift } from "lucide-react";
import { MoneyFigure } from "@rentbrown/ui";
import type { ReferralSummary } from "@rentbrown/types";
import { formatMoney } from "@rentbrown/utils";

export function ReferralSummaryCard({ summary }: { summary: ReferralSummary }) {
  return (
    <div className="financial-card p-5">
      <div className="flex items-center gap-2">
        <Gift className="size-4 text-primary" aria-hidden />
        <h3 className="text-sm font-bold text-foreground">Referral rewards</h3>
      </div>
      <MoneyFigure amount={summary.earnedRewards} currency={summary.currency} size="sm" className="mt-3" />
      <p className="mt-1 text-xs text-muted-foreground">
        {formatMoney(summary.pendingRewards, summary.currency)} pending
      </p>
      <Link href="/referrals" className="mt-3 inline-block text-xs font-bold text-primary hover:underline">
        Invite friends
      </Link>
    </div>
  );
}
