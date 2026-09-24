import { useRouter } from "expo-router";
import * as React from "react";

import { BodySm, Button, Field, H1, Screen, useToast } from "../../src/ui";

export default function ForgotPassword() {
  const router = useRouter();
  const { toast } = useToast();
  const [email, setEmail] = React.useState("");
  return (
    <Screen padded bottomPad={24}>
      <H1 style={{ marginTop: 24 }}>Reset password</H1>
      <BodySm tone="muted">Enter your email and we would send a reset link.</BodySm>
      <Field label="Email" keyboardType="email-address" autoCapitalize="none" value={email} onChangeText={setEmail} />
      <Button
        size="lg"
        fullWidth
        label="Send reset link"
        onPress={() => {
          toast("Password reset arrives with the auth phase");
          router.back();
        }}
      />
    </Screen>
  );
}
