'use client'

import { useState, useTransition } from 'react'
import { createClinicOnboardingAction } from '../actions'
import ClinicOnboardingScreen from './ClinicOnboardingScreen'

export function CreateClinicForm() {
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(clinicName: string) {
    setError(null)
    startTransition(async () => {
      const result = await createClinicOnboardingAction(clinicName)
      if (result && !result.success) {
        setError(result.error)
      }
      // On success, createClinicOnboardingAction redirects server-side.
    })
  }

  return (
    <ClinicOnboardingScreen onSubmit={handleSubmit} isLoading={isPending} error={error} />
  )
}