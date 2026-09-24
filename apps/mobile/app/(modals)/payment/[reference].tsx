import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Clock, XCircle } from "lucide-react-native";
import * as React from "react";
import { ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PAYMENT_STATUS, formatDateTime, formatMoney } from "@rentbrown/utils";
import type { PaymentStatus } from "@rentbrown/types";

import { TransferInstructions } from "../../../src/components/misc";
import { useSubmission } from "../../../src/data/hooks";
import { t } from "../../../src/theme";
import {
  Body,
  BodySm,
  Button,
  Card,
  DataRow,
  EmptyState,
  IconCircle,
  SkeletonCard,
} from "../../../src/ui";

export default function PaymentResult() {
  const { reference, state } = useLocalSearchParams<{ reference: string; state?: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const submission = useSubmission(reference ?? "");
  const sub = submission.data;
  const preview = state as PaymentStatus | undefined;
  const status = preview && ["PENDING", "CONFIRMING", "SUCCESSFUL", "FAILED", "REFUNDED"].includes(preview)
    ? preview
    : sub?.paymentStatus;

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.canvas, paddingTop: insets.top }}>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 30 }}>
        {submission.isLoading || !sub ? (
          <SkeletonCard lines={5} />
        ) : !status ? (
          <EmptyState title="Submission not found" actionLabel="Done" onAction={() => router.dismissAll()} />
        ) : (
          <>
            {preview ? (
              <BodySm tone="muted" center>
                Preview state
              </BodySm>
            ) : null}
            <View style={{ alignItems: "center", gap: 12, paddingTop: 20 }}>
              <IconCircle
                size={72}
                tone={PAYMENT_STATUS[status].tone === "neutral" ? "neutral" : PAYMENT_STATUS[status].tone}
              >
                {status === "SUCCESSFUL" ? (
                  <CheckCircle2 size={34} color={t.status.success.fg} />
                ) : status === "FAILED" ? (
                  <XCircle size={34} color={t.status.error.fg} />
                ) : (
                  <Clock size={34} color={t.status.warning.fg} />
                )}
              </IconCircle>
              <Body style={{ fontSize: 22, fontWeight: "800" }} center>
                {status === "SUCCESSFUL"
                  ? "Investment confirmed"
                  : status === "CONFIRMING"
                    ? "Confirming your payment"
                    : status === "FAILED"
                      ? "Payment not completed"
                      : "Waiting for your transfer"}
              </Body>
              <BodySm tone="muted" center>
                {status === "SUCCESSFUL"
                  ? "Your slots are confirmed and the investment record is active."
                  : status === "FAILED"
                    ? (sub.failureReason ?? "Nothing was charged. You can try again.")
                    : "Send the exact amount to the account below to confirm your slots."}
              </BodySm>
            </View>

            {status === "PENDING" && sub.transferInstructions ? (
              <TransferInstructions account={sub.transferInstructions} amount={sub.amount} />
            ) : null}

            <Card>
              <DataRow label="Amount" value={formatMoney(sub.amount, sub.currency)} strong />
              <DataRow label="Funding" value={sub.fundingSource === "WALLET" ? "Wallet" : sub.fundingSource === "BANK_TRANSFER" ? "Bank transfer" : "Card"} />
              <DataRow label="Reference" value={sub.reference} copyable={sub.reference} />
              <DataRow label="Submitted" value={formatDateTime(sub.submittedAt)} />
              {status === "PENDING" ? <StatusNote /> : null}
            </Card>

            <View style={{ gap: 10 }}>
              {sub.investmentId ? (
                <Button
                  size="lg"
                  fullWidth
                  label="View investment"
                  onPress={() => {
                    router.dismissAll();
                    router.push(`/(tabs)/portfolio/${sub.investmentId}`);
                  }}
                />
              ) : null}
              <Button size="lg" fullWidth variant={sub.investmentId ? "outline" : "primary"} label="Done" onPress={() => router.dismissAll()} />
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

function StatusNote() {
  return <BodySm tone="muted">This page updates automatically when your bank settles.</BodySm>;
}
