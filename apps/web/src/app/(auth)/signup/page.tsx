"use client";

import * as React from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Button, Field, Input, StatePanel, toast } from "@rentbrown/ui";
import { signupSchema, type SignupInput } from "@rentbrown/validation";

import { useSignUp } from "../../../lib/data/hooks";

function SignupForm() {
  const router = useRouter();
  const params = useSearchParams();
  const signUp = useSignUp();
  const [formError, setFormError] = React.useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<SignupInput>({
    resolver: zodResolver(signupSchema),
    defaultValues: { referralCode: params.get("ref") ?? undefined },
  });

  const onSubmit = handleSubmit(async (values) => {
    setFormError(null);
    try {
      const { referralCode, ...rest } = values;
      await signUp.mutateAsync({ ...rest, referralCode: referralCode || undefined });
      toast.success("Account created — welcome to RentBrown");
      router.replace("/dashboard");
    } catch (e) {
      setFormError(e instanceof Error ? e.message : "We couldn't create your account. Try again.");
    }
  });

  return (
    <div>
      <h1 className="text-3xl font-extrabold tracking-tight text-foreground">Create your account</h1>
      <p className="mt-2 text-sm text-muted-foreground">Invest in Nigerian property from a single slot.</p>

      {formError ? (
        <StatePanel tone="error" title="Sign up failed" copy={formError} className="mt-5" />
      ) : null}

      <form onSubmit={onSubmit} className="mt-6 flex flex-col gap-4" noValidate>
        <Field label="Full name" htmlFor="fullName" error={errors.fullName?.message}>
          <Input id="fullName" autoComplete="name" placeholder="Ada Lovelace" {...register("fullName")} />
        </Field>
        <Field label="Email" htmlFor="email" error={errors.email?.message}>
          <Input id="email" type="email" autoComplete="email" placeholder="you@example.com" {...register("email")} />
        </Field>
        <Field
          label="Phone"
          htmlFor="phone"
          hint="Nigerian number: +234… or 0…"
          error={errors.phone?.message}
        >
          <Input id="phone" type="tel" autoComplete="tel" placeholder="0803 000 0000" {...register("phone")} />
        </Field>
        <Field label="Password" htmlFor="password" hint="At least 8 characters" error={errors.password?.message}>
          <Input id="password" type="password" autoComplete="new-password" {...register("password")} />
        </Field>
        <Field label="Referral code (optional)" htmlFor="referralCode" error={errors.referralCode?.message}>
          <Input id="referralCode" placeholder="e.g. ADA-1234" {...register("referralCode")} />
        </Field>
        <Field error={errors.acceptTerms?.message}>
          <label className="flex min-h-11 cursor-pointer items-start gap-2.5 text-sm text-foreground">
            <input type="checkbox" className="mt-0.5 size-4 accent-[var(--primary)]" {...register("acceptTerms")} />
            <span>
              I agree to the{" "}
              <Link href="/legal/terms" className="font-bold text-primary hover:underline">
                Terms
              </Link>{" "}
              and{" "}
              <Link href="/legal/risk" className="font-bold text-primary hover:underline">
                Risk disclosures
              </Link>
            </span>
          </label>
        </Field>
        <Button type="submit" size="lg" disabled={isSubmitting}>
          {isSubmitting ? "Creating account…" : "Create account"}
        </Button>
      </form>

      <p className="mt-6 text-sm text-muted-foreground">
        Already have an account?{" "}
        <Link href="/login" className="font-bold text-primary hover:underline">
          Sign in
        </Link>
      </p>
    </div>
  );
}

export default function SignupPage() {
  return (
    <React.Suspense fallback={null}>
      <SignupForm />
    </React.Suspense>
  );
}
