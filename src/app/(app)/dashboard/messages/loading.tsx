import { Skeleton } from "@/components/ui/skeleton"

function ReminderCardSkeleton() {
  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border p-5 sm:flex-row sm:items-center sm:justify-between">
      <div className="min-w-0 flex-1 space-y-2">
        <Skeleton className="h-4 w-32" />
        <div className="flex items-center gap-2">
          <Skeleton className="h-5 w-20 rounded-full" />
          <Skeleton className="h-4 w-24" />
        </div>
        <Skeleton className="h-4 w-16 rounded-full" />
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <Skeleton className="h-8 w-20" />
        <Skeleton className="size-8 rounded-md" />
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <div className="mx-auto w-full max-w-[1600px] space-y-8 p-6 md:p-10">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <Skeleton className="h-8 w-56" />
        <Skeleton className="h-9 w-48 rounded-full" />
      </div>

      {/* Two-column grid */}
      <div className="grid grid-cols-1 gap-8 xl:grid-cols-2">
        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-28" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
          <Skeleton className="h-10 w-full" />
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <ReminderCardSkeleton key={i} />
            ))}
          </div>
        </div>

        <div className="space-y-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-5 w-40" />
            <Skeleton className="h-5 w-6 rounded-full" />
          </div>
          <div className="space-y-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <ReminderCardSkeleton key={i} />
            ))}
          </div>
        </div>
      </div>

      {/* Archive header */}
      <div className="flex w-full items-center justify-between">
        <div className="flex items-center gap-3">
          <Skeleton className="h-5 w-20" />
          <Skeleton className="h-5 w-6 rounded-full" />
        </div>
        <Skeleton className="size-5 rounded" />
      </div>

      {/* Info banner */}
      <Skeleton className="h-14 w-full rounded-lg" />
    </div>
  )
}