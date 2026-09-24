import { useLocalSearchParams, useRouter } from "expo-router";
import { MailCheck } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import { resendConfirmationEmail } from "../../src/lib/supabase";
import { t } from "../../src/theme";
import { BodySm, Button, Caption, H1, Screen, StatePanel, useToast } from "../../src/ui";

/**
 * "Check your inbox" — shown when signup succeeds but the Supabase project
 * requires email confirmation before a session is issued.
 */
export default function VerifyEmail() {
  const router = useRouter();
  const { toast } = useToast();
  const params = useLocalSearchParams<{ email?: string }>();
  const email = typeof params.email === "string" ? params.email : "";
  const [busy, setBusy] = React.useState(false);
  const [resent, setResent] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const resend = async () => {
    if (!email) return;
    setBusy(true);
    setError(null);
    try {
      await resendConfirmationEmail(email);
      setResent(true);
      toast("Confirmation email sent again");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't resend — try again in a moment.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen padded bottomPad={24}>
      <View style={{ marginTop: 48, alignItems: "center", gap: 12 }}>
        <MailCheck size={44} color={t.text.brand} />
        <H1 center>Check your inbox</H1>
        <BodySm tone="muted" center>
          {email
            ? `We sent a confirmation link to ${email}. Tap it to verify your email, then sign in.`
            : "We sent you a confirmation link. Tap it to verify your email, then sign in."}
        </BodySm>
      </View>
      {error ? <StatePanel tone="error" title="Couldn't resend the email" body={error} /> : null}
      {resent ? (
        <StatePanel tone="success" title="Email sent" body="If the address is registered, a fresh confirmation link is on its way." />
      ) : null}
      <Button size="lg" fullWidth label="Go to sign in" onPress={() => router.replace("/(auth)/login")} />
      {email ? (
        <Button variant="outline" fullWidth label="Resend confirmation email" loading={busy} onPress={() => void resend()} />
      ) : null}
      <Caption tone="muted" center>
        Didn't get it? Check spam, or resend after a minute.
      </Caption>
      <Button variant="ghost" label="Back to welcome" onPress={() => router.replace("/(auth)/welcome")} />
    </Screen>
  );
}
