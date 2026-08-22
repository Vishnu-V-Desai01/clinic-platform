'use client'

import { useRouter, useParams } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getMyPortalStatus, getPatientCardDetail } from '@/features/portal/actions'
import PatientCardDetail from '@/components/patient-card-detail'
import type { PortalCardDetail } from '@/features/portal/types'

export default function CardDetailPage() {
  const router = useRouter()
  const params = useParams()
  const patientId = params.patientId as string

  const [cardDetail, setCardDetail] = useState<PortalCardDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadCardDetail = async () => {
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

        const result = await getPatientCardDetail(patientId)
        if (!result.success) {
          setError(result.error)
          return
        }
        setCardDetail(result.data)
      } catch (err) {
        console.error('Error loading card detail:', err)
        setError('An error occurred while loading the card detail')
      } finally {
        setLoading(false)
      }
    }

    loadCardDetail()
  }, [patientId, router])

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading patient card…</p>
        </div>
      </div>
    )
  }

  if (error || !cardDetail) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center max-w-md">
          <p className="text-red-600 font-medium">{error || 'Card not found'}</p>
          <p className="mt-2 text-sm text-muted-foreground">
            The patient card you're looking for doesn't exist or you don't have access to it.
          </p>
          <button
            onClick={() => router.push('/portal')}
            className="mt-4 px-4 py-2 text-sm font-medium text-primary hover:underline"
          >
            Back to My Clinics
          </button>
        </div>
      </div>
    )
  }

  return <PatientCardDetail cardDetail={cardDetail} />
}