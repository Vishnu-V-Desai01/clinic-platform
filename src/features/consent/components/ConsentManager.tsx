'use client'

import { useState, useTransition } from 'react'
import { grantConsent, revokeConsent } from '../actions'
import ConsentPanel from './ConsentPanel'
import type { ConsentRecord } from './ConsentPanel'
import type { ConsentPurpose } from '../types'

interface ConsentManagerProps {
  consents:  ConsentRecord[]
  patientId: string
}

export default function ConsentManager({ consents, patientId }: ConsentManagerProps) {
  const [isPending, startTransition] = useTransition()
  const [errorMsg, setErrorMsg]      = useState<string | null>(null)

  function handleGrant(purpose: ConsentPurpose) {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await grantConsent({ patient_id: patientId, purpose })
      if (!result.success) setErrorMsg(result.error)
    })
  }

  function handleRevoke(consentId: string) {
    setErrorMsg(null)
    startTransition(async () => {
      const result = await revokeConsent({ consent_id: consentId }, patientId)
      if (!result.success) setErrorMsg(result.error)
    })
  }

  return (
    <div className="space-y-2">
      {errorMsg && (
        <p
          className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive"
          role="alert"
        >
          {errorMsg}
        </p>
      )}
      <ConsentPanel
        consents={consents}
        patientId={patientId}
        onGrant={handleGrant}
        onRevoke={handleRevoke}
        isLoading={isPending}
      />
    </div>
  )
}