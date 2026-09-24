import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Clock, XCircle } from "lucide-react-native";
import * as React from "react";
import { DEPOSIT_STATUS, formatDateTime, formatMoney } from "@rentbrown/utils";

import { TransferInstructions } from "../../../../src/components/misc";
import { useDeposit } from "../../../../src/data/hooks";
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
  useToast,
} from "../../../../src/ui";

export default function DepositStatus() {
  const { id } = useLocalSearchParams<{ id: string; state?: string }>();
  const router = useRouter();
  const { toast } = useToast();
  const deposit = useDeposit(id ?? "");
  const d = deposit.data;

  if (deposit.isLoading) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar back title="Deposit" />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  if (!d) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar back title="Deposit" />
        <EmptyState title="Deposit not found" actionLabel="Back to wallet" onAction={() => router.replace("/(tabs)/wallet")} />
      </Screen>
    );
  }

  const status = DEPOSIT_STATUS[d.status];
  return (
    <Screen bottomPad={110}>
      <HeaderBar back title="Deposit" eyebrow={status.label} />
      <MoneyFigure minor={d.amount} currency={d.currency} size="xl" />
      <Caption tone="muted">Reference {d.reference} · {d.method === "BANK_TRANSFER" ? "Bank transfer" : "Card"}</Caption>

      {d.status === "AWAITING_TRANSFER" ? (
        <>
          <StatePanel
            tone="warning"
            icon={<Clock size={18} color={t.status.warning.fg} />}
            title="Make your transfer"
            body="Use only a bank account in your name. Your wallet updates after confirmation."
          />
          {d.transferInstructions ? <TransferInstructions account={d.transferInstructions} amount={d.amount} /> : null}
          <Button variant="outline" label="I've sent it" onPress={() => toast("We'll confirm once your bank settles")} />
        </>
      ) : d.status === "CONFIRMING" ? (
        <StatePanel tone="pending" icon={<Clock size={18} color={t.status.pending.fg} />} title="Confirming your transfer" body="This usually takes a few minutes after your bank settles." />
      ) : d.status === "CREDITED" ? (
        <StatePanel tone="success" icon={<CheckCircle2 size={18} color={t.status.success.fg} />} title="Deposit credited" body={`${formatMoney(d.amount, d.currency)} is now in your available balance.`} />
      ) : (
        <StatePanel tone="error" icon={<XCircle size={18} color={t.status.error.fg} />} title={status.label} body="This deposit did not complete." />
      )}

      <Card>
        <DataRow label="Amount" value={formatMoney(d.amount, d.currency)} strong />
        <DataRow label="Method" value={d.method === "BANK_TRANSFER" ? "Bank transfer" : "Debit card"} />
        <DataRow label="Fee" value={d.fee === 0 ? "None" : formatMoney(d.fee, d.currency)} />
        <DataRow label="Created" value={formatDateTime(d.createdAt)} />
        {d.creditedAt ? <DataRow label="Credited" value={formatDateTime(d.creditedAt)} /> : null}
        <DataRow label="Reference" value={d.reference} copyable={d.reference} />
      </Card>
      <Button variant="outline" label="Back to wallet" onPress={() => router.replace("/(tabs)/wallet")} />
    </Screen>
  );
}
