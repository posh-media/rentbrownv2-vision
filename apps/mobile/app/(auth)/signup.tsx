import { useRouter } from "expo-router";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { signupSchema, type SignupInput } from "@rentbrown/validation";

import { useAuth, useDataSource, useScenario } from "../../src/data/provider";
import { BodySm, Button, Field, H1, Screen, StatePanel, useToast, type FieldProps } from "../../src/ui";

export default function Signup() {
  const router = useRouter();
  const ds = useDataSource();
  const auth = useAuth();
  const { setScenario } = useScenario();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  // Confirm-password is a local form concern — not part of the shared schema.
  const [confirm, setConfirm] = React.useState("");
  const [confirmError, setConfirmError] = React.useState<string | undefined>();

  const { control, handleSubmit } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: {
      fullName: "",
      username: "",
      email: "",
      phone: "",
      password: "",
      referralCode: "",
      acceptTerms: true,
    },
  });

  const submit = handleSubmit(async (values) => {
    if (values.password !== confirm) {
      setConfirmError("Passwords do not match");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      await ds.signUp(values);
      setScenario("default");
      await qc.invalidateQueries();
      toast("Account created");
      router.replace("/(tabs)/home");
    } catch (e) {
      const err = e as Error & { code?: string };
      if (err.code === "EMAIL_CONFIRMATION_REQUIRED" || err.message === "EMAIL_CONFIRMATION_REQUIRED") {
        // Account exists but has no session until the email link is tapped.
        router.replace({
          pathname: "/(auth)/verify-email",
          params: { email: values.email },
        } as never);
        return;
      }
      setError(err.message || "Sign up failed — please try again.");
    } finally {
      setBusy(false);
    }
  });

  const field = (name: Exclude<keyof SignupInput, "acceptTerms">, label: string, extra?: Partial<FieldProps>) => (
    <Controller
      control={control}
      name={name}
      render={({ field: f, fieldState }) => (
        <Field label={label} value={f.value} onChangeText={f.onChange} error={fieldState.error?.message} {...extra} />
      )}
    />
  );

  return (
    <Screen padded bottomPad={24}>
      <H1 style={{ marginTop: 24 }}>Create account</H1>
      <BodySm tone="muted">Invest in property-backed rounds, one slot at a time.</BodySm>
      {error ? <StatePanel tone="error" title="Couldn't create your account" body={error} /> : null}
      {field("fullName", "Full name", { autoComplete: "name" })}
      <Controller
        control={control}
        name="username"
        render={({ field: f, fieldState }) => (
          <Field
            label="Username"
            autoCapitalize="none"
            autoCorrect={false}
            value={f.value}
            onChangeText={(v) => f.onChange(v.toLowerCase())}
            error={fieldState.error?.message}
            hint="3–20 characters: lowercase letters, digits, underscores"
          />
        )}
      />
      {field("email", "Email", { keyboardType: "email-address", autoCapitalize: "none" })}
      {field("phone", "Phone", { keyboardType: "phone-pad", hint: "e.g. 08012345678 or +2348012345678" })}
      {field("password", "Password", { secureTextEntry: true, hint: "At least 8 characters" })}
      <Field
        label="Confirm password"
        secureTextEntry
        value={confirm}
        onChangeText={(v) => {
          setConfirm(v);
          setConfirmError(undefined);
        }}
        error={confirmError}
      />
      {field("referralCode", "Referral code (optional)", { autoCapitalize: "characters" })}
      <Button size="lg" fullWidth label="Create account" loading={busy} onPress={() => void submit()} />
      {auth ? (
        <BodySm tone="muted" center>
          By continuing you agree to the RentBrown terms and risk disclosures.
        </BodySm>
      ) : (
        <BodySm tone="muted" center>
          Prototype build: no real account is created.
        </BodySm>
      )}
    </Screen>
  );
}
