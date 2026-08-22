'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getMyPortalStatus } from '@/features/portal/actions'
import {
  listMyFamilyCardsWithDoctor,
  submitAppointmentRequest,
} from '@/features/appointment-requests/actions'
import PatientAppointmentRequestForm from '@/components/patient-appointment-request-form'
import type { FamilyCardWithDoctor } from '@/features/appointment-requests/types'

export default function RequestAppointmentPage() {
  const router = useRouter()
  const [familyCards, setFamilyCards] = useState<FamilyCardWithDoctor[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadCards = async () => {
      try {
        const statusResult = await getMyPortalStatus()
        if (!statusResult.success) {
          setError('Failed to load portal status')
          return
        }

        if (!statusResult.data.isOnboarded) {
          router.push('/portal/welcome')
          return
        }

        const result = await listMyFamilyCardsWithDoctor()
        if (!result.success) {
          setError('Failed to load your clinic enrollments')
          return
        }

        setFamilyCards(result.data)
      } catch (err) {
        console.error('Error loading family cards:', err)
        setError('An error occurred while loading your clinic enrollments')
      } finally {
        setLoading(false)
      }
    }

    loadCards()
  }, [router])

  const handleSubmit = async (
    patientId: string,
    preferredDate: string,
    preferredTimeSlot?: string,
    reason?: string,
  ): Promise<void> => {
    const result = await submitAppointmentRequest({
      patientId,
      preferredDate,
      preferredTimeSlot,
      reason,
    })

    if (!result.success) {
      throw new Error(result.error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading your clinics…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <p className="text-red-600 font-medium">{error}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            Please try refreshing the page.
          </p>
        </div>
      </div>
    )
  }

  if (familyCards.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="text-center py-12">
          <p className="text-muted-foreground mb-4">
            You haven&apos;t registered at any clinics yet.
          </p>
          <p className="text-sm text-muted-foreground">
            Once your clinic registers you, you&apos;ll be able to request appointments here.
          </p>
        </div>
      </div>
    )
  }

  return (
    <PatientAppointmentRequestForm
      familyCards={familyCards}
      onSubmit={handleSubmit}
    />
  )
}