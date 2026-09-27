import { AlertCircle, Check, CircleAlert, ShieldCheck } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { formatDate } from "@rentbrown/utils";

import { useKyc } from "../../../src/data/hooks";
import { t } from "../../../src/theme";
import {
  Body,
  BodySm,
  BottomSheet,
  Button,
  Caption,
  Card,
  HeaderBar,
  IconCircle,
  ListRow,
  Screen,
  SkeletonCard,
  StatePanel,
  StatusPill,
} from "../../../src/ui";

export default function Kyc() {
  const kyc = useKyc();
  const [sheetOpen, setSheetOpen] = React.useState(false);
  const k = kyc.data;

  return (
    <Screen bottomPad={110}>
      <HeaderBar back title="Identity verification" eyebrow="Required before withdrawals" />
      {kyc.isLoading || !k ? (
        <SkeletonCard lines={4} />
      ) : (
        <>
          {k.status === "VERIFIED" ? (
            <StatePanel tone="success" icon={<ShieldCheck size={18} color={t.status.success.fg} />} title={`Verified · Tier ${k.tier}`} body={k.reviewedAt ? `Reviewed ${formatDate(k.reviewedAt)}.` : undefined} />
          ) : k.status === "PENDING_REVIEW" ? (
            <StatePanel tone="pending" icon={<CircleAlert size={18} color={t.status.pending.fg} />} title="Documents received — under review" body={k.submittedAt ? `Submitted ${formatDate(k.submittedAt)}.` : undefined} />
          ) : k.status === "REJECTED" ? (
            <StatePanel tone="error" icon={<AlertCircle size={18} color={t.status.error.fg} />} title="Action required" body={k.rejectionReason} actionLabel="Upload a clearer document" onAction={() => setSheetOpen(true)} />
          ) : k.status === "IN_PROGRESS" ? (
            <StatePanel tone="info" icon={<CircleAlert size={18} color={t.status.info.fg} />} title="Verification in progress" body="Finish the remaining steps to submit for review." />
          ) : (
            <StatePanel tone="neutral" title="Not started" body="Verification protects your account and unlocks withdrawals." actionLabel="Start verification" onAction={() => setSheetOpen(true)} />
          )}

          <Card padded={false} style={{ paddingVertical: 6 }}>
            <Caption tone="muted" style={{ paddingHorizontal: 14, paddingTop: 10 }}>
              Steps
            </Caption>
            {k.steps.map((step, i) => (
              <ListRow
                key={step.id}
                icon={
                  <IconCircle size={28} tone={step.state === "complete" ? "success" : step.state === "action_required" ? "error" : "neutral"}>
                    {step.state === "complete" ? (
                      <Check size={14} color={t.status.success.fg} />
                    ) : step.state === "action_required" ? (
                      <AlertCircle size={14} color={t.status.error.fg} />
                    ) : (
                      <Caption>{i + 1}</Caption>
                    )}
                  </IconCircle>
                }
                title={step.title}
                caption={step.description}
                chevron={false}
                right={
                  <StatusPill
                    size="xs"
                    tone={step.state === "complete" ? "success" : step.state === "action_required" ? "error" : step.state === "current" ? "pending" : "neutral"}
                    label={step.state === "complete" ? "Done" : step.state === "action_required" ? "Action needed" : step.state === "current" ? "Current" : "Upcoming"}
                  />
                }
              />
            ))}
          </Card>

          <Card style={{ gap: 6 }}>
            <Caption tone="muted">What verification unlocks</Caption>
            {k.unlocks.map((u) => (
              <View key={u} style={{ flexDirection: "row", gap: 8 }}>
                <Check size={14} color={t.status.success.fg} style={{ marginTop: 3 }} />
                <BodySm style={{ flex: 1 }}>{u}</BodySm>
              </View>
            ))}
          </Card>

          <Card style={{ backgroundColor: t.bg.subtle }}>
            <BodySm tone="muted">
              Documents are stored privately and reviewed only by the RentBrown compliance team. Your
              BVN is never shown back to you or to other users.
            </BodySm>
          </Card>
        </>
      )}
      <BottomSheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <View style={{ gap: 10 }}>
          <Body style={{ fontWeight: "800" }}>Complete verification on the web app</Body>
          <BodySm tone="muted">
            Document capture lives on the RentBrown web app for now — your status here updates as soon
            as it changes.
          </BodySm>
          <Button variant="outline" label="Close" onPress={() => setSheetOpen(false)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
