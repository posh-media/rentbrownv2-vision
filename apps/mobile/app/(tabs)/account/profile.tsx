import * as React from "react";
import { View } from "react-native";

import { useProfile } from "../../../src/data/hooks";
import { BodySm, Button, Caption, Card, Field, HeaderBar, Screen, SkeletonCard, StatusPill, useToast } from "../../../src/ui";

export default function Profile() {
  const profile = useProfile();
  if (profile.isLoading || !profile.data) {
    return (
      <Screen bottomPad={110}>
        <HeaderBar back title="Profile" />
        <SkeletonCard lines={4} />
      </Screen>
    );
  }
  return <ProfileForm key={profile.data.id} />;
}

function ProfileForm() {
  const profile = useProfile();
  const { toast } = useToast();
  const p = profile.data!;
  const [firstName, setFirstName] = React.useState(p.firstName);
  const [lastName, setLastName] = React.useState(p.lastName);
  const [phone, setPhone] = React.useState(p.phone);

  return (
    <Screen bottomPad={110}>
      <HeaderBar back title="Profile" />
      <Card style={{ gap: 14 }}>
        <Field label="First name" value={firstName} onChangeText={setFirstName} autoComplete="given-name" />
        <Field label="Last name" value={lastName} onChangeText={setLastName} autoComplete="family-name" />
        <View style={{ gap: 6 }}>
          <Caption tone="muted">Email</Caption>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <BodySm style={{ flex: 1 }}>{p.email}</BodySm>
            {p.emailVerified ? (
              <StatusPill tone="success" size="xs" label="Verified" />
            ) : (
              <Button size="sm" variant="outline" label="Verify" onPress={() => toast("Email verification arrives with the auth phase")} />
            )}
          </View>
        </View>
        <Field label="Phone" value={phone} onChangeText={setPhone} keyboardType="phone-pad" />
        <Button label="Save changes" onPress={() => toast("Profile saved")} />
        <BodySm tone="muted">Name changes require re-verification in production.</BodySm>
      </Card>
      {p.emailVerified ? null : null}
    </Screen>
  );
}
