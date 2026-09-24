import { SkeletonCard } from "@rentbrown/ui";

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      <SkeletonCard className="h-48" />
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </div>
      <div className="grid gap-6 lg:grid-cols-[1.45fr_.55fr]">
        <SkeletonCard className="h-64" />
        <SkeletonCard className="h-64" />
      </div>
    </div>
  );
}
