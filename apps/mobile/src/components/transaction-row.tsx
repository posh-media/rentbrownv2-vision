import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  Gift,
  RotateCcw,
  TrendingUp,
} from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { MOCK_NOW } from "@rentbrown/mock-data";
import { TRANSACTION_STATUS, formatListDate } from "@rentbrown/utils";
import type { Transaction } from "@rentbrown/types";

import { t } from "../theme";
import { Body, Caption, IconCircle, MoneyFigure, StatusPill } from "../ui";

const ICONS: Record<string, React.ComponentType<{ size?: number; color?: string }>> = {
  DEPOSIT: ArrowDownLeft,
  INVESTMENT: Building2,
  MATURITY_PRINCIPAL: TrendingUp,
  MATURITY_PROFIT: TrendingUp,
  WITHDRAWAL: ArrowUpRight,
  WITHDRAWAL_FEE: ArrowUpRight,
  WITHDRAWAL_RELEASE: RotateCcw,
  REFERRAL_REWARD: Gift,
  BONUS_TRANSFER: Gift,
  REFUND: RotateCcw,
  REVERSAL: RotateCcw,
};

export function TransactionRow({
  transaction,
  onPress,
}: {
  transaction: Transaction;
  onPress?: () => void;
}) {
  const Icon = ICONS[transaction.type] ?? ArrowDownLeft;
  const credit = transaction.direction === "CREDIT";
  const status = TRANSACTION_STATUS[transaction.status];
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={transaction.title}
      onPress={onPress}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        minHeight: 56,
        paddingVertical: 6,
        borderRadius: 8,
        opacity: pressed ? 0.7 : 1,
      })}
    >
      <IconCircle size={40} tone={credit ? "success" : "neutral"}>
        <Icon size={18} color={credit ? t.status.success.fg : t.text.secondary} />
      </IconCircle>
      <View style={{ flex: 1, minWidth: 0, gap: 2 }}>
        <Body numberOfLines={1} style={{ fontWeight: "700" }}>
          {transaction.title}
        </Body>
        <Caption tone="muted" numberOfLines={1}>
          {formatListDate(transaction.occurredAt, MOCK_NOW)} · {transaction.reference}
        </Caption>
      </View>
      <View style={{ alignItems: "flex-end", gap: 3 }}>
        <MoneyFigure
          minor={credit ? transaction.amount : -transaction.amount}
          size="xs"
          tone={credit ? "success" : "default"}
          signed
        />
        {transaction.status !== "SUCCESSFUL" ? (
          <StatusPill tone={status.tone} label={status.label} size="xs" />
        ) : null}
      </View>
    </Pressable>
  );
}
