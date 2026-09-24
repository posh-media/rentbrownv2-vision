import { useRouter } from "expo-router";
import * as React from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQueryClient } from "@tanstack/react-query";
import { signupSchema, type SignupInput } from "@rentbrown/validation";

import { useDataSource, useScenario } from "../../src/data/provider";
import { BodySm, Button, Field, H1, Screen, useToast, type FieldProps } from "../../src/ui";

export default function Signup() {
  const router = useRouter();
  const ds = useDataSource();
  const { setScenario } = useScenario();
  const { toast } = useToast();
  const qc = useQueryClient();
  const [busy, setBusy] = React.useState(false);

  const { control, handleSubmit } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { fullName: "", email: "", phone: "", password: "", referralCode: "", acceptTerms: true },
  });

  const submit = handleSubmit(async (values) => {
    setBusy(true);
    try {
      setScenario("default");
      await ds.signUp(values);
      await qc.invalidateQueries();
      toast("Account created");
      router.replace("/(tabs)/home");
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
      <BodySm tone="muted">Start with a fictional prototype profile.</BodySm>
      {field("fullName", "Full name", { autoComplete: "name" })}
      {field("email", "Email", { keyboardType: "email-address", autoCapitalize: "none" })}
      {field("phone", "Phone", { keyboardType: "phone-pad" })}
      {field("password", "Password", { secureTextEntry: true })}
      {field("referralCode", "Referral code (optional)")}
      <Button size="lg" fullWidth label="Create account" loading={busy} onPress={() => void submit()} />
      <BodySm tone="muted" center>
        Prototype: no real account is created.
      </BodySm>
    </Screen>
  );
}
