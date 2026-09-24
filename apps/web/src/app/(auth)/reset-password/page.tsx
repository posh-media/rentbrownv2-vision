"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button, Field, Input, StatePanel, toast } from "@rentbrown/ui";

import { useAuth } from "../../../lib/data/provider";
import { useSession } from "../../../lib/data/hooks";

const schema = z
  .object({
    password: z.string().min(8, "Use at least 8 characters"),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, {
    path: ["confirm"],
    message: "Passwords do not match",
  });
type Values = z.infer<typeof schema>;

/**
 * Lands here after /auth/callback exchanged a recovery code — the user holds
 * a live recovery session, so updateUser({ password }) is permitted.
 */
export default function ResetPasswordPage() {
  const router = useRouter();
  const auth = useAuth();
  const session = useSession();
  const [formError, setFormError] = React.useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (!auth) {
      setFormError("Account backend is not configured on this build.");
      return;
    }
    try {
      await auth.updatePassword(values.password);
      toast.success("Password updated");
      router.replace("/dashboard");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Couldn't update the password — request a new link.");
    }
  });

  // Recovery session must exist before we show the form — otherwise the
  // link was invalid/expired (callback would have bounced to /login?error=link,
  // but a direct visit lands here too).
  if (session.isPending) return null;
  if (auth && session.data === null) {
    return (
      <div>
        <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Reset your password</h1>
        <StatePanel
          tone="error"
          title="This reset link isn't active"
          copy="It may have expired or already been used. Request a fresh link to continue."
          className="mt-5"
        />
        <p className="mt-6 text-sm text-muted-foreground">
          <Link href="/forgot-password" className="font-bold text-primary hover:underline">
            Request a new link
          </Link>
        </p>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Choose a new password</h1>
      <p className="mt-2 text-sm text-muted-foreground">At least 8 characters.</p>

      {formError ? (
        <StatePanel tone="error" title="Couldn't update password" copy={formError} className="mt-5" />
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Field label="New password" htmlFor="password" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Field label="Confirm new password" htmlFor="confirm" error={errors.confirm?.message}>
          <Input id="confirm" type="password" autoComplete="new-password" {...register("confirm")} />
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Updating…" : "Update password"}
        </Button>
      </form>
    </div>
  );
}
