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
  Select,
  StatePanel,
  Switch,
  toast,
} from "@rentbrown/ui";
import type { NotificationCategory } from "@rentbrown/types";

import { useProfile } from "../../../../lib/data/hooks";
import { useRequireSession } from "../../../../lib/session";
import { PageHeader } from "../../../../components/layout/page-header";
import { PageSkeleton } from "../../../../components/layout/page-skeleton";

const CATEGORY_LABELS: Record<NotificationCategory, string> = {
  INVESTMENTS: "Investments",
  MONEY: "Money",
  KYC: "Verification",
  REFERRALS: "Referrals",
  SECURITY: "Security",
  ANNOUNCEMENTS: "Announcements",
};

export default function SettingsPage() {
  const session = useRequireSession();
  const profile = useProfile();
  const [deleteOpen, setDeleteOpen] = React.useState(false);

  if (session.isPending || profile.isPending) return <PageSkeleton />;
  if (profile.isError || !profile.data) {
    return (
      <StatePanel
        tone="error"
        title="We couldn't load settings"
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
  const categories = Object.keys(p.preferences.notifications) as NotificationCategory[];

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6">
      <PageHeader title="Preferences" copy="Display and notification settings for your account." />

      <div className="financial-card flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-bold text-foreground">Display currency</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Amounts are stored in naira.</p>
        </div>
        <Select
          defaultValue={p.preferences.displayCurrency}
          aria-label="Display currency"
          className="w-28"
          onChange={(e) => {
            if (e.target.value !== "NGN") toast.info("Display conversion arrives with the backend");
          }}
        >
          <option value="NGN">NGN</option>
          <option value="USD">USD</option>
        </Select>
      </div>

      <div className="financial-card p-5">
        <h2 className="text-sm font-bold text-foreground">Notification preferences</h2>
        <div className="mt-3">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-6 gap-y-1">
            <span className="eyebrow pb-2 text-muted-foreground">Category</span>
            <span className="eyebrow pb-2 text-center text-muted-foreground">Push</span>
            <span className="eyebrow pb-2 text-center text-muted-foreground">Email</span>
            {categories.map((c) => {
              const pref = p.preferences.notifications[c];
              const locked = c === "SECURITY";
              return (
                <React.Fragment key={c}>
                  <span className="border-t border-border py-3 text-sm font-semibold text-foreground">
                    {CATEGORY_LABELS[c]}
                    {locked ? <span className="block text-[11px] font-normal text-tertiary">Security alerts can&apos;t be turned off</span> : null}
                  </span>
                  <span className="border-t border-border py-3 text-center">
                    <Switch
                      checked={pref.push}
                      disabled={locked}
                      onCheckedChange={() => toast.info("Saved with the backend phase")}
                      aria-label={`${CATEGORY_LABELS[c]} push notifications`}
                    />
                  </span>
                  <span className="border-t border-border py-3 text-center">
                    <Switch
                      checked={pref.email}
                      disabled={locked}
                      onCheckedChange={() => toast.info("Saved with the backend phase")}
                      aria-label={`${CATEGORY_LABELS[c]} email notifications`}
                    />
                  </span>
                </React.Fragment>
              );
            })}
          </div>
        </div>
      </div>

      <div className="financial-card flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-bold text-foreground">Prototype scenario</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Switch mock states from the floating toolbar.</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => toast.info("Use the “Prototype” pill at the bottom-left of the screen")}>
          Open toolbar hint
        </Button>
      </div>

      <div className="financial-card flex items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-bold text-foreground">Delete account</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">Permanently close your account.</p>
        </div>
        <Button variant="ghost" size="sm" className="text-[var(--error-fg)]" onClick={() => setDeleteOpen(true)}>
          Delete account
        </Button>
      </div>

      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete your account?</DialogTitle>
            <DialogDescription>
              In production this schedules deletion after identity checks. Records required for
              compliance are retained for the statutory period. This prototype takes no action.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setDeleteOpen(false)}>
              Keep account
            </Button>
            <Button variant="outline" onClick={() => setDeleteOpen(false)}>
              I understand
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
