"use client";

import * as React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { Button, Field, Input, StatePanel } from "@rentbrown/ui";
import { loginSchema, type LoginInput } from "@rentbrown/validation";
import { resolveAdminActor } from "@rentbrown/supabase";

import { useAdminAuth } from "../../../lib/data/provider";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const { gateway, client } = useAdminAuth();
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    if (!gateway || !client) {
      setFormError("Authentication is not configured for this deployment.");
      return;
    }
    try {
      await gateway.signIn(values);
      // Signed in — but is this an admin? The grant is server truth.
      const actor = await resolveAdminActor(client);
      if (!actor) {
        await gateway.signOut();
        setFormError("This account has no admin access.");
        return;
      }
      router.replace(params.get("next") ?? "/dashboard");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "Sign in failed. Try again.");
    }
  });

  return (
    <div>
      <h1 className="text-xl font-extrabold tracking-tight text-foreground">Admin sign in</h1>
      <p className="mt-1 text-xs text-muted-foreground">
        Your operations role is verified after sign in.
      </p>

      {formError ? (
        <StatePanel tone="error" title="Sign in failed" copy={formError} className="mt-4" />
      ) : null}

      <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" {...register("email")} />
        </Field>
        <Field label="Password" htmlFor="password" error={errors.password?.message}>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              className="pr-11"
              {...register("password")}
            />
            <button
              type="button"
              aria-label={showPassword ? "Hide password" : "Show password"}
              onClick={() => setShowPassword((s) => !s)}
              className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-md text-muted-foreground hover:text-foreground"
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>
    </div>
  );
}

export default function AdminLoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}
