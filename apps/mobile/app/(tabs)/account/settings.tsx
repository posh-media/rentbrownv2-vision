import { useRouter } from "expo-router";
import { FlaskConical, Trash2 } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { humanizeStatus } from "@rentbrown/utils";
import type { NotificationCategory } from "@rentbrown/types";

import { useProfile } from "../../../src/data/hooks";
import { t } from "../../../src/theme";
import {
  Body,
  BodySm,
  BottomSheet,
  Button,
  Caption,
  Card,
  HeaderBar,
  ListRow,
  Screen,
  SkeletonCard,
  Switch,
  useToast,
} from "../../../src/ui";

const CATEGORIES: NotificationCategory[] = ["INVESTMENTS", "MONEY", "KYC", "REFERRALS", "SECURITY", "ANNOUNCEMENTS"];

export default function Settings() {
  const router = useRouter();
  const profile = useProfile();
  const { toast } = useToast();
  const [currencySheet, setCurrencySheet] = React.useState(false);
  const [deleteSheet, setDeleteSheet] = React.useState(false);
  const p = profile.data;

  return (
    <Screen bottomPad={110}>
      <HeaderBar back title="Preferences" />
      {profile.isLoading || !p ? (
        <SkeletonCard lines={4} />
      ) : (
        <>
          <Card>
            <ListRow
              title="Display currency"
              caption={`Currently ${p.preferences.displayCurrency}`}
              chevron={false}
              right={<Button size="sm" variant="outline" label={p.preferences.displayCurrency} onPress={() => setCurrencySheet(true)} />}
            />
          </Card>
          <Card padded={false} style={{ paddingVertical: 6 }}>
            <Body style={{ fontWeight: "800", paddingHorizontal: 14, paddingTop: 10 }}>Notifications</Body>
            {CATEGORIES.map((cat) => {
              const pref = p.preferences.notifications[cat] ?? { push: false, email: false };
              const locked = cat === "SECURITY";
              return (
                <View key={cat} style={{ flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 14, paddingVertical: 10 }}>
                  <View style={{ flex: 1 }}>
                    <BodySm style={{ fontWeight: "700" }}>{humanizeStatus(cat)}</BodySm>
                    {locked ? <Caption tone="muted">Security alerts can't be turned off</Caption> : null}
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Caption tone="muted">Push</Caption>
                    <Switch value={pref.push} disabled={locked} label={`${cat} push`} onValueChange={() => toast("Preferences arrive with the backend")} />
                  </View>
                  <View style={{ alignItems: "center" }}>
                    <Caption tone="muted">Email</Caption>
                    <Switch value={pref.email} disabled={locked} label={`${cat} email`} onValueChange={() => toast("Preferences arrive with the backend")} />
                  </View>
                </View>
              );
            })}
          </Card>
          <Card>
            <ListRow
              icon={<FlaskConical size={16} color={t.text.secondary} />}
              title="Prototype scenario"
              caption="Switch mock data and latency"
              onPress={() => router.push("/(modals)/prototype")}
            />
          </Card>
          <Button variant="ghost" label="Delete account" icon={<Trash2 size={15} color={t.status.error.fg} />} onPress={() => setDeleteSheet(true)} />
        </>
      )}
      <BottomSheet open={currencySheet} onClose={() => setCurrencySheet(false)}>
        <View style={{ gap: 4 }}>
          {(["NGN", "USD"] as const).map((c) => (
            <ListRow
              key={c}
              title={c === "NGN" ? "Nigerian Naira (₦)" : "US Dollar ($)"}
              chevron={false}
              onPress={() => {
                setCurrencySheet(false);
                toast("Display conversion arrives with the backend");
              }}
            />
          ))}
        </View>
      </BottomSheet>
      <BottomSheet open={deleteSheet} onClose={() => setDeleteSheet(false)}>
        <View style={{ gap: 10 }}>
          <Body style={{ fontWeight: "800" }}>Delete account</Body>
          <BodySm tone="muted">
            Account deletion in production follows retention rules: active investments must mature or settle first,
            and records are retained as required by law. Nothing is deleted in this prototype.
          </BodySm>
          <Button variant="outline" label="Close" onPress={() => setDeleteSheet(false)} />
        </View>
      </BottomSheet>
    </Screen>
  );
}
