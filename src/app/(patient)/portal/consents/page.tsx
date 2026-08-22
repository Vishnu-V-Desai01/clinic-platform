'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getMyPortalStatus } from '@/features/portal/actions'
import { listMyFamilyPatientCards } from '@/features/access-grants/actions'
import { getMyAllConsents, grantConsentAsPatient, revokeConsentAsPatient } from '@/features/consent/actions'
import PatientConsentsManagement from '@/components/patient-consents-management'
import type { PatientConsent } from '@/features/consent/types'

interface PatientCardWithConsents {
  id: string
  firstName: string
  lastName: string
  clinicName: string
  consents: Array<{
    patientId: string
    purpose: string
    isActive: boolean
  }>
}

export default function ConsentsPage() {
  const router = useRouter()
  const [cardsWithConsents, setCardsWithConsents] = useState<PatientCardWithConsents[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadConsents = async () => {
      try {
        const statusResult = await getMyPortalStatus()
        if (!statusResult.success) {
          setError('Failed to load portal status')
          return
        }

        // Onboarding gate: checked here (not in the shared layout) to
        // avoid a redirect loop on /portal/welcome itself.
        if (!statusResult.data.isOnboarded) {
          router.push('/portal/welcome')
          return
        }

        const cardsResult = await listMyFamilyPatientCards()
        if (!cardsResult.success) {
          setError('Failed to load patient cards')
          return
        }

        const consentsResult = await getMyAllConsents()
        if (!consentsResult.success) {
          setError('Failed to load consent preferences')
          return
        }

        const consents = consentsResult.data as PatientConsent[]

        const mapped: PatientCardWithConsents[] = cardsResult.data.map((card) => ({
          id: card.id,
          firstName: card.firstName,
          lastName: card.lastName,
          clinicName: card.clinicName,
          consents: [
            'data_processing',
            'appointment_reminders',
            'medication_reminders',
            'whatsapp_notifications',
            'care_plan_access',
            'record_sharing',
          ].map((purpose) => {
            const consent = consents.find(
              (c) => c.patient_id === card.id && c.purpose === purpose,
            )
            return {
              patientId: card.id,
              purpose,
              isActive: consent?.is_active ?? false,
            }
          }),
        }))

        setCardsWithConsents(mapped)
      } catch (err) {
        console.error('Error loading consents:', err)
        setError('An error occurred while loading consent settings')
      } finally {
        setLoading(false)
      }
    }

    loadConsents()
  }, [router])

  const handleToggleConsent = async (
    patientId: string,
    purpose: string,
    newState: boolean,
  ): Promise<void> => {
    try {
      if (newState) {
        const result = await grantConsentAsPatient({
          patient_id: patientId,
          purpose,
        })
        if (!result.success) {
          throw new Error(result.error)
        }
      } else {
        const allConsentsResult = await getMyAllConsents()
        if (!allConsentsResult.success) {
          throw new Error('Failed to fetch consent ID')
        }

        const consent = allConsentsResult.data.find(
          (c) => c.patient_id === patientId && c.purpose === purpose,
        )
        if (!consent) {
          throw new Error('Consent record not found')
        }

        const result = await revokeConsentAsPatient({
          consent_id: consent.id,
        })
        if (!result.success) {
          throw new Error(result.error)
        }
      }

      const consentsResult = await getMyAllConsents()
      if (!consentsResult.success) {
        throw new Error('Failed to reload consent settings')
      }

      const consents = consentsResult.data as PatientConsent[]
      setCardsWithConsents((prev) =>
        prev.map((card) => ({
          ...card,
          consents: card.consents.map((c) => {
            const updated = consents.find(
              (con) => con.patient_id === card.id && con.purpose === c.purpose,
            )
            return {
              ...c,
              isActive: updated?.is_active ?? false,
            }
          }),
        })),
      )
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to update consent'
      throw new Error(errorMessage)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading consent settings…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <p className="text-red-600 font-medium">{error}</p>
          <p className="mt-2 text-sm text-muted-foreground">Please try refreshing the page.</p>
        </div>
      </div>
    )
  }

  return (
    <PatientConsentsManagement
      cardsWithConsents={cardsWithConsents}
      onToggleConsent={handleToggleConsent}
    />
  )
}