"use client";

import * as React from "react";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  PinInput,
  StatePanel,
  StatusPill,
  Switch,
  toast,
} from "@rentbrown/ui";
import { Monitor, Smartphone } from "lucide-react";
import { formatDateTime, formatRelativeDays } from "@rentbrown/utils";
import { MOCK_NOW } from "@rentbrown/mock-data";

import { usePinStatus, useProfile, useSetTransactionPin } from "../../../../lib/data/hooks";
import { useAuth } from "../../../../lib/data/provider";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";

export default function SecurityPage() {
  const session = useRequireSession();
  const profile = useProfile();
  const auth = useAuth();
  const [pinOpen, setPinOpen] = React.useState(false);
  const [pwOpen, setPwOpen] = React.useState(false);
  const [pin1, setPin1] = React.useState("");
  const [pin2, setPin2] = React.useState("");
  const [pinError, setPinError] = React.useState<string | null>(null);
  const [pw1, setPw1] = React.useState("");
  const [pw2, setPw2] = React.useState("");
  const [pwBusy, setPwBusy] = React.useState(false);
  const [pwError, setPwError] = React.useState<string | null>(null);
  const pinStatus = usePinStatus();
  const setPin = useSetTransactionPin();

  const submitPin = async () => {
    setPinError(null);
    if (pin1.length !== 6 || pin1 !== pin2) {
      setPinError("Enter the same 6 digits twice.");
      return;
    }
    try {
      await setPin.mutateAsync(pin1);
      setPinOpen(false);
      setPin1("");
      setPin2("");
      toast.success("Transaction PIN saved");
    } catch (e) {
      setPinError(e instanceof Error ? e.message : "Couldn't save the PIN — try again.");
    }
  };

  const submitPassword = async () => {
    setPwError(null);
    if (!auth) {
      toast.info("Password changes need a signed-in Supabase session (demo mode has none).");
      return;
    }
    if (pw1.length < 8) {
      setPwError("Use at least 8 characters.");
      return;
    }
    if (pw1 !== pw2) {
      setPwError("Passwords do not match.");
      return;
    }
    setPwBusy(true);
    try {
      await auth.updatePassword(pw1);
      setPwOpen(false);
      setPw1("");
      setPw2("");
      toast.success("Password updated");
    } catch (e) {
      setPwError(e instanceof Error ? e.message : "Couldn't update the password — try again.");
    } finally {
      setPwBusy(false);
    }
  };

  if (session.isPending || profile.isPending) return <PageSkeleton />;
  if (profile.isError || !profile.data) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load security settings"
        copy={profile.error?.message}
        action={
          <Button variant="outline" size="sm" onClick={() => profile.refetch()}>
            Retry
          </Button>
        }
      />
    );
  }

  const p = profile.data;
  const sec = p.security;
  // Server-truth PIN status when available; falls back to the profile fixture
  // on the unauthenticated demo path.
  const hasPin = pinStatus.data ?? sec.hasTransactionPin;

  const platformIcon = (platform: string) =>
    platform === "Web" ? <Monitor className="size-4" aria-hidden /> : <Smartphone className="size-4" aria-hidden />;

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Security & transaction PIN" copy="Protect your account and confirm sensitive actions." />

      <div className="financial-card flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-bold text-foreground">Transaction PIN</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Confirms investments and withdrawals.</p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill tone={hasPin ? "success" : "warning"}>
            {hasPin ? "Set" : "Not set"}
          </StatusPill>
          <Button variant="outline" size="sm" onClick={() => setPinOpen(true)}>
            {hasPin ? "Change PIN" : "Set PIN"}
          </Button>
        </div>
      </div>

      <div className="financial-card flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-bold text-foreground">Password</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {sec.lastPasswordChangeAt ? `Last changed ${formatRelativeDays(sec.lastPasswordChangeAt, MOCK_NOW)}` : "Never changed"}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => setPwOpen(true)}>
          Change password
        </Button>
      </div>

      <div className="financial-card flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-bold text-foreground">Two-factor authentication</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Extra verification at sign-in.</p>
        </div>
        <Switch
          checked={sec.twoFactorEnabled}
          onCheckedChange={() => toast.info("Coming in a later phase")}
          aria-label="Two-factor authentication"
        />
      </div>

      <div className="financial-card p-5">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-sm font-bold text-foreground">Devices & sessions</h2>
          <Button variant="outline" size="sm" onClick={() => toast.success("Signed out of other devices (prototype)")}>
            Sign out of all other devices
          </Button>
        </div>
        <div className="mt-3 divide-y divide-border">
          {sec.devices.map((d) => (
            <div key={d.id} className="flex items-center gap-3 py-3">
              <span className="flex size-9 shrink-0 items-center justify-center rounded-md bg-secondary-soft text-primary">
                {platformIcon(d.platform)}
              </span>
              <div className="min-w-0 flex-1">
                <p className="flex items-center gap-2 text-sm font-bold text-foreground">
                  {d.label}
                  {d.current ? <StatusPill tone="info">This device</StatusPill> : null}
                </p>
                <p className="text-[11px] text-tertiary">
                  {d.location} · {d.current ? "Active now" : `Last active ${formatDateTime(d.lastActiveAt)}`}
                </p>
              </div>
              {!d.current ? (
                <Button variant="ghost" size="sm" onClick={() => toast.success("Signed out (prototype)")}>
                  Sign out
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </div>

      <Dialog open={pinOpen} onOpenChange={setPinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{hasPin ? "Change transaction PIN" : "Set transaction PIN"}</DialogTitle>
            <DialogDescription>Enter a 6-digit PIN, then confirm it. It protects withdrawals and other sensitive actions.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {pinError ? <StatePanel tone="error" title="Couldn't save PIN" copy={pinError} /> : null}
            <PinInput value={pin1} onChange={setPin1} label="New PIN" />
            <PinInput value={pin2} onChange={setPin2} label="Confirm PIN" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPinOpen(false)}>
              Cancel
            </Button>
            <Button disabled={setPin.isPending || pin1.length !== 6 || pin1 !== pin2} onClick={() => void submitPin()}>
              {setPin.isPending ? "Saving…" : "Save PIN"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={pwOpen} onOpenChange={setPwOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Change password</DialogTitle>
            <DialogDescription>At least 8 characters. You stay signed in on this device.</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-4">
            {pwError ? <StatePanel tone="error" title="Couldn't update password" copy={pwError} /> : null}
            <Field label="New password" htmlFor="pw1">
              <Input id="pw1" type="password" autoComplete="new-password" value={pw1} onChange={(e) => setPw1(e.target.value)} />
            </Field>
            <Field label="Confirm new password" htmlFor="pw2">
              <Input id="pw2" type="password" autoComplete="new-password" value={pw2} onChange={(e) => setPw2(e.target.value)} />
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setPwOpen(false)}>
              Cancel
            </Button>
            <Button disabled={pwBusy || pw1.length < 8 || pw1 !== pw2} onClick={() => void submitPassword()}>
              {pwBusy ? "Updating…" : "Update password"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
