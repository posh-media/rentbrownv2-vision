import * as React from "react";
import { View } from "react-native";
import { REFERRAL_STATUS, formatListDate } from "@rentbrown/utils";
import { MOCK_NOW } from "@rentbrown/mock-data";
import type { ReferralStatus } from "@rentbrown/types";

import { useReferrals } from "../../../../src/data/hooks";
import {
  Avatar,
  BodySm,
  Caption,
  Card,
  EmptyState,
  HeaderBar,
  MoneyFigure,
  Screen,
  SegmentedControl,
  SkeletonCard,
  StatusPill,
} from "../../../../src/ui";

const FILTERS = ["ALL", "PENDING", "QUALIFIED", "CREDITED", "DISQUALIFIED"] as const;

export default function ReferralHistory() {
  const referrals = useReferrals();
  const [filter, setFilter] = React.useState<(typeof FILTERS)[number]>("ALL");
  const list = (referrals.data ?? []).filter((r) => filter === "ALL" || r.status === (filter as ReferralStatus));

  return (
    <Screen bottomPad={110}>
      <HeaderBar back title="Referral history" />
      <SegmentedControl options={FILTERS.map((f) => ({ value: f, label: f === "ALL" ? "All" : REFERRAL_STATUS[f].label }))} value={filter} onChange={setFilter} />
      {referrals.isLoading ? (
        <SkeletonCard lines={4} />
      ) : list.length === 0 ? (
        <EmptyState title="No referrals in this state" />
      ) : (
        <Card padded={false} style={{ paddingVertical: 4 }}>
          {list.map((r) => {
            const st = REFERRAL_STATUS[r.status];
            return (
              <View key={r.id} style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14, paddingVertical: 10 }}>
                <Avatar initials={r.displayName.slice(0, 2).toUpperCase()} size={34} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <BodySm style={{ fontWeight: "700" }} numberOfLines={1}>
                    {r.displayName}
                  </BodySm>
                  <Caption tone="muted" numberOfLines={2}>
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
        </Card>
      )}
    </Screen>
  );
}
