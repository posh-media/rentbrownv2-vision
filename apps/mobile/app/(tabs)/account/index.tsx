import { useRouter } from "expo-router";
import {
  CircleHelp,
  CreditCard,
  FlaskConical,
  Gift,
  KeyRound,
  LogOut,
  Scale,
  SlidersHorizontal,
  User,
} from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { useQueryClient } from "@tanstack/react-query";
import { KYC_STATUS, formatDate } from "@rentbrown/utils";

import { useKyc, useProfile } from "../../../src/data/hooks";
import { useDataSource, useSession } from "../../../src/data/provider";
import { t } from "../../../src/theme";
import {
  Avatar,
  Body,
  Button,
  Caption,
  Card,
  EmptyState,
  HeaderBar,
  ListRow,
  Screen,
  SkeletonCard,
  StatusPill,
  useToast,
} from "../../../src/ui";

export default function Account() {
  const router = useRouter();
  const session = useSession();
  const profile = useProfile();
  const kyc = useKyc();
  const ds = useDataSource();
  const qc = useQueryClient();
  const { toast } = useToast();

  if (!session.isLoading && !session.data) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar large title="Account" />
        <EmptyState title="Sign in to manage your account" actionLabel="Sign in" onAction={() => router.push("/(auth)/login")} />
      </Screen>
    );
  }

  const p = profile.data;
  const kycStatus = kyc.data?.status;
  const rows: Array<{ icon: React.ReactNode; title: string; caption?: string; href: string }> = [
    { icon: <User size={16} color={t.text.secondary} />, title: "Profile & personal details", caption: "Name, email, phone", href: "/(tabs)/account/profile" },
    { icon: <CreditCard size={16} color={t.text.secondary} />, title: "Identity verification", caption: kycStatus ? KYC_STATUS[kycStatus].label : "Not started", href: "/(tabs)/account/kyc" },
    { icon: <KeyRound size={16} color={t.text.secondary} />, title: "Security & transaction PIN", caption: "PIN, biometrics, devices", href: "/(tabs)/account/security" },
    { icon: <SlidersHorizontal size={16} color={t.text.secondary} />, title: "Preferences", caption: "Currency, notifications", href: "/(tabs)/account/settings" },
    { icon: <Gift size={16} color={t.text.secondary} />, title: "Referrals", caption: "Invite people you know", href: "/(tabs)/account/referrals" },
    { icon: <CircleHelp size={16} color={t.text.secondary} />, title: "Help & tutorials", href: "/(tabs)/account/help" },
    { icon: <Scale size={16} color={t.text.secondary} />, title: "Legal", caption: "Terms, privacy, risk", href: "/(tabs)/account/legal/terms" },
    { icon: <FlaskConical size={16} color={t.text.secondary} />, title: "Prototype scenario", caption: "Switch mock data", href: "/(modals)/prototype" },
  ];

  return (
    <Screen bottomPad={110}>
      <HeaderBar large title="Account" />
      {profile.isLoading ? (
        <SkeletonCard lines={3} />
      ) : p ? (
        <Card style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
          <Avatar initials={p.initials} size={56} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Body style={{ fontWeight: "800" }}>{p.displayName}</Body>
            <Caption tone="muted" numberOfLines={1}>
              {p.email} · {p.phone}
            </Caption>
            <View style={{ flexDirection: "row", gap: 6, marginTop: 6 }}>
              {kycStatus ? <StatusPill size="xs" tone={KYC_STATUS[kycStatus].tone} label={KYC_STATUS[kycStatus].label} /> : null}
              <StatusPill size="xs" tone="neutral" label={`Since ${formatDate(p.memberSince)}`} />
            </View>
          </View>
        </Card>
      ) : null}
      <Card padded={false} style={{ paddingVertical: 4 }}>
        {rows.map((r) => (
          <ListRow key={r.title} icon={r.icon} title={r.title} caption={r.caption} onPress={() => router.push(r.href as never)} style={{ paddingHorizontal: 14 }} />
        ))}
      </Card>
      <Button
        variant="outline"
        label="Sign out"
        icon={<LogOut size={16} color={t.text.primary} />}
        onPress={async () => {
          try {
            await ds.signOut();
          } finally {
            // Clear every cached domain query even if the network call failed;
            // the (tabs) guard and this redirect both land on welcome.
            qc.clear();
            toast("Signed out");
            router.replace("/(auth)/welcome");
          }
        }}
      />
    </Screen>
  );
}
