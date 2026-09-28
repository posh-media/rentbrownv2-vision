"use client";

import * as React from "react";
import type { AdminRewardTaskRow, AdminTaskClaimRow, TaskStatus } from "@rentbrown/types";
import { formatDateTime, formatMoney, idempotencyKey } from "@rentbrown/utils";
import {
  Badge,
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Field,
  Input,
  Select,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
  toast,
} from "@rentbrown/ui";

import {
  useReviewTaskClaim,
  useRewardTasks,
  useSetTaskStatus,
  useTaskClaims,
  useUpsertRewardTask,
  useUpsertTaskRequirement,
} from "../../../lib/data/hooks";
import { usePermissions } from "../../../lib/data/provider";
import { ColumnDef, DataTable } from "../../../components/data-table";
import { FilterBar, FilterSelect } from "../../../components/filter-bar";
import { PageHeader } from "../../../components/page-header";
import { PermissionGate } from "../../../components/permission-gate";
import { StatusCell } from "../../../components/status-cell";

const PAGE_SIZE = 15;

const TRANSITIONS: Record<TaskStatus, TaskStatus[]> = {
  DRAFT: ["PUBLISHED", "ARCHIVED"],
  PUBLISHED: ["PAUSED", "ARCHIVED"],
  PAUSED: ["PUBLISHED", "ARCHIVED"],
  ARCHIVED: [],
};

const TRANSITION_LABEL: Record<TaskStatus, string> = {
  DRAFT: "Move to draft",
  PUBLISHED: "Publish",
  PAUSED: "Pause",
  ARCHIVED: "Archive",
};

const REQUIREMENT_KINDS = [
  { value: "TELEGRAM_MEMBERSHIP", label: "Telegram channel membership" },
  { value: "WHATSAPP_MEMBERSHIP", label: "WhatsApp group membership" },
  { value: "APP_ACTION", label: "In-app action (auto-checked)" },
  { value: "MANUAL_EVIDENCE", label: "Manual evidence" },
  { value: "EXTERNAL_WEBHOOK", label: "External webhook" },
];

function TasksView() {
  const { has } = usePermissions();
  const [taskQuery, setTaskQuery] = React.useState("");
  const [taskStatus, setTaskStatus] = React.useState("ALL");
  const [taskSort, setTaskSort] = React.useState<string | undefined>("-createdAt");
  const [taskPage, setTaskPage] = React.useState(1);
  const [claimQuery, setClaimQuery] = React.useState("");
  const [claimStatus, setClaimStatus] = React.useState("MANUAL_REVIEW");
  const [claimSort, setClaimSort] = React.useState<string | undefined>("-createdAt");
  const [claimPage, setClaimPage] = React.useState(1);

  const [createOpen, setCreateOpen] = React.useState(false);
  const [review, setReview] = React.useState<{ claim: AdminTaskClaimRow; legId: string } | null>(
    null,
  );
  const [note, setNote] = React.useState("");

  // New-task form state
  const [slug, setSlug] = React.useState("");
  const [title, setTitle] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [rewardNaira, setRewardNaira] = React.useState("");
  const [claimPolicy, setClaimPolicy] = React.useState<"ONE_TIME" | "REPEATABLE">("ONE_TIME");
  const [reqKind, setReqKind] = React.useState("MANUAL_EVIDENCE");

  const tasks = useRewardTasks({
    query: taskQuery || undefined,
    status: taskStatus === "ALL" ? undefined : [taskStatus as TaskStatus],
    sort: taskSort,
    page: taskPage,
    pageSize: PAGE_SIZE,
  });
  const claims = useTaskClaims({
    query: claimQuery || undefined,
    status: claimStatus === "ALL" ? undefined : [claimStatus as AdminTaskClaimRow["status"]],
    sort: claimSort,
    page: claimPage,
    pageSize: PAGE_SIZE,
  });

  const upsertTask = useUpsertRewardTask();
  const upsertReq = useUpsertTaskRequirement();
  const setStatus = useSetTaskStatus();
  const reviewClaim = useReviewTaskClaim();

  /** Reviewers: kyc.review / referrals.manage / finance.reconcile per server RBAC. */
  const canReview = has("kyc.review") || has("referrals.manage") || has("finance.reconcile");

  const transition = (task: AdminRewardTaskRow, to: TaskStatus) =>
    setStatus.mutate(
      { taskId: task.id, to, idempotencyKey: idempotencyKey("task") },
      {
        onSuccess: (r) => (r.ok ? toast.success(r.message) : toast.error(r.message)),
        onError: (e) => toast.error(e.message),
      },
    );

  const createTask = () => {
    const amount = Math.round(parseFloat(rewardNaira || "0") * 100);
    upsertTask.mutate(
      {
        taskId: null,
        idempotencyKey: idempotencyKey("task"),
        fields: {
          slug: slug.trim(),
          title: title.trim(),
          description: description.trim(),
          reward_amount_minor: amount,
          reward_currency: "NGN",
          claim_policy: claimPolicy,
        },
      },
      {
        onSuccess: (r) => {
          if (!r.ok || !r.taskId) {
            toast.error(r.message);
            return;
          }
          const taskId = r.taskId;
          toast.success(r.message, { description: `Task ${taskId}` });
          setCreateOpen(false);
          setSlug("");
          setTitle("");
          setDescription("");
          setRewardNaira("");
          // Attach the chosen first requirement so the draft is publishable.
          upsertReq.mutate(
            {
              taskId,
              idempotencyKey: idempotencyKey("req"),
              fields: { kind: reqKind, config: {}, required: true, position: 0 },
            },
            {
              onSuccess: (rr) => {
                if (!rr.ok) toast.error(`Draft created but requirement failed: ${rr.message}`);
              },
              onError: (e) => toast.error(`Draft created but requirement failed: ${e.message}`),
            },
          );
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const decideLeg = (decision: "APPROVE" | "REJECT") => {
    if (!review) return;
    reviewClaim.mutate(
      {
        claimId: review.claim.id,
        legId: review.legId,
        decision,
        reason: note.trim(),
        idempotencyKey: idempotencyKey("tcl"),
      },
      {
        onSuccess: (r) => {
          if (r.ok) toast.success(r.message);
          else toast.error(r.message);
          setReview(null);
          setNote("");
        },
        onError: (e) => toast.error(e.message),
      },
    );
  };

  const taskColumns: ColumnDef<AdminRewardTaskRow>[] = [
    {
      id: "title",
      header: "Task",
      sortable: true,
      cell: (t) => (
        <div>
          <p className="text-xs font-semibold">{t.title}</p>
          <p className="font-mono text-[11px] text-muted-foreground">
            {t.slug} · v{t.version}
          </p>
        </div>
      ),
    },
    {
      id: "rewardAmount",
      header: "Reward",
      sortable: true,
      align: "right",
      cell: (t) => (
        <span className="tabular font-semibold">
          {formatMoney(t.rewardAmount, t.rewardCurrency)}
        </span>
      ),
    },
    {
      id: "claimPolicy",
      header: "Policy",
      cell: (t) => (
        <Badge tone="info" className="text-[10px]">
          {t.claimPolicy === "ONE_TIME" ? "One-time" : "Repeatable"}
        </Badge>
      ),
    },
    {
      id: "requirements",
      header: "Requirements",
      cell: (t) => (
        <div className="flex max-w-52 flex-wrap gap-1">
          {t.requirements.length === 0 ? (
            <span className="text-tertiary">—</span>
          ) : (
            t.requirements.map((r) => (
              <Badge key={r.id} tone="neutral" className="text-[10px]">
                {r.kind.replace(/_/g, " ").toLowerCase()}
              </Badge>
            ))
          )}
        </div>
      ),
    },
    {
      id: "claims",
      header: "Claims",
      align: "right",
      cell: (t) => (
        <span className="tabular text-xs">
          {t.claims.rewarded} rewarded · {t.claims.pending} open · {t.claims.rejected} rejected
        </span>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (t) => <StatusCell status={t.status} />,
    },
    {
      id: "createdAt",
      header: "Created",
      sortable: true,
      cell: (t) => <span className="tabular text-xs">{formatDateTime(t.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: (t) => (
        <PermissionGate permission="referrals.manage" mode="disable">
          <span className="flex gap-1.5">
            {TRANSITIONS[t.status].map((to) => (
              <Button
                key={to}
                size="sm"
                variant={to === "ARCHIVED" ? "destructive" : "outline"}
                disabled={setStatus.isPending}
                onClick={() => transition(t, to)}
              >
                {TRANSITION_LABEL[to]}
              </Button>
            ))}
          </span>
        </PermissionGate>
      ),
    },
  ];

  const claimColumns: ColumnDef<AdminTaskClaimRow>[] = [
    {
      id: "userDisplayName",
      header: "User",
      sortable: true,
      cell: (c) => (
        <div>
          <p className="text-xs font-semibold">{c.userDisplayName}</p>
          <p className="text-[11px] text-muted-foreground">attempt {c.attemptNo}</p>
        </div>
      ),
    },
    {
      id: "taskTitle",
      header: "Task",
      sortable: true,
      cell: (c) => <span className="text-xs">{c.taskTitle}</span>,
    },
    {
      id: "legs",
      header: "Legs",
      cell: (c) => (
        <div className="flex max-w-64 flex-wrap gap-1">
          {c.legs.map((l) => (
            <Badge
              key={l.id}
              tone={
                l.status === "VERIFIED"
                  ? "success"
                  : l.status === "FAILED"
                    ? "error"
                    : l.status === "MANUAL_REVIEW"
                      ? "warning"
                      : "pending"
              }
              className="text-[10px]"
            >
              {l.kind.replace(/_/g, " ").toLowerCase()}
            </Badge>
          ))}
        </div>
      ),
    },
    {
      id: "status",
      header: "Status",
      sortable: true,
      cell: (c) => <StatusCell status={c.status} />,
    },
    {
      id: "claimDeadline",
      header: "Deadline",
      cell: (c) => (
        <span className="tabular text-xs">
          {c.claimDeadline ? formatDateTime(c.claimDeadline) : "—"}
        </span>
      ),
    },
    {
      id: "createdAt",
      header: "Claimed",
      sortable: true,
      cell: (c) => <span className="tabular text-xs">{formatDateTime(c.createdAt)}</span>,
    },
    {
      id: "actions",
      header: "",
      cell: (c) => {
        const manual = c.legs.find((l) => l.status === "MANUAL_REVIEW");
        if (!manual) return null;
        return canReview ? (
          <Button
            size="sm"
            variant="outline"
            onClick={() => {
              setReview({ claim: c, legId: manual.id });
              setNote("");
            }}
          >
            Review
          </Button>
        ) : null;
      },
    },
  ];

  return (
    <div>
      <PageHeader
        title="Task rewards"
        description="Reward-task catalogue and claim review. Publishing freezes the reward economics; claim decisions settle through the shared reward engine."
        actions={
          <PermissionGate permission="referrals.manage" mode="disable">
            <Button size="sm" onClick={() => setCreateOpen(true)}>
              New task
            </Button>
          </PermissionGate>
        }
      />

      <Tabs defaultValue="claims" className="mt-6">
        <TabsList className="mb-4">
          <TabsTrigger value="claims">Claims queue</TabsTrigger>
          <TabsTrigger value="tasks">Task catalogue</TabsTrigger>
        </TabsList>

        <TabsContent value="claims">
          <FilterBar
            query={claimQuery}
            onQueryChange={(v) => {
              setClaimQuery(v);
              setClaimPage(1);
            }}
            placeholder="Search user, task…"
          >
            <FilterSelect
              label="Claim status"
              value={claimStatus}
              onChange={(v) => {
                setClaimStatus(v);
                setClaimPage(1);
              }}
              options={[
                { value: "MANUAL_REVIEW", label: "Manual review" },
                { value: "ALL", label: "All statuses" },
                { value: "PENDING", label: "Pending" },
                { value: "VERIFYING", label: "Verifying" },
                { value: "REWARDED", label: "Rewarded" },
                { value: "REJECTED", label: "Rejected" },
                { value: "EXPIRED", label: "Expired" },
              ]}
            />
          </FilterBar>
          <DataTable
            columns={claimColumns}
            page={claims.data}
            isLoading={claims.isLoading}
            isError={claims.isError}
            onRetry={() => claims.refetch()}
            sort={claimSort}
            onSortChange={(s) => {
              setClaimSort(s);
              setClaimPage(1);
            }}
            onPageChange={setClaimPage}
            rowKey={(c) => c.id}
            emptyTitle="No claims"
            emptyCopy="Claims awaiting manual verification appear here."
          />
        </TabsContent>

        <TabsContent value="tasks">
          <FilterBar
            query={taskQuery}
            onQueryChange={(v) => {
              setTaskQuery(v);
              setTaskPage(1);
            }}
            placeholder="Search title, slug…"
          >
            <FilterSelect
              label="Task status"
              value={taskStatus}
              onChange={(v) => {
                setTaskStatus(v);
                setTaskPage(1);
              }}
              options={[
                { value: "ALL", label: "All statuses" },
                { value: "DRAFT", label: "Draft" },
                { value: "PUBLISHED", label: "Published" },
                { value: "PAUSED", label: "Paused" },
                { value: "ARCHIVED", label: "Archived" },
              ]}
            />
          </FilterBar>
          <DataTable
            columns={taskColumns}
            page={tasks.data}
            isLoading={tasks.isLoading}
            isError={tasks.isError}
            onRetry={() => tasks.refetch()}
            sort={taskSort}
            onSortChange={(s) => {
              setTaskSort(s);
              setTaskPage(1);
            }}
            onPageChange={setTaskPage}
            rowKey={(t) => t.id}
            emptyTitle="No tasks"
            emptyCopy="Create a reward task to get started."
          />
        </TabsContent>
      </Tabs>

      {/* New task */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New reward task</DialogTitle>
            <DialogDescription>
              Created as a draft — add requirements, then publish from the catalogue.
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-3">
            <Field label="Slug" htmlFor="task-slug">
              <Input
                id="task-slug"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                placeholder="join-community"
              />
            </Field>
            <Field label="Title" htmlFor="task-title">
              <Input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Join the RentBrown community"
              />
            </Field>
            <Field label="Description" htmlFor="task-desc">
              <Textarea
                id="task-desc"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="What the investor must do…"
              />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Reward (₦)" htmlFor="task-reward">
                <Input
                  id="task-reward"
                  inputMode="decimal"
                  value={rewardNaira}
                  onChange={(e) => setRewardNaira(e.target.value)}
                  placeholder="500"
                />
              </Field>
              <Field label="Claim policy" htmlFor="task-policy">
                <Select
                  id="task-policy"
                  value={claimPolicy}
                  onChange={(e) => setClaimPolicy(e.target.value as "ONE_TIME" | "REPEATABLE")}
                >
                  <option value="ONE_TIME">One-time</option>
                  <option value="REPEATABLE">Repeatable</option>
                </Select>
              </Field>
            </div>
            <Field label="First requirement" htmlFor="task-req">
              <Select id="task-req" value={reqKind} onChange={(e) => setReqKind(e.target.value)}>
                {REQUIREMENT_KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={slug.trim().length < 3 || title.trim().length < 3 || upsertTask.isPending}
              onClick={createTask}
            >
              {upsertTask.isPending ? "Creating…" : "Create draft"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Leg review */}
      <Dialog open={review !== null} onOpenChange={(o) => !o && setReview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Review claim leg</DialogTitle>
            <DialogDescription>
              {review ? `${review.claim.taskTitle} — ${review.claim.userDisplayName}` : ""}
            </DialogDescription>
          </DialogHeader>
          {review ? (
            <div className="flex flex-col gap-3">
              <div className="rounded-md border border-border p-3 text-xs">
                {(() => {
                  const leg = review.claim.legs.find((l) => l.id === review.legId);
                  return (
                    <>
                      <p className="font-semibold">{leg?.kind.replace(/_/g, " ").toLowerCase()}</p>
                      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[11px] text-muted-foreground">
                        {JSON.stringify(leg?.detail ?? review.claim.evidence, null, 2)}
                      </pre>
                    </>
                  );
                })()}
              </div>
              <Field label="Review note" htmlFor="leg-note">
                <Textarea
                  id="leg-note"
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  placeholder="e.g. Membership confirmed in the group roster."
                />
              </Field>
            </div>
          ) : null}
          <DialogFooter>
            <Button variant="ghost" onClick={() => setReview(null)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              disabled={reviewClaim.isPending}
              onClick={() => decideLeg("REJECT")}
            >
              Reject leg
            </Button>
            <Button disabled={reviewClaim.isPending} onClick={() => decideLeg("APPROVE")}>
              {reviewClaim.isPending ? "Recording…" : "Approve leg"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

export default function TasksPage() {
  return (
    <PermissionGate permission="referrals.read" mode="page">
      <TasksView />
    </PermissionGate>
  );
}
