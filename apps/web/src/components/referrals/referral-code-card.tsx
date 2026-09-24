"use client";

import { Copy, Gift, Share2 } from "lucide-react";
import { Button, Divider, toast } from "@rentbrown/ui";
import type { ReferralSummary } from "@rentbrown/types";

export function ReferralCodeCard({ summary }: { summary: ReferralSummary }) {
  const copy = (text: string, label: string) => {
    void navigator.clipboard?.writeText(text);
    toast.success(`${label} copied`);
  };
  const share = async () => {
    if (typeof navigator !== "undefined" && "share" in navigator) {
      try {
        await navigator.share({ title: "Join me on RentBrown", text: `Use my referral code ${summary.code}`, url: summary.shareUrl });
        return;
      } catch {
        /* user dismissed */
      }
    }
    copy(summary.shareUrl, "Share link");
  };

  return (
    <div className="financial-card p-5 sm:p-6">
      <div className="flex items-center gap-2.5">
        <span className="flex size-9 items-center justify-center rounded-md bg-secondary-soft text-primary">
          <Gift className="size-4.5" aria-hidden />
        </span>
        <h2 className="text-base font-bold text-foreground">Your referral code</h2>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 rounded-md bg-muted px-4 py-3">
        <span className="tabular text-lg font-extrabold tracking-widest text-foreground">{summary.code}</span>
        <Button variant="outline" size="sm" onClick={() => copy(summary.code, "Code")}>
          <Copy className="size-3.5" aria-hidden /> Copy
        </Button>
      </div>
      <Button variant="outline" className="mt-3 w-full" onClick={() => void share()}>
        <Share2 className="size-4" aria-hidden /> Share link
      </Button>

      <Divider className="my-5" />
      <ol className="flex flex-col gap-3">
        {summary.qualificationSteps.map((step, i) => (
          <li key={step} className="flex items-center gap-3">
            <span className="eyebrow flex size-7 shrink-0 items-center justify-center rounded-full bg-accent text-primary">
              {i + 1}
            </span>
            <span className="text-sm font-semibold text-foreground">{step}</span>
          </li>
        ))}
      </ol>
      <Divider className="my-5" />
      <ul className="flex list-disc flex-col gap-2 pl-5 text-xs text-muted-foreground">
        {summary.rules.map((rule) => (
          <li key={rule}>{rule}</li>
        ))}
      </ul>
    </div>
  );
}
