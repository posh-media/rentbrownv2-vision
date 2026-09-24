import { useRouter } from "expo-router";
import * as Linking from "expo-linking";
import { ShieldCheck } from "lucide-react-native";
import * as React from "react";
import { View } from "react-native";

import { useAuth, useDataSource } from "../src/data/provider";
import { establishRecoverySession } from "../src/lib/supabase";
import { t } from "../src/theme";
import {
  BodySm,
  Button,
  Caption,
  Field,
  H1,
  Screen,
  Skeleton,
  SkeletonCard,
  StatePanel,
  useToast,
} from "../src/ui";

type Stage = "checking" | "ready" | "done" | "error";

/**
 * Deep-link target for password recovery (`rentbrown://reset-password`).
 *
 * The reset email link opens this route with the recovery credential in the
 * URL — `?code=` (PKCE), `?token_hash=` (OTP) or `#access_token=` (implicit).
 * `Linking.useURL()` exposes the full link (expo-router params drop the hash
 * fragment), and `establishRecoverySession` exchanges it for a real recovery
 * session before the new-password form is enabled.
 *
 * Requires `rentbrown://reset-password` in the Supabase project's allowed
 * redirect URLs. Without a credential, a user who already holds a session
 * (e.g. navigated here after PASSWORD_RECOVERY) may also set a new password.
 */
export default function ResetPassword() {
  const router = useRouter();
  const auth = useAuth();
  const ds = useDataSource();
  const url = Linking.useURL();
  const { toast } = useToast();

  const [stage, setStage] = React.useState<Stage>("checking");
  const [error, setError] = React.useState<string | null>(null);
  const [password, setPassword] = React.useState("");
  const [confirm, setConfirm] = React.useState("");
  const [fieldError, setFieldError] = React.useState<string | undefined>();
  const [busy, setBusy] = React.useState(false);

  React.useEffect(() => {
    let cancelled = false;
    void (async () => {
      // A link carrying a credential or an explicit error?
      if (url && /[?#&](code|token_hash|access_token|error)=/.test(url)) {
        try {
          await establishRecoverySession(url);
          if (!cancelled) setStage("ready");
        } catch (e) {
          if (!cancelled) {
            setError(e instanceof Error ? e.message : "This reset link could not be used.");
            setStage("error");
          }
        }
        return;
      }
      // No credential in the URL — an existing session (recovery or normal
      // sign-in) is enough to enable the form.
      try {
        const session = await ds.getSession();
        if (!cancelled) setStage(session ? "ready" : "error");
        if (!cancelled && !session) {
          setError("Open the reset link from your email, or request a new one.");
        }
      } catch {
        if (!cancelled) {
          setError("We couldn't verify your reset session. Request a new link.");
          setStage("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url, ds]);

  const submit = async () => {
    if (password.length < 8) {
      setFieldError("Use at least 8 characters");
      return;
    }
    if (password !== confirm) {
      setFieldError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!auth) throw new Error("Account backend is not configured on this build.");
      await auth.updatePassword(password);
      setStage("done");
      toast("Password updated");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Couldn't update your password — try again.");
    } finally {
      setBusy(false);
    }
  };

  if (stage === "checking") {
    return (
      <Screen scroll={false} padded bottomPad={24}>
        <Skeleton height={48} width="70%" />
        <SkeletonCard lines={3} />
      </Screen>
    );
  }

  if (stage === "done") {
    return (
      <Screen padded bottomPad={24}>
        <View style={{ marginTop: 48, alignItems: "center", gap: 12 }}>
          <ShieldCheck size={44} color={t.status.success.fg} />
          <H1 center>Password updated</H1>
          <BodySm tone="muted" center>
            Your new password is active. Use it next time you sign in.
          </BodySm>
        </View>
        <Button size="lg" fullWidth label="Continue" onPress={() => router.replace("/(tabs)/home")} />
      </Screen>
    );
  }

  return (
    <Screen padded bottomPad={24}>
      <H1 style={{ marginTop: 24 }}>Choose a new password</H1>
      <BodySm tone="muted">Set a fresh password for your RentBrown account.</BodySm>
      {stage === "error" && error ? (
        <StatePanel
          tone="error"
          title="This reset link isn't usable"
          body={error}
          actionLabel="Request a new link"
          onAction={() => router.replace("/(auth)/forgot-password")}
        />
      ) : null}
      {stage === "ready" ? (
        <>
          {error ? <StatePanel tone="error" title="Couldn't update your password" body={error} /> : null}
          <Field
            label="New password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            hint="At least 8 characters"
          />
          <Field
            label="Confirm new password"
            secureTextEntry
            value={confirm}
            onChangeText={(v) => {
              setConfirm(v);
              setFieldError(undefined);
            }}
            error={fieldError}
          />
          <Button size="lg" fullWidth label="Update password" loading={busy} onPress={() => void submit()} />
        </>
      ) : null}
      {stage === "error" ? (
        <Caption tone="muted" center>
          Reset links expire — request a fresh one if this keeps failing.
        </Caption>
      ) : null}
    </Screen>
  );
}
