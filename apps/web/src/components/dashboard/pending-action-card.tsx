import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { cn } from "@rentbrown/ui";
import type { NotificationLink, PendingAction } from "@rentbrown/types";

export function actionHref(link?: NotificationLink): string | null {
  if (!link) return null;
  switch (link.kind) {
    case "investment":
      return `/portfolio/${link.id}`;
    case "withdrawal":
      return `/wallet/withdrawals/${link.id}`;
    case "wallet":
      return "/wallet";
    case "opportunity":
      return `/opportunities/${link.slug}`;
    case "referrals":
      return "/referrals";
    case "kyc":
      return "/account/kyc";
    case "security":
      return "/account/security";
    default:
      return null;
  }
}

const toneBorder: Record<PendingAction["tone"], string> = {
  success: "border-l-success bg-success-soft/50",
  warning: "border-l-warning-dot bg-warning-soft/50",
  error: "border-l-error-dot bg-error-soft/50",
  info: "border-l-info-dot bg-info-soft/50",
  pending: "border-l-pending-dot bg-pending-soft/50",
  neutral: "border-l-neutral-dot bg-neutral-soft/50",
};

export function PendingActionCard({ action }: { action: PendingAction }) {
  const href = actionHref(action.link);
  const inner = (
    <>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-bold text-foreground">{action.title}</p>
        <p className="mt-1 text-xs leading-relaxed text-muted-foreground">{action.body}</p>
      </div>
      {href ? <ChevronRight className="size-4 shrink-0 text-tertiary" aria-hidden /> : null}
    </>
  );
  const classes = cn("flex items-center gap-3 rounded-md border-l-[3px] p-4", toneBorder[action.tone]);
  return href ? (
    <Link href={href} className={cn(classes, "transition-shadow hover:shadow-xs focus-visible:outline-2 focus-visible:outline-ring")}>
      {inner}
    </Link>
  ) : (
    <div className={classes}>{inner}</div>
  );
}
