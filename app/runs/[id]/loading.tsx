import { Skeleton } from "@/components/ui/skeleton";

export default function RunDetailLoading() {
  return (
    <main className="mx-auto flex max-w-6xl flex-col gap-8 px-6 py-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="flex flex-col gap-2">
          <Skeleton className="h-8 w-72" />
          <Skeleton className="h-4 w-56" />
        </div>
        <Skeleton className="h-9 w-40" />
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
        <Skeleton className="h-20 w-full" />
      </div>

      <Skeleton className="h-56 w-full" />

      <div className="grid gap-4 lg:grid-cols-2">
        <Skeleton className="h-72 w-full" />
        <Skeleton className="h-72 w-full" />
      </div>

      <Skeleton className="h-48 w-full" />
    </main>
  );
}
