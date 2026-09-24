import { Skeleton } from "@rentbrown/ui";

import { OpportunityGridSkeleton } from "../../../components/opportunities/opportunity-grid";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <Skeleton className="h-10 w-64" />
      <Skeleton className="h-4 w-96 max-w-full" />
      <Skeleton className="h-11 w-full" />
      <OpportunityGridSkeleton />
    </div>
  );
}
