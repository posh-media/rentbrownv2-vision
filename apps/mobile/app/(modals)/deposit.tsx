import { useRouter } from "expo-router";
import { Building2, CreditCard, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { formatMoney, idempotencyKey } from "@rentbrown/utils";
import type { DepositMethod } from "@rentbrown/types";

import { useCreateDeposit, useWallet } from "../../src/data/hooks";
import { t } from "../../src/theme";
import {
  Body,
  BodySm,
  Button,
  Caption,
  Card,
  MoneyInput,
  Stepper,
  useToast,
} from "../../src/ui";

const CHIPS = [10_000, 50_000, 100_000, 250_000];

export default function Deposit() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const wallet = useWallet();
  const createDeposit = useCreateDeposit();
  const [step, setStep] = React.useState(0);
  const [amount, setAmount] = React.useState(0); // minor
  const [method, setMethod] = React.useState<DepositMethod | null>(null);

  const min = wallet.data?.policies.minDeposit ?? 0;
  const amountOk = amount >= min;

  const submit = async () => {
    if (!method) return;
    try {
      const d = await createDeposit.mutateAsync({ amount, method, idempotencyKey: idempotencyKey("dep") });
      router.replace(`/(tabs)/wallet/deposits/${d.id}`);
    } catch {
      toast("Could not start deposit — try again");
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.canvas, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
        <Body style={{ flex: 1, fontWeight: "800" }}>Deposit</Body>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={8}>
          <X size={20} color={t.text.primary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, gap: 16, paddingBottom: insets.bottom + 30 }}>
        <Stepper steps={["Amount", "Method", "Transfer"]} current={step + 1} />
        {step === 0 ? (
          <Card style={{ gap: 14 }}>
            <Body style={{ fontWeight: "800" }} center>
              How much would you like to add?
            </Body>
            <MoneyInput large value={amount} onChange={setAmount} hint={min > 0 ? `Minimum ${formatMoney(min)} · No deposit fee` : undefined} />
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, justifyContent: "center" }}>
              {CHIPS.map((c) => (
                <Pressable
                  key={c}
                  accessibilityRole="button"
                  accessibilityLabel={formatMoney(c * 100)}
                  onPress={() => setAmount(c * 100)}
                  style={{
                    paddingHorizontal: 14,
                    paddingVertical: 8,
                    borderRadius: 999,
                    borderWidth: 1,
                    borderColor: amount === c * 100 ? t.action.primary : t.border.default,
                    backgroundColor: amount === c * 100 ? t.action.secondary : t.bg.surface,
                  }}
                >
                  <Caption>₦{c.toLocaleString()}</Caption>
                </Pressable>
              ))}
            </View>
            <Button size="lg" fullWidth label="Continue" disabled={!amountOk} onPress={() => setStep(1)} />
          </Card>
        ) : (
          <Card padded={false} style={{ paddingVertical: 6, gap: 4 }}>
            {[
              { v: "BANK_TRANSFER" as const, l: "Bank transfer", c: "Recommended — usually credited within minutes", icon: <Building2 size={18} color={t.text.secondary} /> },
              { v: "CARD" as const, l: "Debit card", c: "Card deposit flow (prototype)", icon: <CreditCard size={18} color={t.text.secondary} /> },
            ].map((m) => (
              <Pressable
                key={m.v}
                accessibilityRole="radio"
                accessibilityState={{ selected: method === m.v }}
                accessibilityLabel={m.l}
                onPress={() => setMethod(m.v)}
                style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14, paddingVertical: 12 }}
              >
                {m.icon}
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: "700" }}>{m.l}</Body>
                  <Caption tone="muted">{m.c}</Caption>
                </View>
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: method === m.v ? t.action.primary : t.border.strong,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {method === m.v ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.action.primary }} /> : null}
                </View>
              </Pressable>
            ))}
            <View style={{ flexDirection: "row", gap: 10, padding: 14 }}>
              <View style={{ flex: 1 }}>
                <Button variant="outline" fullWidth label="Back" onPress={() => setStep(0)} />
              </View>
              <View style={{ flex: 1 }}>
                <Button fullWidth label="Continue" disabled={!method} loading={createDeposit.isPending} onPress={() => void submit()} />
              </View>
            </View>
          </Card>
        )}
        <BodySm tone="muted" center>
          Deposits in this prototype use a fictional bank account — no real money moves.
        </BodySm>
      </ScrollView>
    </View>
  );
}
