# Screen Recipe

The standard pattern for every feature in this project. Follow this exactly in each feature chat.

## Folder structure

Each feature owns two areas:

```
src/features/[name]/           ← logic layer (no UI)
  actions.ts                   ← server actions: create, update, delete
  queries.ts                   ← data-fetching functions (server-only)
  types.ts                     ← TypeScript types for this feature

src/app/(app)/dashboard/[name]/  ← routing layer (UI)
  page.tsx                     ← list/main page (async server component)
  [id]/
    page.tsx                   ← detail page (async server component)
```

Feature-specific UI components that are too small to be shared go in
`src/features/[name]/components/`.

## Data fetching

Pages are async server components. Fetch at the top, pass down as props.

```tsx
// src/app/(app)/dashboard/patients/page.tsx
import { getOrCreateProfile } from '@/lib/supabase/profile'
import { getPatients } from '@/features/patients/queries'

export default async function PatientsPage() {
  const profile = await getOrCreateProfile()
  if (!profile) redirect('/sign-in')

  const patients = await getPatients(profile.clinic_id)

  return <PatientList patients={patients} />
}
```

Rules:
- Never fetch data inside client components.
- Always pass `profile.clinic_id` to query functions (RLS enforces it anyway, but it's explicit).
- Use `requireRole('doctor', 'staff')` at the top of pages that patients must not access.

## Query functions

```typescript
// src/features/patients/queries.ts
import { createServerSupabaseClient } from '@/lib/supabase/server'

export async function getPatients(clinicId: string) {
  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase
    .from('patients')
    .select('*')
    .eq('clinic_id', clinicId)
    .order('created_at', { ascending: false })

  if (error) throw new Error(error.message)
  return data
}
```

## Server actions (mutations)

```typescript
// src/features/patients/actions.ts
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import { getOrCreateProfile } from '@/lib/supabase/profile'

const CreatePatientSchema = z.object({
  full_name: z.string().min(1),
  phone: z.string().min(1),
})

export async function createPatient(formData: FormData) {
  const profile = await getOrCreateProfile()
  if (!profile) return { error: 'Not authenticated' }

  const parsed = CreatePatientSchema.safeParse(Object.fromEntries(formData))
  if (!parsed.success) return { error: 'Invalid input' }

  const supabase = createServerSupabaseClient()
  const { error } = await supabase.from('patients').insert({
    ...parsed.data,
    clinic_id: profile.clinic_id,
  })

  if (error) return { error: error.message }

  revalidatePath('/dashboard/patients')
  return { success: true }
}
```

Rules:
- Always validate with Zod before touching the database.
- Always verify the profile exists before acting.
- Always call `revalidatePath()` after a successful mutation.
- Return `{ success: true }` or `{ error: string }` — never throw from actions.

## v0.dev integration

When Vishnu provides a v0.dev-generated file for a feature screen:

1. **Read the file** — identify mock data arrays, hardcoded strings, and event handlers.
2. **Extract the server layer** — move data fetching into `queries.ts`, replace mock arrays with real query results passed as props.
3. **Keep client components client** — anything with `useState`, `useEffect`, event handlers, or form state stays as `'use client'`. Move it to `src/features/[name]/components/`.
4. **Replace mock handlers** — form `onSubmit` handlers become calls to server actions via `useActionState` or `useTransition`.
5. **Wire the page** — the page (`page.tsx`) is a server component that fetches data and passes it to the client components.

## Shared components (use in every feature page)

| Component | Import | When to use |
|-----------|--------|-------------|
| `PageHeader` | `@/components/page-header` | Top of every page — title + optional action button |
| `EmptyState` | `@/components/empty-state` | When a list or table has zero rows |
| `loading.tsx` | automatic | No action needed — Next.js shows it during navigation |
| `error.tsx` | automatic | No action needed — Next.js shows it on unhandled errors |

## Role gating

**Full page restriction** — redirects unauthorized roles away:
```tsx
const profile = await requireRole('doctor', 'staff')
```

**Conditional UI within a page** — hides/shows sections:
```tsx
{hasRole(profile, 'doctor') && <DoctorOnlySection />}
```