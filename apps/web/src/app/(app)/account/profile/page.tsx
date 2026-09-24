"use client";

import * as React from "react";
import {
  Button,
  Field,
  Input,
  Label,
  StatePanel,
  StatusPill,
  toast,
} from "@rentbrown/ui";
import type { UserProfile } from "@rentbrown/types";

import { useProfile } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";

function ProfileForm({ profile: p }: { profile: UserProfile }) {
  const [firstName, setFirstName] = React.useState(p.firstName);
  const [lastName, setLastName] = React.useState(p.lastName);
  const [phone, setPhone] = React.useState(p.phone);

  return (
    <form
      className="financial-card flex flex-col gap-5 p-5 sm:p-6"
      onSubmit={(e) => {
        e.preventDefault();
        toast.success("Profile saved (prototype)");
      }}
    >
      <div className="grid gap-5 sm:grid-cols-2">
        <Field>
          <Label htmlFor="firstName">First name</Label>
          <Input id="firstName" value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" />
        </Field>
        <Field>
          <Label htmlFor="lastName">Last name</Label>
          <Input id="lastName" value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" />
        </Field>
      </div>
      <Field>
        <Label htmlFor="email">Email</Label>
        <div className="flex items-center gap-2">
          <Input id="email" value={p.email} readOnly disabled className="flex-1" />
          {p.emailVerified ? (
            <StatusPill tone="success">Verified</StatusPill>
          ) : (
            <Button variant="outline" size="sm" type="button" onClick={() => toast.info("Verification email arrives with the backend")}>
              Verify
            </Button>
          )}
        </div>
      </Field>
      <Field>
        <Label htmlFor="phone">Phone</Label>
        <Input id="phone" value={phone} onChange={(e) => setPhone(e.target.value)} autoComplete="tel" />
      </Field>
      <p className="text-xs text-muted-foreground">Name changes require re-verification in production.</p>
      <Button type="submit" className="w-fit">
        Save changes
      </Button>
    </form>
  );
}

export default function ProfilePage() {
  const session = useRequireSession();
  const profile = useProfile();

  if (session.isPending || profile.isPending) return <PageSkeleton />;

  if (profile.isError || !profile.data) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load your profile"
        copy={profile.error?.message}
        action={
          <Button variant="outline" size="sm" onClick={() => profile.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-8">
      <PageHeader title="Profile & personal details" copy="This information appears on your account and verification records." />
      <ProfileForm key={profile.data.id} profile={profile.data} />
    </div>
  );
}
