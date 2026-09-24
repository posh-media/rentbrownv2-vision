import { useRouter } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { TRANSACTION_STATUS, formatDateTime, humanizeStatus } from "@rentbrown/utils";

import { useTransaction } from "../data/hooks";
import {
  BottomSheet,
  Body,
  Button,
  Caption,
  DataRow,
  Divider,
  MoneyFigure,
  Skeleton,
  StatusPill,
} from "../ui";

export function TransactionDetailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const router = useRouter();
  const tx = useTransaction(id ?? "");
  const t_ = tx.data;

  const related = () => {
    if (!t_?.related) return;
    onClose();
    if (t_.related.kind === "investment") router.push(`/(tabs)/portfolio/${t_.related.id}`);
    else if (t_.related.kind === "withdrawal") router.push(`/(tabs)/wallet/withdrawals/${t_.related.id}`);
    else if (t_.related.kind === "deposit") router.push(`/(tabs)/wallet/deposits/${t_.related.id}`);
  };

  return (
    <BottomSheet open={!!id} onClose={onClose}>
      {tx.isLoading || !t_ ? (
        <View style={{ gap: 10 }}>
          <Skeleton height={18} width="50%" />
          <Skeleton height={12} />
          <Skeleton height={12} />
        </View>
      ) : (
        <View style={{ gap: 12 }}>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center" }}>
            <Body style={{ fontWeight: "800", flex: 1 }} numberOfLines={1}>
              {t_.title}
            </Body>
            <StatusPill tone={TRANSACTION_STATUS[t_.status].tone} label={TRANSACTION_STATUS[t_.status].label} size="xs" />
          </View>
          <MoneyFigure minor={t_.direction === "CREDIT" ? t_.amount : -t_.amount} currency={t_.currency} size="lg" tone={t_.direction === "CREDIT" ? "success" : "default"} signed />
          <Divider />
          <DataRow label="Type" value={humanizeStatus(t_.type)} />
          <DataRow label="Account" value={humanizeStatus(t_.account)} />
          <DataRow label="Date" value={formatDateTime(t_.occurredAt)} />
          <DataRow label="Reference" value={t_.reference} copyable={t_.reference} />
          {t_.providerReference ? <DataRow label="Provider reference" value={t_.providerReference} copyable={t_.providerReference} /> : null}
          <Caption style={{ opacity: 0.8 }}>{t_.description}</Caption>
          {t_.related ? <Button variant="outline" size="sm" label="View related" onPress={related} /> : null}
        </View>
      )}
    </BottomSheet>
  );
}
