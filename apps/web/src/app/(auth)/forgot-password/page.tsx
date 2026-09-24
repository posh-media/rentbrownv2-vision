"use client";

import * as React from "react";
import Link from "next/link";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Field, Input, StatePanel } from "@rentbrown/ui";

const schema = z.object({ email: z.email() });
type Values = z.infer<typeof schema>;

export default function ForgotPasswordPage() {
  const [sent, setSent] = React.useState(false);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async () => {
    await new Promise((r) => setTimeout(r, 500));
    setSent(true);
  });

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Reset your password</h1>
      <p className="mt-2 text-sm text-muted-foreground">
        Enter the email on your account and we’ll send reset instructions.
      </p>

      {sent ? (
        <StatePanel
          tone="success"
          title="Check your inbox"
          copy="If an account exists for that email we've sent reset instructions."
          className="mt-6"
        />
      ) : (
        <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
          <Field label="Email" htmlFor="email" error={errors.email?.message}>
            <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
          </Field>
          <Button type="submit" size="lg" disabled={isSubmitting}>
            {isSubmitting ? "Sending…" : "Send reset link"}
          </Button>
        </form>
      )}

      <p className="mt-6 text-sm text-muted-foreground">
        Remembered it?{" "}
        <Link href="/login" className="font-bold text-primary hover:underline">
          Back to sign in
        </Link>
      </p>
    </div>
  );
}
