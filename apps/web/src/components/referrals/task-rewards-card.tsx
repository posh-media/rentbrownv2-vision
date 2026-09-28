"use client";

import * as React from "react";
import type { RewardTask } from "@rentbrown/types";
import { Badge, Button, MoneyFigure, toast } from "@rentbrown/ui";
import { CheckCircle2, ClipboardList, Loader2 } from "lucide-react";
import { formatMoney } from "@rentbrown/utils";

import { useClaimRewardTask, useMyTaskClaims, useRewardTasks } from "../../lib/data/hooks";

const CLAIM_LABEL: Record<string, string> = {
  PENDING: "Pending",
  VERIFYING: "Verifying",
  MANUAL_REVIEW: "Under review",
  REWARDED: "Rewarded",
  REJECTED: "Not approved",
  EXPIRED: "Expired — retry",
};

function TaskRow({ task }: { task: RewardTask }) {
  const claim = useClaimRewardTask();
  const my = task.myClaim;
  const claimed = my && my.status !== "EXPIRED" && my.status !== "REJECTED";
  const rewarded = my?.status === "REWARDED";

  return (
    <div className="flex items-start justify-between gap-4 py-4">
      <div className="min-w-0">
        <div className="flex items-center gap-2">
          <p className="text-sm font-bold text-foreground">{task.title}</p>
          <MoneyFigure amount={task.rewardAmount} currency={task.rewardCurrency} size="xs" />
        </div>
        <p className="mt-1 text-xs text-muted-foreground">{task.description}</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {task.requirements.map((r) => (
            <Badge key={r.id} tone="neutral" className="text-[10px]">
              {r.kind.replace(/_/g, " ").toLowerCase()}
            </Badge>
          ))}
        </div>
      </div>
      <div className="shrink-0">
        {rewarded ? (
          <Badge tone="success" className="text-[10px]">
            <CheckCircle2 className="size-3" aria-hidden /> {CLAIM_LABEL[my!.status]}
          </Badge>
        ) : claimed ? (
          <Badge tone="pending" className="text-[10px]">
            {CLAIM_LABEL[my!.status] ?? my!.status}
          </Badge>
        ) : (
          <Button
            size="sm"
            variant="outline"
            disabled={claim.isPending}
            onClick={() =>
              claim.mutate(
                { taskId: task.id, idempotencyKey: crypto.randomUUID() },
                {
                  onSuccess: (r) =>
                    toast.success(
                      r.pendingLinks.length > 0
                        ? `Claim started — link ${r.pendingLinks.join(", ").toLowerCase()} to finish verification`
                        : `Claim ${r.status.toLowerCase().replace(/_/g, " ")}`,
                    ),
                  onError: (e) =>
                    toast.error(e instanceof Error ? e.message : "Couldn't start the claim."),
                },
              )
            }
          >
            {claim.isPending ? <Loader2 className="size-3.5 animate-spin" aria-hidden /> : null}
            {my?.status === "EXPIRED" || my?.status === "REJECTED"
              ? "Try again"
              : `Earn ${formatMoney(task.rewardAmount, task.rewardCurrency)}`}
          </Button>
        )}
      </div>
    </div>
  );
}

/** Published task rewards with the caller's claim state (Phase 9B). */
export function TaskRewardsCard() {
  const tasks = useRewardTasks();
  const claims = useMyTaskClaims();
  const items = tasks.data ?? [];
  const open =
    claims.data?.filter((c) => ["PENDING", "VERIFYING", "MANUAL_REVIEW"].includes(c.status)) ?? [];

  return (
    <div className="financial-card p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-base font-bold text-foreground">Task rewards</h2>
        {open.length > 0 ? (
          <Badge tone="pending" className="text-[10px]">
            {open.length} in progress
          </Badge>
        ) : null}
      </div>
      {tasks.isPending ? (
        <p className="py-4 text-sm text-muted-foreground">Loading tasks…</p>
      ) : items.length === 0 ? (
        <div className="flex items-center gap-3 py-4 text-sm text-muted-foreground">
          <ClipboardList className="size-4" aria-hidden />
          No tasks available right now — check back soon.
        </div>
      ) : (
        <div className="divide-y divide-border">
          {items.map((t) => (
            <TaskRow key={t.id} task={t} />
          ))}
        </div>
      )}
    </div>
  );
}
