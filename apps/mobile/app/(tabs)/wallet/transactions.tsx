import { ReceiptText, Search } from "lucide-react-native";
import * as React from "react";
import { SectionList, TextInput, View } from "react-native";
import type { Transaction, TransactionType } from "@rentbrown/types";

import { TransactionRow } from "../../../src/components/transaction-row";
import { TransactionDetailSheet } from "../../../src/components/transaction-sheet";
import { useTransactions } from "../../../src/data/hooks";
import { t } from "../../../src/theme";
import {
  Caption,
  EmptyState,
  HeaderBar,
  Screen,
  SegmentedControl,
  SkeletonCard,
} from "../../../src/ui";

const TYPES: Array<{ value: string; label: string; types: TransactionType[] }> = [
  { value: "ALL", label: "All", types: [] },
  { value: "DEPOSITS", label: "Deposits", types: ["DEPOSIT"] },
  { value: "INVESTMENTS", label: "Investments", types: ["INVESTMENT"] },
  { value: "MATURITY", label: "Maturity", types: ["MATURITY_PRINCIPAL", "MATURITY_PROFIT"] },
  { value: "WITHDRAWALS", label: "Withdrawals", types: ["WITHDRAWAL", "WITHDRAWAL_FEE", "WITHDRAWAL_RELEASE"] },
  { value: "REWARDS", label: "Rewards", types: ["REFERRAL_REWARD", "BONUS_TRANSFER"] },
];

const STATUSES = [
  { value: "ALL", label: "All" },
  { value: "SUCCESSFUL", label: "Successful" },
  { value: "PENDING", label: "Pending" },
  { value: "FAILED", label: "Failed" },
] as const;

function monthOf(tx: Transaction) {
  const d = new Date(tx.occurredAt);
  return d.toLocaleDateString("en-NG", { month: "long", year: "numeric" });
}

export default function Transactions() {
  const transactions = useTransactions();
  const [query, setQuery] = React.useState("");
  const [type, setType] = React.useState("ALL");
  const [status, setStatus] = React.useState<(typeof STATUSES)[number]["value"]>("ALL");
  const [detail, setDetail] = React.useState<string | null>(null);

  const filtered = React.useMemo(() => {
    let items = transactions.data ?? [];
    const typeEntry = TYPES.find((x) => x.value === type);
    if (typeEntry && typeEntry.types.length) items = items.filter((tx) => typeEntry.types.includes(tx.type));
    if (status !== "ALL") {
      items = items.filter((tx) =>
        status === "PENDING" ? tx.status === "PENDING" || tx.status === "UNDER_REVIEW" : tx.status === status,
      );
    }
    if (query.trim()) {
      const q = query.trim().toLowerCase();
      items = items.filter((tx) => tx.title.toLowerCase().includes(q) || tx.reference.toLowerCase().includes(q));
    }
    return items;
  }, [transactions.data, type, status, query]);

  const sections = React.useMemo(() => {
    const map = new Map<string, Transaction[]>();
    for (const tx of filtered) {
      const key = monthOf(tx);
      map.set(key, [...(map.get(key) ?? []), tx]);
    }
    return [...map.entries()].map(([title, data]) => ({ title, data }));
  }, [filtered]);

  return (
    <Screen scroll={false} bottomPad={110}>
      <HeaderBar back title="Transaction history" eyebrow="Every naira, with statuses and references" />
      <View style={{ paddingHorizontal: 16, gap: 12 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: t.bg.subtle,
            borderWidth: 1,
            borderColor: t.border.default,
            borderRadius: 12,
            paddingHorizontal: 12,
            minHeight: 44,
          }}
        >
          <Search size={16} color={t.text.tertiary} />
          <TextInput
            accessibilityLabel="Search transactions"
            placeholder="Search title or reference"
            placeholderTextColor={t.text.tertiary}
            value={query}
            onChangeText={setQuery}
            style={{ flex: 1, fontSize: 14, color: t.text.primary }}
          />
        </View>
        <SegmentedControl options={TYPES} value={type} onChange={setType} />
        <SegmentedControl options={STATUSES as unknown as { value: string; label: string }[]} value={status} onChange={(v) => setStatus(v as typeof status)} />
      </View>
      {transactions.isLoading ? (
        <View style={{ paddingHorizontal: 16, gap: 12, marginTop: 12 }}>
          <SkeletonCard lines={4} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center" }}>
          <EmptyState
            icon={<ReceiptText size={28} color={t.text.tertiary} />}
            title="No transactions found"
            body="Try clearing the filters."
          />
        </View>
      ) : (
        <SectionList
          sections={sections}
          keyExtractor={(tx) => tx.id}
          contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 120 }}
          renderSectionHeader={({ section }) => (
            <Caption tone="muted" style={{ paddingVertical: 8, backgroundColor: t.bg.canvas }}>
              {section.title}
            </Caption>
          )}
          renderItem={({ item }) => <TransactionRow transaction={item} onPress={() => setDetail(item.id)} />}
          stickySectionHeadersEnabled
        />
      )}
      <TransactionDetailSheet id={detail} onClose={() => setDetail(null)} />
    </Screen>
  );
}
