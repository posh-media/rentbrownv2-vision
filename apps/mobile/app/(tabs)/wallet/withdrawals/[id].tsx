import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Clock, XCircle } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { WITHDRAWAL_STATUS, formatDateTime, formatMoney } from "@rentbrown/utils";

import { useWithdrawal } from "../../../../src/data/hooks";
import { t } from "../../../../src/theme";
import {
  Button,
  Caption,
  Card,
  DataRow,
  EmptyState,
  HeaderBar,
  MoneyFigure,
  Screen,
  SkeletonCard,
  StatePanel,
  Timeline,
  useToast,
} from "../../../../src/ui";

export default function WithdrawalStatus() {
  const { id } = useLocalSearchParams<{ id: string; state?: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const withdrawal = useWithdrawal(id ?? "");
  const w = withdrawal.data;

  if (withdrawal.isLoading) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar back title="Withdrawal" />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (!w) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar back title="Withdrawal" />
        <EmptyState title="Withdrawal not found" actionLabel="Back to wallet" onAction={() => router.replace("/(tabs)/wallet")} />
      </Screen>
    );
  }

  const status = WITHDRAWAL_STATUS[w.status];
  const done = w.status === "COMPLETED";
  const failed = w.status === "REJECTED" || w.status === "FAILED";

  return (
    <Screen bottomPad={110}>
      <HeaderBar back title={done ? "Withdrawal completed" : failed ? "Withdrawal rejected" : "Withdrawal submitted"} eyebrow={status.label} />
      <MoneyFigure minor={w.amount} currency={w.currency} size="xl" />
      <Caption tone="muted">Reference {w.reference}</Caption>

      {done ? (
        <StatePanel tone="success" icon={<CheckCircle2 size={18} color={t.status.success.fg} />} title="Paid" body={`${formatMoney(w.netAmount, w.currency)} was sent to ${w.destination.bankName} ${w.destination.accountNumberMasked}.`} />
      ) : failed ? (
        <StatePanel
          tone="error"
          icon={<XCircle size={18} color={t.status.error.fg} />}
          title="Rejected"
          body={`${w.rejectionReason ?? "This withdrawal could not be completed."} Reserved funds were returned to your available balance.`}
        />
      ) : (
        <StatePanel
          tone="pending"
          icon={<Clock size={18} color={t.status.pending.fg} />}
          title="Under review"
          body={`You will receive ${formatMoney(w.netAmount, w.currency)} in your ${w.destination.bankName} account when completed. Reviews typically complete within 1 business day.`}
        />
      )}

      <Card>
        <DataRow label="Amount" value={formatMoney(w.amount, w.currency)} strong />
        <DataRow label="Fee" value={formatMoney(w.fee, w.currency)} />
        <DataRow label="You receive" value={formatMoney(w.netAmount, w.currency)} strong success />
        <DataRow label="Destination" value={`${w.destination.bankName} ${w.destination.accountNumberMasked}`} />
        <DataRow label="Reference" value={w.reference} copyable={w.reference} />
        <DataRow label="Requested" value={formatDateTime(w.requestedAt)} />
        {w.completedAt ? <DataRow label="Completed" value={formatDateTime(w.completedAt)} /> : null}
      </Card>

      <Card style={{ gap: 12 }}>
        <Caption tone="muted">Timeline</Caption>
        <Timeline
          items={w.timeline.map((e) => ({
            label: WITHDRAWAL_STATUS[e.status]?.label ?? e.status,
            at: e.at ? formatDateTime(e.at) : null,
            state: e.at ? "done" : e.status === w.status ? "current" : "upcoming",
            note: e.note,
          }))}
        />
      </Card>

      <View style={{ flexDirection: "row", gap: 10 }}>
        <View style={{ flex: 1 }}>
          <Button variant="outline" fullWidth label="Return to wallet" onPress={() => router.replace("/(tabs)/wallet")} />
        </View>
        <View style={{ flex: 1 }}>
          <Button variant="ghost" fullWidth label="Contact support" onPress={() => toast("Support arrives with the backend phase")} />
        </View>
      </View>
    </Screen>
  );
}
