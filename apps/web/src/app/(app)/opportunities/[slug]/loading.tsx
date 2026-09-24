import { Skeleton, SkeletonCard, SkeletonText } from "@rentbrown/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-4 w-40" />
      <div className="grid gap-8 lg:grid-cols-[1.35fr_.65fr]">
        <div className="flex flex-col gap-8">
          <Skeleton className="aspect-[16/9] w-full rounded-xl" />
          <SkeletonText lines={2} />
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-64" />
        </div>
        <SkeletonCard className="h-96" />
      </div>
    </div>
  );
}
