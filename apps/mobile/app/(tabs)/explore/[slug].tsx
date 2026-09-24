import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { ChevronLeft, FileText, ShieldAlert } from "lucide-react-native";
import * as React from "react";
import { ScrollView, StyleSheet, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  ROUND_STATUS,
  formatBps,
  formatDate,
  formatDuration,
  formatMoney,
} from "@rentbrown/utils";
import type { PropertyImageKey } from "@rentbrown/mock-data";

import { useOpportunity } from "../../../src/data/hooks";
import { useSession } from "../../../src/data/provider";
import { propertyImage } from "../../../src/lib/images";
import { radius, t } from "../../../src/theme";
import {
  Body,
  BodySm,
  Button,
  Caption,
  Card,
  DataRow,
  EmptyState,
  Eyebrow,
  GlassSurface,
  H1,
  ListRow,
  MoneyFigure,
  SkeletonCard,
  StatePanel,
  StatusPill,
} from "../../../src/ui";

export default function OpportunityDetails() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const session = useSession();
  const opportunity = useOpportunity(slug ?? "");

  if (opportunity.isLoading) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg.canvas, paddingTop: insets.top, padding: 16, gap: 12 }}>
        <SkeletonCard lines={5} />
        <SkeletonCard lines={4} />
      </View>
    );
  }
  const o = opportunity.data;
  if (!o) {
    return (
      <View style={{ flex: 1, backgroundColor: t.bg.canvas, justifyContent: "center" }}>
        <EmptyState title="Opportunity not found" actionLabel="Back to explore" onAction={() => router.back()} />
      </View>
    );
  }

  const { property, plan, round, perSlot } = o;
  const status = ROUND_STATUS[round.status];
  const soldOut = round.status === "SOLD_OUT" || round.status === "CLOSED" || round.status === "SETTLED";
  const scheduled = round.status === "SCHEDULED";

  return (
    <View style={{ flex: 1, backgroundColor: t.bg.canvas }}>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 130 }}>
        <View style={{ height: 300 }}>
          <Image source={propertyImage(property.images[0] as PropertyImageKey)} style={StyleSheet.absoluteFill} contentFit="cover" />
          <View style={{ position: "absolute", top: insets.top + 10, left: 14 }}>
            <GlassSurface tone="dark" intensity={60} radius={22} style={{ width: 44, height: 44 }}>
              <Button
                variant="ghost"
                label=""
                accessibilityLabel="Back"
                onPress={() => router.back()}
                icon={<ChevronLeft size={20} color={t.text.inverse} />}
                style={{ borderWidth: 0, width: 44, height: 44 }}
              />
            </GlassSurface>
          </View>
        </View>
        <View
          style={{
            marginTop: -24,
            borderTopLeftRadius: 24,
            borderTopRightRadius: 24,
            backgroundColor: t.bg.canvas,
            padding: 20,
            gap: 18,
          }}
        >
          <StatusPill tone={status.tone} label={status.label} />
          <View style={{ gap: 4 }}>
            <H1>{property.name}</H1>
            <BodySm tone="muted">
              {plan.name} · {property.location.label}
            </BodySm>
          </View>

          <View style={{ gap: 4 }}>
            <Caption tone="muted">One slot, shown separately</Caption>
            <View style={{ flexDirection: "row", gap: 8 }}>
              <Card style={{ flex: 1, padding: 12, gap: 2 }}>
                <Caption tone="muted">Principal</Caption>
                <MoneyFigure minor={perSlot.principal} size="sm" />
              </Card>
              <Card style={{ flex: 1, padding: 12, gap: 2 }}>
                <Caption tone="muted">Expected profit</Caption>
                <MoneyFigure minor={perSlot.expectedProfit} size="sm" tone="success" />
              </Card>
              <Card style={{ flex: 1, padding: 12, gap: 2, backgroundColor: t.bg.inverse, borderColor: t.bg.inverse }}>
                <Caption tone="inverse" style={{ opacity: 0.7 }}>
                  Maturity value
                </Caption>
                <MoneyFigure minor={perSlot.maturityValue} size="sm" tone="inverse" />
              </Card>
            </View>
          </View>

          <Card style={{ gap: 2 }}>
            <Eyebrow tone="muted" style={{ marginBottom: 6 }}>
              Round and terms
            </Eyebrow>
            <DataRow label="Round" value={`Round ${round.roundNumber}`} />
            <DataRow label="Expected return" value={`${formatBps(plan.roiBps)} over the full term`} />
            <DataRow label="Duration" value={formatDuration(plan.duration)} />
            <DataRow label="Slots" value={`${round.availableSlots} of ${round.totalSlots} available`} />
            <DataRow label="Min slots" value={String(plan.minSlots)} />
            <DataRow label="Opens" value={formatDate(round.opensAt)} />
            <DataRow label="Closes" value={formatDate(round.closesAt)} />
            <DataRow label="Fees" value={plan.investmentFeeBps === 0 ? "None" : formatBps(plan.investmentFeeBps)} />
          </Card>

          <Card style={{ gap: 8 }}>
            <Eyebrow tone="muted">About</Eyebrow>
            <BodySm>{property.description || property.summary}</BodySm>
            {property.highlights.map((h) => (
              <View key={h} style={{ flexDirection: "row", gap: 8 }}>
                <View style={{ width: 5, height: 5, borderRadius: 3, backgroundColor: t.text.brand, marginTop: 7 }} />
                <BodySm style={{ flex: 1 }}>{h}</BodySm>
              </View>
            ))}
            <View style={{ backgroundColor: t.bg.subtle, borderRadius: radius.md, padding: 12 }}>
              <Caption tone="muted">How returns are funded</Caption>
              <BodySm>{property.revenueModel}</BodySm>
            </View>
          </Card>

          <Card padded={false} style={{ paddingVertical: 6 }}>
            <Eyebrow tone="muted" style={{ paddingHorizontal: 14, paddingTop: 10 }}>
              Proof documents
            </Eyebrow>
            {property.proofDocuments.map((doc) => (
              <View key={doc.id} style={{ paddingHorizontal: 14 }}>
                <ListRow
                  icon={<FileText size={16} color={t.text.secondary} />}
                  title={doc.title}
                  caption={doc.reviewedBy}
                  chevron={false}
                  right={<StatusPill size="xs" tone={doc.status === "VERIFIED" ? "success" : doc.status === "PENDING_REVIEW" ? "pending" : "error"} label={doc.status === "VERIFIED" ? "Verified" : doc.status === "PENDING_REVIEW" ? "Under review" : "Expired"} />}
                />
              </View>
            ))}
          </Card>

          {property.updates.length > 0 ? (
            <Card style={{ gap: 10 }}>
              <Eyebrow tone="muted">Updates</Eyebrow>
              {property.updates.map((u) => (
                <View key={u.id} style={{ gap: 2 }}>
                  <Body style={{ fontWeight: "700" }}>{u.title}</Body>
                  <Caption tone="muted">{formatDate(u.publishedAt)}</Caption>
                  <BodySm tone="muted">{u.body}</BodySm>
                </View>
              ))}
            </Card>
          ) : null}

          <Card style={{ gap: 6 }}>
            <Eyebrow tone="muted">Terms</Eyebrow>
            {plan.terms.map((term) => (
              <BodySm key={term} tone="muted">
                · {term}
              </BodySm>
            ))}
          </Card>

          <StatePanel
            tone="warning"
            icon={<ShieldAlert size={18} color={t.status.warning.fg} />}
            title="Understand the risk"
            body={plan.riskDisclosures[0] ?? "Returns are expected, not guaranteed. Principal is at risk."}
          />
        </View>
      </ScrollView>

      {/* Sticky action bar */}
      <View style={{ position: "absolute", bottom: 0, left: 0, right: 0, paddingHorizontal: 12, paddingBottom: insets.bottom + 10 }}>
        <GlassSurface intensity={80} radius={radius.xl} style={{ flexDirection: "row", alignItems: "center", padding: 12, gap: 12 }}>
          <View style={{ flex: 1 }}>
            <Body style={{ fontWeight: "800" }}>{formatMoney(perSlot.principal)} / slot</Body>
            <Caption tone="muted">
              {formatBps(plan.roiBps)} · {formatDuration(plan.duration)}
            </Caption>
          </View>
          {soldOut ? (
            <Button label="Fully subscribed" disabled />
          ) : scheduled ? (
            <Button label={`Opens ${formatDate(round.opensAt)}`} disabled />
          ) : session.data ? (
            <Button label="Invest now" onPress={() => router.push(`/(modals)/checkout/${round.id}`)} />
          ) : (
            <Button label="Sign in to invest" onPress={() => router.push("/(auth)/login")} />
          )}
        </GlassSurface>
      </View>
    </View>
  );
}
