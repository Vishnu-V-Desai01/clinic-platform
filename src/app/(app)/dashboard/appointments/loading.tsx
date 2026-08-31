import { Skeleton } from "@/components/ui/skeleton"

export default function Loading() {
  return (
    <div className="flex flex-col gap-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <Skeleton className="h-8 w-36" />
        <Skeleton className="h-9 w-40" />
      </div>

      {/* Toolbar */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
          <Skeleton className="h-9 w-full sm:w-72" />
          <Skeleton className="h-9 w-full sm:w-[160px]" />
        </div>
        <Skeleton className="h-9 w-full sm:w-64" />
      </div>

      {/* Table card */}
      <div className="rounded-xl border border-border bg-card shadow-sm">
        <div className="border-b border-border px-4 py-3">
          <div className="grid grid-cols-6 gap-4">
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-14" />
            <Skeleton className="ml-auto h-4 w-20" />
          </div>
        </div>
        <div className="divide-y divide-border">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="grid grid-cols-6 items-center gap-4 px-4 py-3.5">
              <div className="flex items-center gap-3">
                <Skeleton className="size-9 shrink-0 rounded-full" />
                <div className="flex flex-col gap-1.5">
                  <Skeleton className="h-4 w-28" />
                  <Skeleton className="h-3 w-16" />
                </div>
              </div>
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-4 w-14" />
              <Skeleton className="h-5 w-20 rounded-full" />
              <div className="flex items-center justify-end gap-1.5">
                <Skeleton className="h-8 w-14" />
                <Skeleton className="h-8 w-24" />
                <Skeleton className="size-8 rounded-md" />
              </div>
            </div>
          ))}
        </div>

        {/* Pagination footer */}
        <div className="flex flex-col gap-3 border-t border-border px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <Skeleton className="h-4 w-36" />
          <div className="flex items-center gap-1">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-8 w-16" />
          </div>
        </div>
      </div>
    </div>
  )
}