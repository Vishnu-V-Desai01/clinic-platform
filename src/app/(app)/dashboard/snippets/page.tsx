// src/app/(app)/dashboard/snippets/page.tsx

import SnippetsManager from '@/features/clinical-snippets/components/SnippetsManager'

export default function SnippetsPage() {
  return (
    <div className="mx-auto w-full max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="mb-6">
        <h1 className="text-2xl font-semibold tracking-tight text-foreground">My Snippets</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Saved blocks of text you can insert into clinical notes during a visit. Only visible to you.
        </p>
      </div>
      <SnippetsManager />
    </div>
  )
}