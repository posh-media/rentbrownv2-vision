"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { Button, Field, Input, StatePanel, toast } from "@rentbrown/ui";
import { loginSchema, type LoginInput } from "@rentbrown/validation";

import { useSignIn } from "../../../lib/data/hooks";

function LoginForm() {
  const router = useRouter();
  const params = useSearchParams();
  const signIn = useSignIn();
  const [showPassword, setShowPassword] = React.useState(false);
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginInput>({ resolver: zodResolver(loginSchema) });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      await signIn.mutateAsync(values);
      toast.success("Welcome back");
      router.replace(params.get("next") ?? "/dashboard");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "We couldn't sign you in. Try again.");
    }
  });

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Welcome back</h1>
      <p className="mt-2 text-sm text-muted-foreground">Sign in to see your investments and wallet.</p>

      {formError ? (
        <StatePanel tone="error" title="Sign in failed" copy={formError} className="mt-5" />
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
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
        <div className="flex justify-end">
          <Link href="/forgot-password" className="text-xs font-bold text-primary hover:underline">
            Forgot password?
          </Link>
        </div>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Signing in…" : "Sign in"}
        </Button>
      </form>

      <p className="mt-4 text-xs text-muted-foreground">
        Prototype: any email and an 8+ character password signs you in.
      </p>
      <p className="mt-6 text-sm text-muted-foreground">
        New to RentBrown?{" "}
        <Link href="/signup" className="font-bold text-primary hover:underline">
          Create an account
        </Link>
      </p>
    </div>
  );
}

export default function LoginPage() {
  return (
    <React.Suspense fallback={null}>
      <LoginForm />
    </React.Suspense>
  );
}
