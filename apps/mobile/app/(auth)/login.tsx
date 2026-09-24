import { useRouter } from "expo-router";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { loginSchema, type LoginInput } from "@rentbrown/validation";

import { useAuth, useDataSource, useScenario } from "../../src/data/provider";
import { Body, BodySm, Button, Field, H1, Screen, StatePanel, useToast } from "../../src/ui";

export default function Login() {
  const router = useRouter();
  const ds = useDataSource();
  const auth = useAuth();
  const { setScenario } = useScenario();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const { control, handleSubmit } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = handleSubmit(async (values) => {
    setBusy(true);
    setError(null);
    try {
      // ds.signIn goes through the live AuthGateway when Supabase is
      // configured — invalid credentials, unverified email and disabled
      // (SUSPENDED/CLOSED) accounts all reject with readable messages.
      await ds.signIn(values);
      setScenario("default");
      await qc.invalidateQueries();
      toast("Welcome back");
      router.replace("/(tabs)/home");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Sign in failed — please try again.");
    } finally {
      setBusy(false);
    }
  });

  return (
    <Screen padded bottomPad={24}>
      <H1 style={{ marginTop: 24 }}>Sign in</H1>
      <BodySm tone="muted">Access your portfolio, wallet and referrals.</BodySm>
      {error ? <StatePanel tone="error" title="Couldn't sign you in" body={error} /> : null}
      <Controller
        control={control}
        name="email"
        render={({ field, fieldState }) => (
          <Field
            label="Email"
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field, fieldState }) => (
          <Field
            label="Password"
            secureTextEntry
            value={field.value}
            onChangeText={field.onChange}
            error={fieldState.error?.message}
          />
        )}
      />
      <Button
        variant="ghost"
        label="Forgot password?"
        onPress={() => router.push("/(auth)/forgot-password")}
      />
      <Button size="lg" fullWidth label="Sign in" loading={busy} onPress={() => void submit()} />
      {auth ? null : (
        <BodySm tone="muted" center>
          Prototype build: any email + 8+ chars works.
        </BodySm>
      )}
      <Body center>
        <Button variant="ghost" label="Create an account" onPress={() => router.push("/(auth)/signup")} />
      </Body>
    </Screen>
  );
}
