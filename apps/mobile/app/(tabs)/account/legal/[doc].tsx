import { useLocalSearchParams } from "expo-router";
import * as React from "react";
import { View } from "react-native";
import { formatDate } from "@rentbrown/utils";

import { useContent } from "../../../../src/data/hooks";
import {
  BodySm,
  Caption,
  Card,
  EmptyState,
  HeaderBar,
  H2,
  Screen,
  SkeletonCard,
  StatePanel,
  StatusPill,
} from "../../../../src/ui";

export default function LegalDoc() {
  const { doc } = useLocalSearchParams<{ doc: string }>();
  const content = useContent();
  const legal = content.data?.legal.find((l) => l.id === doc);

  return (
    <Screen bottomPad={110}>
      <HeaderBar back title="Legal" />
      {content.isLoading ? (
        <SkeletonCard lines={5} />
      ) : !legal ? (
        <EmptyState title="Document not found" />
      ) : (
        <>
          <H2>{legal.title}</H2>
          <View style={{ flexDirection: "row", gap: 6 }}>
            <StatusPill size="xs" tone="neutral" label={`v${legal.version}`} />
            <StatusPill size="xs" tone="info" label={`Effective ${formatDate(legal.effectiveAt)}`} />
          </View>
          <StatePanel tone="info" title="In plain terms" body={legal.summary} />
          {legal.sections.map((s) => (
            <Card key={s.heading} style={{ gap: 6 }}>
              <Caption>{s.heading}</Caption>
              <BodySm tone="muted">{s.body}</BodySm>
            </Card>
          ))}
        </>
      )}
    </Screen>
  );
}
