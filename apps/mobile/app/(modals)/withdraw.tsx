import { useRouter } from "expo-router";
import { Building2, TriangleAlert, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatMoney, idempotencyKey } from "@rentbrown/utils";

import { useRequestWithdrawal, useWallet, useWithdrawalQuote } from "../../src/data/hooks";
import { t } from "../../src/theme";
import {
  Body,
  BodySm,
  BottomSheet,
  Button,
  Caption,
  Card,
  DataRow,
  Divider,
  MoneyFigure,
  MoneyInput,
  PinPad,
  Skeleton,
  StatePanel,
  Stepper,
  useToast,
} from "../../src/ui";

export default function Withdraw() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const wallet = useWallet();
  const [step, setStep] = React.useState(0);
  const [amount, setAmount] = React.useState(0); // minor
  const [destinationId, setDestinationId] = React.useState<string | null>(null);
  const [reviewOpen, setReviewOpen] = React.useState(false);
  const [pinOpen, setPinOpen] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const quote = useWithdrawalQuote(amount > 0 ? amount : null, destinationId ?? undefined);
  const request = useRequestWithdrawal();

  const w = wallet.data;
  const q = quote.data;
  const destination = w?.payoutMethods.find((m) => m.id === destinationId);

  const blockedPanel = q && !q.eligible && q.blockedReason ? (
    <StatePanel
      tone="warning"
      icon={<TriangleAlert size={16} color={t.status.warning.fg} />}
      title="Can't withdraw this amount"
      body={q.blockedReason}
      actionLabel={/kyc|verif/i.test(q.blockedReason) ? "Verify identity" : /pin/i.test(q.blockedReason) ? "Set transaction PIN" : undefined}
      onAction={
        /kyc|verif/i.test(q.blockedReason)
          ? () => router.push("/(tabs)/account/kyc")
          : /pin/i.test(q.blockedReason)
            ? () => router.push("/(tabs)/account/security")
            : undefined
      }
    />
  ) : null;

  const submit = async (pin: string) => {
    if (!destinationId || !q?.eligible) return;
    try {
      const wd = await request.mutateAsync({ amount, destinationId, pin, idempotencyKey: idempotencyKey("wd") });
      router.replace(`/(tabs)/wallet/withdrawals/${wd.id}`);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not submit — try again");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.canvas, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
        <Body style={{ flex: 1, fontWeight: "800" }}>Withdraw</Body>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={8}>
          <X size={20} color={t.text.primary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 30 }}>
        <Stepper steps={["Amount", "Destination", "Review"]} current={step + 1} />

        {w ? (
          <Card style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", padding: 12 }}>
            <Caption tone="muted">Available to withdraw</Caption>
            <View style={{ alignItems: "flex-end" }}>
              <MoneyFigure minor={w.balances.AVAILABLE} currency={w.currency} size="sm" />
              <Caption tone="muted">Reserved {formatMoney(w.balances.RESERVED, w.currency)} · not withdrawable</Caption>
            </View>
          </Card>
        ) : null}

        {step === 0 ? (
          <Card style={{ gap: 14 }}>
            <MoneyInput large value={amount} onChange={setAmount} accessibilityLabel="Withdrawal amount" />
            {q ? (
              <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
                {[0.25, 0.5, 1].map((f) => (
                  <Pressable
                    key={f}
                    accessibilityRole="button"
                    accessibilityLabel={f === 1 ? "Max" : `${f * 100}%`}
                    onPress={() => setAmount(Math.floor(q.maxAmount * f))}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 999, borderWidth: 1, borderColor: t.border.default, backgroundColor: t.bg.surface }}
                  >
                    <Caption>{f === 1 ? "Max" : `${f * 100}%`}</Caption>
                  </Pressable>
                ))}
              </View>
            ) : null}
            {amount > 0 && quote.isFetching ? <Skeleton height={60} /> : null}
            {amount > 0 && q ? (
              q.eligible ? (
                <View style={{ backgroundColor: t.bg.subtle, borderRadius: 12, padding: 12, gap: 4 }}>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <Caption tone="muted">Fee ({q.feeDescription})</Caption>
                    <MoneyFigure minor={q.fee} currency={q.currency} size="xs" />
                  </View>
                  <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                    <BodySm style={{ fontWeight: "800" }}>You will receive</BodySm>
                    <MoneyFigure minor={q.netAmount} currency={q.currency} size="sm" tone="success" />
                  </View>
                  <Caption tone="muted">Estimated arrival: {q.estimatedArrival}</Caption>
                </View>
              ) : (
                blockedPanel
              )
            ) : null}
            <Button size="lg" fullWidth label="Continue" disabled={!q?.eligible} onPress={() => setStep(1)} />
          </Card>
        ) : null}

        {step === 1 ? (
          <Card padded={false} style={{ paddingVertical: 6 }}>
            <Caption tone="muted" style={{ paddingHorizontal: 14, paddingTop: 10 }}>
              Destination
            </Caption>
            {w?.payoutMethods.map((m) => (
              <Pressable
                key={m.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: destinationId === m.id }}
                accessibilityLabel={`${m.bankName} ${m.accountNumberMasked}`}
                onPress={() => setDestinationId(m.id)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}
              >
                <Building2 size={18} color={t.text.secondary} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Body numberOfLines={1} style={{ fontWeight: "700" }}>
                    {m.bankName} {m.accountNumberMasked}
                  </Body>
                  <Caption tone="muted">{m.accountName}</Caption>
                </View>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: destinationId === m.id ? t.action.primary : t.border.strong,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {destinationId === m.id ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.action.primary }} /> : null}
                </View>
              </Pressable>
            ))}
            {(w?.payoutMethods.length ?? 0) === 0 ? (
              <Caption tone="muted" style={{ paddingHorizontal: 14, paddingVertical: 8 }}>
                No saved accounts yet — add a bank account on the web app first.
              </Caption>
            ) : null}
            <View style={{ paddingHorizontal: 14, paddingVertical: 6 }}>
              <Caption tone="muted">Manage bank accounts on the RentBrown web app.</Caption>
            </View>
            <View style={{ flexDirection: "row", gap: 10, padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Button variant="outline" fullWidth label="Back" onPress={() => setStep(0)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button fullWidth label="Review" disabled={!destinationId} onPress={() => setReviewOpen(true)} />
              </View>
            </View>
          </Card>
        ) : null}
      </ScrollView>

      <BottomSheet open={reviewOpen} onClose={() => setReviewOpen(false)}>
        <View style={{ gap: 12 }}>
          <Body style={{ fontWeight: "800" }}>Review withdrawal</Body>
          {q ? (
            <>
              <DataRow label="Amount requested" value={formatMoney(amount, q.currency)} strong />
              <DataRow label="Fee" value={formatMoney(q.fee, q.currency)} />
              <DataRow label="You will receive" value={formatMoney(q.netAmount, q.currency)} strong success />
              <DataRow label="Destination" value={destination ? `${destination.bankName} ${destination.accountNumberMasked}` : "—"} />
              <DataRow label="Estimated arrival" value={q.estimatedArrival} />
            </>
          ) : null}
          <Divider />
          <BodySm tone="muted">Funds move to your reserved balance while the request is reviewed.</BodySm>
          <Button
            size="lg"
            fullWidth
            label="Confirm with transaction PIN"
            onPress={() => {
              setReviewOpen(false);
              setPin("");
              setPinOpen(true);
            }}
          />
        </View>
      </BottomSheet>

      <BottomSheet open={pinOpen} onClose={() => setPinOpen(false)}>
        <View style={{ gap: 16 }}>
          <Body style={{ fontWeight: "800" }} center>
            Enter your transaction PIN
          </Body>
          <PinPad
            value={pin}
            onChange={setPin}
            onComplete={(value) => {
              setPinOpen(false);
              void submit(value);
            }}
          />
        </View>
      </BottomSheet>
    </View>
  );
}
