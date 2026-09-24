import * as Clipboard from "expo-clipboard";
import { useRouter } from "expo-router";
import { Copy, Gift, Share2 } from "lucide-react-native";
import * as React from "react";
import { Share, View } from "react-native";
import { REFERRAL_STATUS, formatListDate } from "@rentbrown/utils";
import { MOCK_NOW } from "@rentbrown/mock-data";

import { useReferrals, useReferralSummary } from "../../../../src/data/hooks";
import { useSession } from "../../../../src/data/provider";
import { t } from "../../../../src/theme";
import {
  Avatar,
  Body,
  BodySm,
  Button,
  Caption,
  Card,
  EmptyState,
  HeaderBar,
  MoneyFigure,
  Screen,
  SkeletonCard,
  StatCard,
  StatusPill,
  useToast,
} from "../../../../src/ui";

export default function Referrals() {
  const router = useRouter();
  const session = useSession();
  const summary = useReferralSummary();
  const referrals = useReferrals();
  const { toast } = useToast();

  if (!session.isLoading && !session.data) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar back title="Referrals" />
        <EmptyState title="Sign in to see referrals" actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} />
      </Screen>
    );
  }
  const s = summary.data;

  return (
    <Screen bottomPad={110}>
      <HeaderBar back title="Referrals" eyebrow="Rewards qualify only after requirements are met" />
      {summary.isLoading || !s ? (
        <SkeletonCard lines={4} />
      ) : (
        <>
          <View style={{ flexDirection: "row", gap: 8 }}>
            <StatCard label="People referred" style={{ flex: 1 }}>
              <Body style={{ fontSize: 20, fontWeight: "800" }}>{s.referredCount}</Body>
            </StatCard>
            <StatCard label="Rewards credited" emphasis style={{ flex: 1 }}>
              <MoneyFigure minor={s.earnedRewards} currency={s.currency} size="sm" tone="inverse" />
            </StatCard>
            <StatCard label="Pending" style={{ flex: 1 }}>
              <MoneyFigure minor={s.pendingRewards} currency={s.currency} size="sm" />
            </StatCard>
          </View>

          <Card style={{ gap: 12 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <Gift size={18} color={t.text.brand} />
              <Caption tone="muted">Your referral code</Caption>
            </View>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "space-between",
                backgroundColor: t.bg.subtle,
                borderRadius: 12,
                paddingHorizontal: 14,
                paddingVertical: 12,
              }}
            >
              <Body style={{ fontWeight: "800", letterSpacing: 1 }}>{s.code}</Body>
              <Button
                size="sm"
                variant="outline"
                label="Copy"
                icon={<Copy size={13} color={t.text.primary} />}
                onPress={async () => {
                  await Clipboard.setStringAsync(s.code);
                  toast("Code copied");
                }}
              />
            </View>
            <Button
              variant="outline"
              label="Share link"
              icon={<Share2 size={14} color={t.text.primary} />}
              onPress={() => void Share.share({ message: `Join me on RentBrown with code ${s.code}: ${s.shareUrl}` })}
            />
          </Card>

          <Card style={{ gap: 8 }}>
            <Caption tone="muted">How rewards qualify</Caption>
            {s.qualificationSteps.map((step, i) => (
              <View key={step} style={{ flexDirection: "row", gap: 10 }}>
                <Caption tone="brand">{`0${i + 1}`}</Caption>
                <BodySm style={{ flex: 1 }}>{step}</BodySm>
              </View>
            ))}
            <View style={{ height: 1, backgroundColor: t.border.default, marginVertical: 4 }} />
            {s.rules.map((r) => (
              <BodySm key={r} tone="muted">
                · {r}
              </BodySm>
            ))}
          </Card>

          <Card padded={false} style={{ paddingVertical: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingTop: 8 }}>
              <Body style={{ fontWeight: "800" }}>Recent referrals</Body>
              <Caption tone="brand" onPress={() => router.push("/(tabs)/account/referrals/history")}>
                Full history
              </Caption>
            </View>
            {(referrals.data ?? []).slice(0, 5).map((r) => {
              const st = REFERRAL_STATUS[r.status];
              return (
                <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 8 }}>
                  <Avatar initials={r.displayName.slice(0, 2).toUpperCase()} size={34} />
                  <View style={{ flex: 1, minWidth: 0 }}>
                    <BodySm style={{ fontWeight: "700" }} numberOfLines={1}>
                      {r.displayName}
                    </BodySm>
                    <Caption tone="muted" numberOfLines={1}>
                      {formatListDate(r.joinedAt, MOCK_NOW)} · {r.statusNote}
                    </Caption>
                  </View>
                  <View style={{ alignItems: "flex-end", gap: 2 }}>
                    <StatusPill size="xs" tone={st.tone} label={st.label} />
                    <MoneyFigure minor={r.rewardAmount} currency={r.currency} size="xs" />
                  </View>
                </View>
              );
            })}
            {(referrals.data ?? []).length === 0 ? (
              <BodySm tone="muted" style={{ paddingHorizontal: 14, paddingVertical: 10 }}>
                No referrals yet — share your code with people you know.
              </BodySm>
            ) : null}
          </Card>
        </>
      )}
    </Screen>
  );
}
