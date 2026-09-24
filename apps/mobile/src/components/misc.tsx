import * as Clipboard from "expo-clipboard";
import { Copy } from "lucide-react-native";
import * as React from "react";
import { Pressable, View } from "react-native";
import { formatDateTime } from "@rentbrown/utils";
import type { VirtualAccount } from "@rentbrown/types";

import { t } from "../theme";
import { Body, BodySm, Caption, Card, MoneyFigure, useToast } from "../ui";

/** Bank transfer instructions with copy buttons (deposit + pending payment). */
export function TransferInstructions({ account, amount }: { account: VirtualAccount; amount?: number }) {
  const { toast } = useToast();
  const row = (label: string, value: string, copyValue = value) => (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Caption tone="muted">{label}</Caption>
        <Body numberOfLines={1} style={{ fontWeight: "700" }}>
          {value}
        </Body>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`Copy ${label}`}
        hitSlop={8}
        onPress={async () => {
          await Clipboard.setStringAsync(copyValue);
          toast(`${label} copied`);
        }}
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          borderWidth: 1,
          borderColor: t.border.default,
          backgroundColor: t.bg.surface,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Copy size={14} color={t.text.secondary} />
      </Pressable>
    </View>
  );
  return (
    <Card style={{ gap: 12 }}>
      <Caption tone="muted">Transfer the exact amount to</Caption>
      {amount != null ? (
        <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
          <MoneyFigure minor={amount} size="lg" />
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Copy amount"
            hitSlop={8}
            onPress={async () => {
              await Clipboard.setStringAsync(String(amount / 100));
              toast("Amount copied");
            }}
            style={{ padding: 8 }}
          >
            <Copy size={15} color={t.text.secondary} />
          </Pressable>
        </View>
      ) : null}
      {row("Bank", account.bankName)}
      {row("Account number", account.accountNumber)}
      {row("Account name", account.accountName)}
      {row("Reference", account.reference)}
      <BodySm tone="muted">Expires {formatDateTime(account.expiresAt)}</BodySm>
    </Card>
  );
}
