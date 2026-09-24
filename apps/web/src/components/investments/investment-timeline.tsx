import { Timeline } from "@rentbrown/ui";
import type { InvestmentTimelineEvent } from "@rentbrown/types";

export function InvestmentTimeline({ events }: { events: InvestmentTimelineEvent[] }) {
  return <Timeline items={events} />;
}
