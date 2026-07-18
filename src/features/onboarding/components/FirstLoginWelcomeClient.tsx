'use client'

import { useTransition } from 'react'
import FirstLoginWelcome from './FirstLoginWelcome'
import { completeAdminOnboardingAction } from '../actions'

export function FirstLoginWelcomeClient({ doctorName }: { doctorName: string }) {
  const [, startTransition] = useTransition()

  function handleGoToAdmin() {
    startTransition(() => {
      completeAdminOnboardingAction('admin')
    })
  }

  function handleGoToDoctor() {
    startTransition(() => {
      completeAdminOnboardingAction('doctor')
    })
  }

  return (
    <FirstLoginWelcome
      doctorName={doctorName}
      onGoToAdmin={handleGoToAdmin}
      onGoToDoctor={handleGoToDoctor}
    />
  )
}