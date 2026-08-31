import { Skeleton } from "@/components/ui/skeleton"

function CardSkeleton({ rows = 4 }: { rows?: number }) {
  return (
    <div className="rounded-xl border border-border">
      <div className="px-4 py-4">
        <Skeleton className="h-5 w-40" />
      </div>
      <div className="flex flex-col gap-3 px-4 pb-4">
        {Array.from({ length: rows }).map((_, i) => (
          <Skeleton key={i} className="h-10 w-full" />
        ))}
      </div>
    </div>
  )
}

export default function Loading() {
  return (
    <main className="w-full bg-background p-4 sm:p-6">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 lg:grid-cols-3">
        {/* Main column */}
        <div className="flex min-w-0 flex-col gap-4 lg:col-span-2">
          <CardSkeleton rows={4} />
          <CardSkeleton rows={5} />
          <CardSkeleton rows={3} />
        </div>

        {/* Sidebar */}
        <aside className="flex min-w-0 flex-col gap-4">
          <CardSkeleton rows={3} />
          <CardSkeleton rows={3} />
          <div className="rounded-xl border border-border p-4">
            <Skeleton className="mb-2 size-5 rounded" />
            <Skeleton className="mb-1 h-4 w-32" />
            <Skeleton className="h-8 w-16" />
          </div>
        </aside>
      </div>
    </main>
  )
}