import { KeyRound, Monitor, ScanFace, Smartphone } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";
import { formatListDate } from "@rentbrown/utils";
import { MOCK_NOW } from "@rentbrown/mock-data";

import { useProfile } from "../../../src/data/hooks";
import { t } from "../../../src/theme";
import {
  Body,
  BottomSheet,
  Button,
  Caption,
  Card,
  HeaderBar,
  ListRow,
  PinPad,
  Screen,
  SkeletonCard,
  StatusPill,
  Switch,
  useToast,
} from "../../../src/ui";

export default function Security() {
  const profile = useProfile();
  const { toast } = useToast();
  const [pinSheet, setPinSheet] = React.useState(false);
  const [pin, setPin] = React.useState("");
  const [bio, setBio] = React.useState(false);
  const p = profile.data;

  return (
    <Screen bottomPad={110}>
      <HeaderBar back title="Security" />
      {profile.isLoading || !p ? (
        <SkeletonCard lines={4} />
      ) : (
        <>
          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <KeyRound size={18} color={t.text.secondary} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: "800" }}>Transaction PIN</Body>
                <Caption tone="muted">Confirms withdrawals and wallet payments</Caption>
              </View>
              <StatusPill size="xs" tone={p.security.hasTransactionPin ? "success" : "neutral"} label={p.security.hasTransactionPin ? "Set" : "Not set"} />
            </View>
            <Button variant="outline" size="sm" label={p.security.hasTransactionPin ? "Change PIN" : "Set PIN"} onPress={() => setPinSheet(true)} />
          </Card>

          <Card style={{ gap: 10 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <ScanFace size={18} color={t.text.secondary} />
              <View style={{ flex: 1 }}>
                <Body style={{ fontWeight: "800" }}>Biometrics</Body>
                <Caption tone="muted">Unlock and confirm with your face or fingerprint</Caption>
              </View>
              <Switch
                value={bio}
                label="Biometrics"
                onValueChange={(v) => {
                  setBio(v);
                  toast("Coming in a later phase");
                }}
              />
            </View>
          </Card>

          <Card style={{ gap: 10 }}>
            <Body style={{ fontWeight: "800" }}>Password</Body>
            <Caption tone="muted">
              {p.security.lastPasswordChangeAt ? `Last changed ${formatListDate(p.security.lastPasswordChangeAt, MOCK_NOW)}` : "Not changed yet"}
            </Caption>
            <Button variant="outline" size="sm" label="Change password" onPress={() => toast("Password changes arrive with the auth phase")} />
          </Card>

          <Card padded={false} style={{ paddingVertical: 6 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 14, paddingTop: 10 }}>
              <Body style={{ fontWeight: "800" }}>Devices & sessions</Body>
              <Caption tone="brand" onPress={() => toast("Signed out of other devices")}>
                Sign out others
              </Caption>
            </View>
            {p.security.devices.map((d) => (
              <ListRow
                key={d.id}
                icon={d.platform === "Web" ? <Monitor size={16} color={t.text.secondary} /> : <Smartphone size={16} color={t.text.secondary} />}
                title={d.label}
                caption={`${d.location} · ${formatListDate(d.lastActiveAt, MOCK_NOW)}`}
                chevron={false}
                right={
                  d.current ? (
                    <StatusPill size="xs" tone="info" label="This device" />
                  ) : (
                    <Button size="sm" variant="ghost" label="Sign out" onPress={() => toast(`Signed out of ${d.label}`)} />
                  )
                }
              />
            ))}
          </Card>
        </>
      )}
      <BottomSheet open={pinSheet} onClose={() => setPinSheet(false)}>
        <View style={{ gap: 16 }}>
          <Body style={{ fontWeight: "800" }} center>
            {p?.security.hasTransactionPin ? "Enter a new transaction PIN" : "Set your transaction PIN"}
          </Body>
          <PinPad
            value={pin}
            onChange={setPin}
            onComplete={() => {
              setPinSheet(false);
              setPin("");
              toast("PIN updated");
            }}
          />
        </View>
      </BottomSheet>
    </Screen>
  );
}
