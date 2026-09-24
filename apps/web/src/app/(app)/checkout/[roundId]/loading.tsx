import { Skeleton, SkeletonCard } from "@rentbrown/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-8">
      <Skeleton className="h-7 w-40" />
      <Skeleton className="h-10 w-80 max-w-full" />
      <div className="grid gap-6 lg:grid-cols-[1fr_.75fr]">
        <div className="flex flex-col gap-6">
          <SkeletonCard className="h-40" />
          <SkeletonCard className="h-56" />
          <SkeletonCard className="h-32" />
        </div>
        <SkeletonCard className="h-96" />
      </div>
    </div>
  );
}
