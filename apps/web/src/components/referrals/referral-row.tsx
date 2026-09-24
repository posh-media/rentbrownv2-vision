import { Avatar, MoneyFigure, StatusPill } from "@rentbrown/ui";
import type { ReferralRecord } from "@rentbrown/types";
import { formatDate, formatMoney, initials } from "@rentbrown/utils";

import { labelFor, toneFor } from "../../lib/status";

/** Server-provided split: signup reward + accumulated deposit rewards. */
function rewardSplit(referral: ReferralRecord): string {
  if (referral.rewardAmount === 0) return "no reward";
  const signup = `${formatMoney(referral.signupReward, referral.currency)} signup`;
  if (referral.depositRewards > 0) {
    return `${signup} + ${formatMoney(referral.depositRewards, referral.currency)} deposit`;
  }
  return `${signup} on qualification`;
}

export function ReferralRow({ referral }: { referral: ReferralRecord }) {
  return (
    <div className="flex items-center gap-3 px-4 py-3.5 sm:px-5">
      <Avatar initials={initials(referral.displayName)} size="md" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className="truncate text-sm font-bold text-foreground">{referral.displayName}</span>
          <StatusPill tone={toneFor(referral.status)} className="shrink-0">
            {labelFor(referral.status)}
          </StatusPill>
        </div>
        <p className="mt-0.5 text-[11px] text-tertiary">
          Joined {formatDate(referral.joinedAt)} · {referral.statusNote}
        </p>
      </div>
      <div className="shrink-0 text-right">
        <MoneyFigure amount={referral.rewardAmount} currency={referral.currency} size="xs" />
        <p className="text-[10px] text-tertiary">{rewardSplit(referral)}</p>
      </div>
    </div>
  );
}
