import Link from "next/link";
import { Info } from "lucide-react";
import {
  Button,
  Divider,
  MoneyFigure,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@rentbrown/ui";
import type { WalletSummary } from "@rentbrown/types";
import { formatDateTime } from "@rentbrown/utils";

const balanceRows: Array<{
  key: "RESERVED" | "BONUS" | "PENDING";
  label: string;
  hint: string;
}> = [
  { key: "RESERVED", label: "Reserved", hint: "Committed to an in-flight request, e.g. a withdrawal under review." },
  { key: "BONUS", label: "Bonus", hint: "Qualified referral rewards. Invest or transfer to available." },
  { key: "PENDING", label: "Pending", hint: "Incoming funds awaiting bank confirmation." },
];

export function WalletBalanceCard({ wallet }: { wallet: WalletSummary }) {
  return (
    <div className="financial-card overflow-hidden bg-gradient-to-br from-card to-[var(--brand-50,#fbf4ec)]">
      <div className="grid gap-6 p-5 sm:p-7 lg:grid-cols-[1fr_.75fr] lg:items-center">
        <div>
          <p className="eyebrow text-muted-foreground">Available balance</p>
          <MoneyFigure amount={wallet.balances.AVAILABLE} currency={wallet.currency} size="xl" className="mt-3" />
          <p className="mt-2 text-xs text-muted-foreground">
            Ready to invest or withdraw · updated {formatDateTime(wallet.updatedAt)}
          </p>
          <div className="mt-5 flex flex-wrap gap-2">
            <Button variant="outline" asChild>
              <Link href="/wallet/withdraw">Withdraw</Link>
            </Button>
            <Button asChild>
              <Link href="/wallet/deposit">Deposit</Link>
            </Button>
          </div>
        </div>
        <div className="glass rounded-xl p-5">
          <TooltipProvider>
            {balanceRows.map((row) => (
              <div key={row.key} className="flex items-center justify-between py-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  {row.label}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <button type="button" aria-label={`About ${row.label}`} className="text-tertiary hover:text-foreground focus-visible:outline-2 focus-visible:outline-ring">
                        <Info className="size-3.5" />
                      </button>
                    </TooltipTrigger>
                    <TooltipContent className="max-w-56">{row.hint}</TooltipContent>
                  </Tooltip>
                </span>
                <MoneyFigure amount={wallet.balances[row.key]} currency={wallet.currency} size="sm" />
              </div>
            ))}
          </TooltipProvider>
          <Divider className="my-2" />
          <div className="flex items-center justify-between py-1">
            <span className="text-xs font-bold text-foreground">Total in wallet</span>
            <MoneyFigure amount={wallet.total} currency={wallet.currency} size="sm" />
          </div>
        </div>
      </div>
    </div>
  );
}
