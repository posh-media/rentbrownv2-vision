"use client";

import * as React from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import type { AccountStatus, AdminUserDetail } from "@rentbrown/types";
import { formatDate, formatDateTime, formatMoney, idempotencyKey } from "@rentbrown/utils";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Select,
  StatePanel,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from "@rentbrown/ui";

import { useSetUserStatus, useUser } from "../../../../lib/data/hooks";
import { DetailRow } from "../../../../components/detail-drawer";
import { BackLink, PageHeader, TableSkeleton } from "../../../../components/page-header";
import { PermissionGate } from "../../../../components/permission-gate";
import { StatusCell } from "../../../../components/status-cell";

const ACCOUNT_LABEL: Record<"AVAILABLE" | "RESERVED" | "BONUS" | "PENDING", string> = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  BONUS: "Bonus",
  PENDING: "Pending",
};

function StatusAction({ user }: { user: AdminUserDetail }) {
  const mutation = useSetUserStatus();
  const [open, setOpen] = React.useState(false);
  const [next, setNext] = React.useState<AccountStatus>(user.accountStatus === "ACTIVE" ? "RESTRICTED" : "ACTIVE");
  const [reason, setReason] = React.useState("");

  return (
    <PermissionGate permission="users.manage_status" mode="disable">
      <>
        <Button size="sm" variant="outline" onClick={() => setOpen(true)}>
          Change status
        </Button>
        <Dialog open={open} onOpenChange={setOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Change account status</DialogTitle>
              <DialogDescription>
                Records an admin intent for {user.displayName}. In production this calls the backend; here it updates the mock store.
              </DialogDescription>
            </DialogHeader>
            <Field label="New status" htmlFor="status">
              <Select id="status" value={next} onChange={(e) => setNext(e.target.value as AccountStatus)}>
                <option value="ACTIVE">Active</option>
                <option value="RESTRICTED">Restricted</option>
                <option value="SUSPENDED">Suspended</option>
              </Select>
            </Field>
            <Field label="Reason (audit trail)" htmlFor="reason" className="mt-3">
              <Textarea id="reason" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="e.g. Chargeback investigation" />
            </Field>
            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button
                disabled={mutation.isPending || reason.trim().length < 3}
                onClick={() =>
                  mutation.mutate(
                    { userId: user.id, status: next, reason: reason.trim(), idempotencyKey: idempotencyKey("usr") },
                    {
                      onSuccess: (res) => {
                        toast.success(res.message);
                        setOpen(false);
                        setReason("");
                      },
                      onError: (e) => toast.error(e.message),
                    },
                  )
                }
              >
                {mutation.isPending ? "Saving…" : "Confirm change"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </>
    </PermissionGate>
  );
}

export default function UserDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { data: user, isLoading, isError } = useUser(id);

  if (isLoading) {
    return (
      <div>
        <BackLink href="/users" label="Users" />
        <TableSkeleton rows={8} cols={4} />
      </div>
    );
  }
  if (isError || !user) {
    return (
      <div>
        <BackLink href="/users" label="Users" />
        <StatePanel tone="error" title="User not found" copy="This user may not exist in the mock dataset." />
      </div>
    );
  }

  return (
    <div>
      <BackLink href="/users" label="Users" />
      <PageHeader
        title={
          <span className="flex items-center gap-3">
            <span className="flex size-10 items-center justify-center rounded-full bg-primary text-sm font-extrabold text-primary-foreground">
              {user.initials}
            </span>
            {user.displayName}
          </span>
        }
        description={
          <span className="flex flex-wrap items-center gap-2">
            <StatusCell status={user.accountStatus} />
            <StatusCell status={user.kycStatus} />
            {user.flags.map((f) => (
              <StatusCell key={f} status="warning" label={f} />
            ))}
            <span className="text-xs text-muted-foreground">Member since {formatDate(user.memberSince)}</span>
          </span>
        }
        actions={<StatusAction user={user} />}
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="flex flex-col gap-6 lg:col-span-2">
          {/* Wallet breakdown */}
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-3 text-muted-foreground">Wallet</h2>
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {(Object.keys(ACCOUNT_LABEL) as Array<keyof typeof ACCOUNT_LABEL>).map((k) => (
                <div key={k} className="rounded-md border border-border bg-surface-subtle/50 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wide text-muted-foreground">{ACCOUNT_LABEL[k]}</p>
                  <p className="tabular mt-1 text-lg font-extrabold">{formatMoney(user.wallet[k], user.currency)}</p>
                </div>
              ))}
            </div>
          </section>

          {/* Tabs */}
          <Tabs defaultValue="investments">
            <TabsList>
              <TabsTrigger value="investments">Investments ({user.investments.length})</TabsTrigger>
              <TabsTrigger value="deposits">Deposits ({user.deposits.length})</TabsTrigger>
              <TabsTrigger value="withdrawals">Withdrawals ({user.withdrawals.length})</TabsTrigger>
              <TabsTrigger value="referrals">Referrals ({user.referrals.length})</TabsTrigger>
            </TabsList>
            <TabsContent value="investments">
              <div className="financial-card divide-y">
                {user.investments.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No investments.</p>
                ) : (
                  user.investments.map((i) => (
                    <Link key={i.id} href={`/investments/${i.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-subtle/60">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{i.propertyName} · R{i.roundNumber}</p>
                        <p className="font-mono text-[11px] text-tertiary">{i.reference}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular text-sm font-semibold">{formatMoney(i.principal, i.currency)}</span>
                        <StatusCell status={i.status} />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </TabsContent>
            <TabsContent value="deposits">
              <div className="financial-card divide-y">
                {user.deposits.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No deposits.</p>
                ) : (
                  user.deposits.map((d) => (
                    <div key={d.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{d.channelLabel}</p>
                        <p className="font-mono text-[11px] text-tertiary">{d.reference}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular text-sm font-semibold">{formatMoney(d.amount, d.currency)}</span>
                        <StatusCell status={d.status} />
                      </div>
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
            <TabsContent value="withdrawals">
              <div className="financial-card divide-y">
                {user.withdrawals.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No withdrawals.</p>
                ) : (
                  user.withdrawals.map((w) => (
                    <Link key={w.id} href={`/finance/withdrawals/${w.id}`} className="flex items-center justify-between gap-3 px-4 py-3 hover:bg-surface-subtle/60">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{w.destinationLabel}</p>
                        <p className="font-mono text-[11px] text-tertiary">{w.reference}</p>
                      </div>
                      <div className="flex shrink-0 items-center gap-3">
                        <span className="tabular text-sm font-semibold">{formatMoney(w.amount, w.currency)}</span>
                        <StatusCell status={w.status} />
                      </div>
                    </Link>
                  ))
                )}
              </div>
            </TabsContent>
            <TabsContent value="referrals">
              <div className="financial-card divide-y">
                {user.referrals.length === 0 ? (
                  <p className="p-4 text-sm text-muted-foreground">No referrals attributed to this user.</p>
                ) : (
                  user.referrals.map((r) => (
                    <div key={r.id} className="flex items-center justify-between gap-3 px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{r.referredName}</p>
                        <p className="font-mono text-[11px] text-tertiary">{r.codeSnapshot} · {formatDate(r.attributedAt)}</p>
                      </div>
                      <StatusCell status={r.status} />
                    </div>
                  ))
                )}
              </div>
            </TabsContent>
          </Tabs>
        </div>

        <div className="flex flex-col gap-6">
          {/* Profile facts */}
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-2 text-muted-foreground">Profile</h2>
            <DetailRow label="Email">{user.email}</DetailRow>
            <DetailRow label="Phone">{user.phone}</DetailRow>
            <DetailRow label="Referral code" mono>{user.referralCode}</DetailRow>
            <DetailRow label="Referred by" mono>{user.referredBy ?? "—"}</DetailRow>
            <DetailRow label="Last active">{formatDateTime(user.lastActiveAt)}</DetailRow>
            <DetailRow label="Devices">
              {user.devices.map((d) => `${d.label} (${d.platform})`).join(" · ") || "—"}
            </DetailRow>
          </section>

          {/* Admin notes */}
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-3 text-muted-foreground">Admin notes</h2>
            {user.notes.length === 0 ? (
              <p className="text-xs text-muted-foreground">No notes recorded.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {user.notes.map((n) => (
                  <div key={n.id} className="rounded-md border border-border bg-surface-subtle/40 p-3">
                    <p className="text-xs font-bold">{n.author}</p>
                    <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                    <p className="mt-1 font-mono text-[10px] text-tertiary">{formatDateTime(n.createdAt)}</p>
                  </div>
                ))}
              </div>
            )}
          </section>

          {/* Activity */}
          <section className="financial-card p-4">
            <h2 className="eyebrow mb-3 text-muted-foreground">Activity</h2>
            {user.activity.length === 0 ? (
              <p className="text-xs text-muted-foreground">No audit events reference this user yet.</p>
            ) : (
              <div className="flex flex-col gap-3">
                {user.activity.map((a) => (
                  <div key={a.id} className="flex items-start justify-between gap-2 text-xs">
                    <div className="min-w-0">
                      <p className="font-semibold">{a.summary}</p>
                      <p className="mt-0.5 font-mono text-[10px] text-tertiary">{a.actor.displayName} · {formatDateTime(a.occurredAt)}</p>
                    </div>
                    <StatusCell status={a.result} className="shrink-0" />
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
