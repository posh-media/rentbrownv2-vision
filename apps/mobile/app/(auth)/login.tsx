import { useRouter } from "expo-router";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { loginSchema, type LoginInput } from "@rentbrown/validation";

import { useDataSource, useScenario } from "../../src/data/provider";
import { Body, BodySm, Button, Field, H1, Screen, useToast } from "../../src/ui";

export default function Login() {
  const router = useRouter();
  const ds = useDataSource();
  const { setScenario } = useScenario();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  const { control, handleSubmit } = useForm<LoginInput>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  const submit = handleSubmit(async (values) => {
    setBusy(true);
    try {
      setScenario("default");
      await ds.signIn(values);
      await qc.invalidateQueries();
      toast("Welcome back");
      router.replace("/(tabs)/home");
    } finally {
      setBusy(false);
    }
  });

  return (
    <Screen padded bottomPad={24}>
      <H1 style={{ marginTop: 24 }}>Sign in</H1>
      <BodySm tone="muted">Access your portfolio, wallet and referrals.</BodySm>
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
      <BodySm tone="muted" center>
        Prototype: any email + 8+ chars works.
      </BodySm>
      <Body center>
        <Button variant="ghost" label="Create an account" onPress={() => router.push("/(auth)/signup")} />
      </Body>
    </Screen>
  );
}
