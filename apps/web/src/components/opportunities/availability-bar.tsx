import { ProgressBar } from "@rentbrown/ui";
import type { InvestmentRound } from "@rentbrown/types";

export function AvailabilityBar({ round }: { round: InvestmentRound }) {
  const tone =
    round.status === "SOLD_OUT" ? "neutral" : round.allocatedPct >= 80 ? "warning" : "success";
  return (
    <ProgressBar value={round.allocatedPct} tone={tone} label="Capacity allocated" />
  );
}
