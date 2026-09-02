'use client'

import { useState, useTransition } from 'react'
import { createClinicOnboardingAction } from '../actions'
import ClinicOnboardingScreen from './ClinicOnboardingScreen'
import type { CreateClinicInput } from '../schema'

interface CreateClinicFormProps {
  defaultFullName?: string
}

export function CreateClinicForm({ defaultFullName = '' }: CreateClinicFormProps) {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(data: CreateClinicInput) {
    setError(null)
    startTransition(async () => {
      const result = await createClinicOnboardingAction(data)
      if (result && !result.success) {
        setError(result.error)
      }
      // On success, createClinicOnboardingAction redirects server-side.
    })
  }

  return (
    <ClinicOnboardingScreen
      onSubmit={handleSubmit}
      isLoading={isPending}
      error={error}
      defaultFullName={defaultFullName}
    />
  )
}