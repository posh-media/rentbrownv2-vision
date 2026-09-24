import { Image } from "expo-image";
import { useLocalSearchParams, useRouter } from "expo-router";
import { CheckCircle2, Clock, TriangleAlert } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import {
  formatBps,
  formatDate,
  formatDuration,
  formatMoney,
} from "@rentbrown/utils";
import type { PropertyImageKey } from "@rentbrown/mock-data";

import { useInvestment } from "../../../src/data/hooks";
import { propertyImage } from "../../../src/lib/images";
import { t } from "../../../src/theme";
import {
  Body,
  BodySm,
  Caption,
  Card,
  DataRow,
  EmptyState,
  Eyebrow,
  HeaderBar,
  ListRow,
  MoneyFigure,
  Screen,
  SkeletonCard,
  StatePanel,
  Timeline,
} from "../../../src/ui";

export default function InvestmentDetails() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const investment = useInvestment(id ?? "");

  if (investment.isLoading) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar back title="Investment" />
        <SkeletonCard lines={5} />
      </Screen>
    );
  }
  const inv = investment.data;
  if (!inv) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar back title="Investment" />
        <EmptyState title="Investment not found" actionLabel="Back" onAction={() => router.back()} />
      </Screen>
    );
  }

  const pending = inv.status === "PAYMENT_PENDING";
  const completed = inv.status === "COMPLETED";
  const eyebrow = pending ? "Awaiting payment" : completed ? "Matured investment" : "Active investment";

  return (
    <Screen bottomPad={110}>
      <HeaderBar back title={eyebrow} />
      <View style={{ gap: 4 }}>
        <Body style={{ fontSize: 22, fontWeight: "800" }}>{inv.propertyName}</Body>
        <BodySm tone="muted">
          {completed && inv.completedAt
            ? `Completed on ${formatDate(inv.completedAt, "long")}`
            : pending
              ? "Complete your bank transfer to confirm your slots"
              : inv.maturesAt
                ? `Matures on ${formatDate(inv.maturesAt, "long")}`
                : ""}
        </BodySm>
      </View>

      {completed ? (
        <StatePanel
          tone="success"
          icon={<CheckCircle2 size={18} color={t.status.success.fg} />}
          title="Principal and profit credited"
          body={
            inv.settlement
              ? `${formatMoney(inv.maturityValue, inv.currency)} was credited to your available balance on ${formatDate(inv.settlement.creditedAt)}. References ${inv.settlement.principalReference} · ${inv.settlement.profitReference}.`
              : "Settlement credited to your wallet."
          }
        />
      ) : pending ? (
        <StatePanel
          tone="warning"
          icon={<Clock size={18} color={t.status.warning.fg} />}
          title="Awaiting your transfer"
          body="Your slots are reserved. Complete the bank transfer to activate this investment."
          actionLabel="View transfer instructions"
          onAction={() => router.push(`/(modals)/payment/${inv.reference}`)}
        />
      ) : (
        <StatePanel
          tone="success"
          icon={<CheckCircle2 size={18} color={t.status.success.fg} />}
          title="Investment is active"
          body={`Your principal is allocated. ${inv.daysRemaining ?? "—"} days remain until maturity.`}
        />
      )}

      <View style={{ flexDirection: "row", gap: 8 }}>
        <Card style={{ flex: 1, padding: 12, gap: 2 }}>
          <Caption tone="muted">Principal</Caption>
          <MoneyFigure minor={inv.principal} currency={inv.currency} size="sm" />
        </Card>
        <Card style={{ flex: 1, padding: 12, gap: 2 }}>
          <Caption tone="muted">{completed ? "Profit credited" : "Expected profit"}</Caption>
          <MoneyFigure minor={inv.expectedProfit} currency={inv.currency} size="sm" tone="success" />
        </Card>
        <Card style={{ flex: 1, padding: 12, gap: 2, backgroundColor: t.bg.inverse, borderColor: t.bg.inverse }}>
          <Caption tone="inverse" style={{ opacity: 0.7 }}>
            Maturity value
          </Caption>
          <MoneyFigure minor={inv.maturityValue} currency={inv.currency} size="sm" tone="inverse" />
        </Card>
      </View>

      <Card style={{ gap: 2 }}>
        <Eyebrow tone="muted" style={{ marginBottom: 6 }}>
          Investment record
        </Eyebrow>
        <DataRow label="Reference" value={inv.reference} copyable={inv.reference} />
        <DataRow label="Property" value={inv.propertyName} />
        <DataRow label="Plan" value={inv.planName} />
        <DataRow label="Slots" value={String(inv.slots)} />
        <DataRow label="Slot price" value={formatMoney(inv.slotPrice, inv.currency)} />
        <DataRow label="Expected return" value={formatBps(inv.roiBps)} />
        <DataRow label="Duration" value={formatDuration(inv.duration)} />
        <DataRow label="Funding source" value={inv.fundingSource === "WALLET" ? "Wallet" : inv.fundingSource === "BANK_TRANSFER" ? "Bank transfer" : "Card"} />
        {inv.activatedAt ? <DataRow label="Activated" value={formatDate(inv.activatedAt)} /> : null}
        {inv.maturesAt ? <DataRow label="Matures" value={formatDate(inv.maturesAt)} /> : null}
        {inv.completedAt ? <DataRow label="Completed" value={formatDate(inv.completedAt)} /> : null}
        {inv.settlement ? (
          <>
            <DataRow label="Principal reference" value={inv.settlement.principalReference} copyable={inv.settlement.principalReference} />
            <DataRow label="Profit reference" value={inv.settlement.profitReference} copyable={inv.settlement.profitReference} />
          </>
        ) : null}
      </Card>

      <Card style={{ gap: 12 }}>
        <Eyebrow tone="muted">Timeline</Eyebrow>
        <Timeline
          items={inv.timeline.map((e) => ({
            label: e.label,
            at: e.at ? formatDate(e.at) : null,
            state: e.state,
            note: e.reference,
          }))}
        />
      </Card>

      <PressablePropertyCard slug={inv.propertySlug} image={inv.propertyImage} name={inv.propertyName} location={inv.locationLabel} />

      <StatePanel
        tone="info"
        icon={<TriangleAlert size={16} color={t.status.info.fg} />}
        title="No early exit"
        body="Principal cannot be withdrawn before maturity. Expected returns are projections, not guarantees."
      />
    </Screen>
  );
}

function PressablePropertyCard({ slug, image, name, location }: { slug: string; image: string; name: string; location: string }) {
  const router = useRouter();
  return (
    <Card padded={false}>
      <ListRow
        icon={
          <Image
            source={propertyImage(image as PropertyImageKey)}
            style={{ width: 44, height: 44, borderRadius: 10, backgroundColor: t.bg.sunken }}
            contentFit="cover"
          />
        }
        title={name}
        caption={location}
        right={<Caption tone="brand">View opportunity</Caption>}
        onPress={() => router.push(`/(tabs)/explore/${slug}`)}
        style={{ paddingHorizontal: 14 }}
      />
    </Card>
  );
}
