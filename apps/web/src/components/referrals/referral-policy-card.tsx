import { DataRow, Divider } from "@rentbrown/ui";
import type { ReferralPolicy } from "@rentbrown/types";
import { formatBps, formatMoney } from "@rentbrown/utils";

/**
 * "How rewards work" — renders the server-owned ReferralPolicy verbatim.
 * The client never computes reward amounts; it displays policy values.
 */
export function ReferralPolicyCard({ policy }: { policy: ReferralPolicy }) {
  return (
    <div className="financial-card p-5 sm:p-6">
      <div className="flex items-center justify-between gap-2">
        <h2 className="text-base font-bold text-foreground">How rewards work</h2>
        <span className="text-[10px] font-semibold text-tertiary">Policy {policy.version}</span>
      </div>
      <div className="mt-2">
        <DataRow label="Signup reward" value={formatMoney(policy.signupReward, policy.currency)} strong />
        <DataRow label="Qualifying deposit" value={formatMoney(policy.qualifyingDeposit, policy.currency)} />
        <DataRow label="Deposit referral" value={`${formatBps(policy.depositReferralBps)} of referred deposits`} />
        <DataRow label="Deposit referral cap" value={`${formatMoney(policy.depositReferralCap, policy.currency)} per person`} />
      </div>
      <Divider className="my-4" />
      <p className="text-xs leading-5 text-muted-foreground">{policy.qualificationRule}</p>
    </div>
  );
}
