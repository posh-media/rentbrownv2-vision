import { useRouter } from "expo-router";
import { MailCheck } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import { useAuth } from "../../src/data/provider";
import { t } from "../../src/theme";
import { BodySm, Button, Field, H1, Screen, StatePanel } from "../../src/ui";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends a Supabase recovery email whose link lands on the
 * `rentbrown://reset-password` deep link (see app/reset-password.tsx).
 */
export default function ForgotPassword() {
  const router = useRouter();
  const auth = useAuth();
  const [email, setEmail] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [error, setError] = React.useState<string | null>(null);
  const [busy, setBusy] = React.useState(false);
  const [sent, setSent] = React.useState(false);

  const submit = async () => {
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setFieldError("Enter a valid email address");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      // auth is null only in mock review builds — the success state still
      // renders so the flow can be reviewed end to end.
      await auth?.requestPasswordReset({ email: value, redirectTo: "rentbrown://reset-password" });
      setSent(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't send the reset link — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (sent) {
    return (
      <Screen padded bottomPad={24}>
        <View style={{ marginTop: 48, alignItems: "center", gap: 12 }}>
          <MailCheck size={44} color={t.text.brand} />
          <H1 center>Check your inbox</H1>
          <BodySm tone="muted" center>
            If an account exists for {email.trim()}, we sent a password reset link. It opens in the
            RentBrown app.
          </BodySm>
        </View>
        {auth ? null : (
          <BodySm tone="muted" center>
            Prototype build: no real email was sent.
          </BodySm>
        )}
        <Button size="lg" fullWidth label="Back to sign in" onPress={() => router.replace("/(auth)/login")} />
      </Screen>
    );
  }

  return (
    <Screen padded bottomPad={24}>
      <H1 style={{ marginTop: 24 }}>Reset password</H1>
      <BodySm tone="muted">Enter your account email and we'll send a reset link.</BodySm>
      {error ? <StatePanel tone="error" title="Couldn't send the reset link" body={error} /> : null}
      <Field
        label="Email"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
        value={email}
        onChangeText={(v) => {
          setEmail(v);
          setFieldError(undefined);
        }}
        error={fieldError}
      />
      <Button size="lg" fullWidth label="Send reset link" loading={busy} onPress={() => void submit()} />
      <Button variant="ghost" label="Back to sign in" onPress={() => router.back()} />
    </Screen>
  );
}
