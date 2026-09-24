import * as Haptics from "expo-haptics";
import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Minus, Plus, X } from "lucide-react-native";
import * as React from "react";
import { Pressable, ScrollView, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  formatBps,
  formatDate,
  formatDuration,
  formatMoney,
  idempotencyKey,
} from "@rentbrown/utils";
import type { FundingSource } from "@rentbrown/types";
import type { PropertyImageKey } from "@rentbrown/mock-data";

import { useInvestmentQuote, useOpportunities, useSubmitInvestment } from "../../../src/data/hooks";
import { propertyImage } from "../../../src/lib/images";
import { t } from "../../../src/theme";
import {
  Body,
  BodySm,
  BottomSheet,
  Button,
  Caption,
  Card,
  Checkbox,
  DataRow,
  Divider,
  GlassSurface,
  MoneyFigure,
  PinPad,
  Skeleton,
  useToast,
} from "../../../src/ui";

const METHODS: Array<{ value: FundingSource; label: string; caption: string }> = [
  { value: "WALLET", label: "Wallet", caption: "Pay instantly from your available balance" },
  { value: "BANK_TRANSFER", label: "Bank transfer", caption: "Transfer to a dedicated account" },
  { value: "CARD", label: "Debit card", caption: "Pay now with a Nigerian debit card" },
];

export default function Checkout() {
  const { roundId } = useLocalSearchParams<{ roundId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { toast } = useToast();
  const opportunities = useOpportunities();
  const [slots, setSlots] = React.useState(1);
  const [funding, setFunding] = React.useState<FundingSource | null>(null);
  const [terms, setTerms] = React.useState(false);
  const [pinOpen, setPinOpen] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const quote = useInvestmentQuote(roundId ?? "", slots);
  const submit = useSubmitInvestment();

  const q = quote.data;
  const o = (opportunities.data ?? []).find((x) => x.round.id === roundId);
  const activeFunding = funding && q ? q.fundingOptions.find((f) => f.source === funding && f.available) : null;
  const canSubmit = !!q && !!activeFunding && terms && !submit.isPending;

  const doSubmit = async () => {
    if (!q || !activeFunding) return;
    void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    try {
      const res = await submit.mutateAsync({
        roundId: q.roundId,
        slots,
        fundingSource: activeFunding.source,
        idempotencyKey: idempotencyKey("iv"),
      });
      router.replace(`/(modals)/payment/${res.reference}`);
    } catch {
      toast("Could not submit — try again");
    }
  };

  const confirm = () => {
    if (funding === "WALLET") {
      setPin("");
      setPinOpen(true);
    } else {
      void doSubmit();
    }
  };

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.canvas, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", padding: 16 }}>
        <Body style={{ flex: 1, fontWeight: "800" }}>Confirm investment</Body>
        <Pressable accessibilityRole="button" accessibilityLabel="Close" onPress={() => router.back()} hitSlop={8}>
          <X size={20} color={t.text.primary} />
        </Pressable>
      </View>
      <ScrollView contentContainerStyle={{ padding: 16, paddingTop: 0, gap: 16, paddingBottom: 140 }}>
        {o ? (
          <Card style={{ flexDirection: "row", alignItems: "center", gap: 12, padding: 12 }}>
            <Image
              source={propertyImage(o.property.images[0] as PropertyImageKey)}
              style={{ width: 52, height: 52, borderRadius: 10, backgroundColor: t.bg.sunken }}
              contentFit="cover"
            />
            <View style={{ flex: 1, minWidth: 0 }}>
              <Body numberOfLines={1} style={{ fontWeight: "800" }}>
                {o.property.name}
              </Body>
              <Caption tone="muted">
                {o.plan.name} · {formatBps(o.plan.roiBps)} · {formatDuration(o.plan.duration)}
              </Caption>
            </View>
          </Card>
        ) : null}

        <Card style={{ gap: 12 }}>
          <Caption tone="muted">Number of slots</Caption>
          <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 20 }}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Decrease slots"
              disabled={!q || slots <= (q?.minSlots ?? 1)}
              onPress={() => setSlots((s) => Math.max((q?.minSlots ?? 1), s - 1))}
              style={({ pressed }) => [stepBtn, pressed && { backgroundColor: t.bg.subtle }, (!q || slots <= (q?.minSlots ?? 1)) && { opacity: 0.4 }]}
            >
              <Minus size={18} color={t.text.primary} />
            </Pressable>
            <Body style={{ fontSize: 34, fontWeight: "800", minWidth: 48, textAlign: "center" }}>{slots}</Body>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Increase slots"
              disabled={!q || slots >= (q?.maxSlots ?? 99)}
              onPress={() => setSlots((s) => Math.min(q?.maxSlots ?? 99, s + 1))}
              style={({ pressed }) => [stepBtn, pressed && { backgroundColor: t.bg.subtle }, (!q || slots >= (q?.maxSlots ?? 99)) && { opacity: 0.4 }]}
            >
              <Plus size={18} color={t.text.primary} />
            </Pressable>
          </View>
          {q ? (
            <View style={{ flexDirection: "row", justifyContent: "center", gap: 8 }}>
              {[
                { l: "Min", v: q.minSlots },
                { l: "5", v: 5 },
                { l: "10", v: 10 },
                { l: "Max", v: q.maxSlots },
              ].map((c) => (
                <Pressable
                  key={c.l}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.l} slots`}
                  onPress={() => setSlots(Math.max(q.minSlots, Math.min(q.maxSlots, c.v)))}
                  style={chip}
                >
                  <Caption>{c.l}</Caption>
                </Pressable>
              ))}
            </View>
          ) : null}
          {q ? (
            <Caption tone="muted" center>
              Min {q.minSlots} · Max {q.maxSlots} · {q.availableSlots} available
            </Caption>
          ) : null}
        </Card>

        <Card padded={false} style={{ paddingVertical: 6 }}>
          <Caption tone="muted" style={{ paddingHorizontal: 14, paddingTop: 10 }}>
            Funding source
          </Caption>
          {METHODS.map((m) => {
            const opt = q?.fundingOptions.find((f) => f.source === m.value);
            const available = opt?.available ?? false;
            const selected = funding === m.value;
            return (
              <Pressable
                key={m.value}
                accessibilityRole="radio"
                accessibilityState={{ selected, disabled: !available }}
                accessibilityLabel={m.label}
                disabled={!available}
                onPress={() => setFunding(m.value)}
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 12,
                  paddingHorizontal: 14,
                  paddingVertical: 12,
                  opacity: available ? 1 : 0.5,
                }}
              >
                <View
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: 10,
                    borderWidth: 2,
                    borderColor: selected ? t.action.primary : t.border.strong,
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  {selected ? <View style={{ width: 10, height: 10, borderRadius: 5, backgroundColor: t.action.primary }} /> : null}
                </View>
                <View style={{ flex: 1 }}>
                  <Body style={{ fontWeight: "700" }}>{m.label}</Body>
                  <Caption tone="muted">
                    {available && m.value === "WALLET" && opt?.walletAvailable != null
                      ? `Available ${formatMoney(opt.walletAvailable)}`
                      : !available && opt?.reason
                        ? opt.reason
                        : m.caption}
                  </Caption>
                </View>
              </Pressable>
            );
          })}
        </Card>

        <Card>
          <Caption tone="muted" style={{ marginBottom: 4 }}>
            Summary
          </Caption>
          {quote.isFetching ? <Skeleton height={12} width="40%" /> : null}
          {q ? (
            <>
              <DataRow label={`Slots × ${formatMoney(q.slotPrice)}`} value={String(slots)} />
              <Divider />
              <DataRow label="Principal" value={formatMoney(q.principal)} strong />
              <DataRow label="Expected profit" value={formatMoney(q.expectedProfit)} success />
              <DataRow label="Maturity value" value={formatMoney(q.maturityValue)} strong success />
              <DataRow label="Expected return" value={formatBps(q.roiBps)} />
              <DataRow label="Duration" value={formatDuration(q.duration)} />
              <DataRow label="Projected maturity" value={formatDate(q.projectedMaturityAt)} />
              <DataRow label="Fees" value={q.fees === 0 ? "None" : formatMoney(q.fees)} />
            </>
          ) : (
            <Skeleton height={120} />
          )}
        </Card>

        <Checkbox
          checked={terms}
          onChange={setTerms}
          accessibilityLabel="Accept terms"
          label={
            <BodySm tone="muted">
              I understand principal cannot be withdrawn before maturity and returns are expected, not guaranteed.
            </BodySm>
          }
        />
      </ScrollView>

      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 12, paddingBottom: insets.bottom + 10 }}>
        <GlassSurface intensity={80} radius={24} style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Caption tone="muted">You pay</Caption>
            <MoneyFigure minor={q?.principal ?? 0} size="md" />
          </View>
          <Button label="Confirm" disabled={!canSubmit} loading={submit.isPending} onPress={confirm} />
        </GlassSurface>
      </View>

      <BottomSheet open={pinOpen} onClose={() => setPinOpen(false)}>
        <View style={{ gap: 16 }}>
          <Body style={{ fontWeight: "800" }} center>
            Confirm with your transaction PIN
          </Body>
          <MoneyFigure minor={q?.principal ?? 0} size="lg" center />
          <PinPad
            value={pin}
            onChange={setPin}
            onComplete={() => {
              setPinOpen(false);
              void doSubmit();
            }}
          />
        </View>
      </BottomSheet>
    </View>
  );
}

const stepBtn = {
  width: 44,
  height: 44,
  borderRadius: 22,
  borderWidth: 1,
  borderColor: t.border.default,
  backgroundColor: t.bg.surface,
  alignItems: "center",
  justifyContent: "center",
} as const;

const chip = {
  paddingHorizontal: 12,
  paddingVertical: 6,
  borderRadius: 999,
  borderWidth: 1,
  borderColor: t.border.default,
  backgroundColor: t.bg.surface,
} as const;
