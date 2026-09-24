import { useRouter } from "expo-router";
import { Building2, Gift } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { formatBps, formatMoney } from "@rentbrown/utils";

import { TransactionRow } from "../../../src/components/transaction-row";
import { TransactionDetailSheet } from "../../../src/components/transaction-sheet";
import { WalletBalanceCard } from "../../../src/components/wallet-balance-card";
import { useTransactions, useWallet } from "../../../src/data/hooks";
import { useSession } from "../../../src/data/provider";
import { t } from "../../../src/theme";
import {
  Body,
  Button,
  Caption,
  Card,
  DataRow,
  EmptyState,
  HeaderBar,
  ListRow,
  Screen,
  SkeletonCard,
  StatusPill,
  useToast,
} from "../../../src/ui";

export default function Wallet() {
  const router = useRouter();
  const session = useSession();
  const wallet = useWallet();
  const transactions = useTransactions();
  const { toast } = useToast();
  const [detail, setDetail] = React.useState<string | null>(null);

  if (!session.isLoading && !session.data) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar large title="Wallet" />
        <EmptyState title="Sign in to see your wallet" actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} />
      </Screen>
    );
  }

  const w = wallet.data;
  const recent = (transactions.data ?? []).slice(0, 6);

  return (
    <Screen bottomPad={110}>
      <HeaderBar large title="Wallet" eyebrow="What is available, reserved, rewarded or pending" />
      {wallet.isLoading ? (
        <SkeletonCard lines={5} />
      ) : !w ? (
        <EmptyState title="Couldn't load wallet" body="Pull to refresh." />
      ) : (
        <>
          <WalletBalanceCard wallet={w} />
          <View style={{ flexDirection: "row", gap: 10 }}>
            <View style={{ flex: 1 }}>
              <Button size="lg" fullWidth label="Deposit" onPress={() => router.push("/(modals)/deposit")} />
            </View>
            <View style={{ flex: 1 }}>
              <Button size="lg" fullWidth variant="outline" label="Withdraw" onPress={() => router.push("/(modals)/withdraw")} />
            </View>
          </View>

          <Card padded={false} style={{ paddingVertical: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingTop: 8 }}>
              <Body style={{ fontWeight: "800" }}>Recent transactions</Body>
              <Caption tone="brand" onPress={() => router.push("/(tabs)/wallet/transactions")}>
                View all
              </Caption>
            </View>
            <View style={{ paddingHorizontal: 14 }}>
              {recent.length === 0 ? (
                <Body style={{ paddingVertical: 12, color: t.text.secondary }}>No transactions yet.</Body>
              ) : (
                recent.map((tx) => <TransactionRow key={tx.id} transaction={tx} onPress={() => setDetail(tx.id)} />)
              )}
            </View>
          </Card>

          <Card padded={false} style={{ paddingVertical: 6 }}>
            <Body style={{ fontWeight: "800", paddingHorizontal: 14, paddingTop: 8 }}>Payout methods</Body>
            {w.payoutMethods.map((m) => (
              <ListRow
                key={m.id}
                icon={<Building2 size={16} color={t.text.secondary} />}
                title={`${m.bankName} ${m.accountNumberMasked}`}
                caption={m.accountName}
                chevron={false}
                right={
                  <View style={{ flexDirection: "row", gap: 4 }}>
                    {m.isDefault ? <StatusPill size="xs" tone="info" label="Default" /> : null}
                    {m.verified ? <StatusPill size="xs" tone="success" label="Verified" /> : null}
                  </View>
                }
              />
            ))}
            <View style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
              <Button variant="outline" size="sm" label="Add bank account" onPress={() => toast("Coming in a later phase")} />
            </View>
          </Card>

          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
            <Gift size={20} color={t.text.brand} />
            <View style={{ flex: 1 }}>
              <Caption tone="muted">Bonus balance</Caption>
              <Body style={{ fontWeight: "800" }}>{formatMoney(w.balances.BONUS, w.currency)}</Body>
            </View>
            <Button variant="outline" size="sm" label="Transfer to available" onPress={() => toast("Bonus transfer arrives with the backend")} />
          </Card>

          <Card>
            <Body style={{ fontWeight: "800", marginBottom: 4 }}>Fees & limits</Body>
            <DataRow label="Withdrawal fee" value={`${formatBps(w.policies.withdrawalFeeBps)} capped at ${formatMoney(w.policies.withdrawalFeeCap, w.currency)}`} />
            <DataRow label="Minimum withdrawal" value={formatMoney(w.policies.minWithdrawal, w.currency)} />
            <DataRow label="Minimum deposit" value={formatMoney(w.policies.minDeposit, w.currency)} />
            <DataRow label="Deposit fee" value={w.policies.depositFeeBps === 0 ? "None" : formatBps(w.policies.depositFeeBps)} />
            {w.policies.kycRequiredForWithdrawal ? <DataRow label="Withdrawals" value="Identity verification required" /> : null}
          </Card>
        </>
      )}
      <TransactionDetailSheet id={detail} onClose={() => setDetail(null)} />
    </Screen>
  );
}
