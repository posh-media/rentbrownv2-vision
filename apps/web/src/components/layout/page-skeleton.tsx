import { Skeleton, SkeletonCard } from "@rentbrown/ui";

/** Generic route loading state: header skeleton + stacked cards. */
export function PageSkeleton({ cards = 3, tall = false }: { cards?: number; tall?: boolean }) {
  return (
    <div className="flex flex-col gap-6" aria-hidden>
      <div>
        <Skeleton className="h-3 w-32" />
        <Skeleton className="mt-2 h-8 w-64" />
        <Skeleton className="mt-2 h-4 w-96 max-w-full" />
      </div>
      {Array.from({ length: cards }, (_, i) => (
        <SkeletonCard key={i} className={tall && i === 0 ? "h-72" : "h-40"} />
      ))}
    </div>
  );
}
