'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getMyPortalStatus, getMyDisplayName } from '@/features/portal/actions'
import { listMyFamilyPatientCards } from '@/features/access-grants/actions'
import PatientPortalHome from '@/components/patient-portal-home'
import type { FamilyPatientCard } from '@/components/patient-portal-home'

export default function PortalPage() {
  const router = useRouter()
  const [cards, setCards] = useState<FamilyPatientCard[]>([])
  const [firstName, setFirstName] = useState<string | undefined>()
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadData = async () => {
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

        const cardsResult = await listMyFamilyPatientCards()
        if (!cardsResult.success) {
          setError('Failed to load patient cards')
          return
        }

        const mappedCards: FamilyPatientCard[] = cardsResult.data.map((card) => ({
          id: card.id,
          firstName: card.firstName,
          lastName: card.lastName,
          clinicName: card.clinicName,
          createdAt: card.createdAt,
        }))
        setCards(mappedCards)

        const nameResult = await getMyDisplayName()
        if (nameResult.success && nameResult.data.fullName) {
          const first = nameResult.data.fullName.split(' ')[0]
          setFirstName(first)
        }
      } catch (err) {
        console.error('Error loading portal data:', err)
        setError('An error occurred while loading your portal')
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [router])

  const handleCardClick = (patientId: string) => {
    router.push(`/portal/card/${patientId}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <div className="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading your portal...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-96">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <p className="mt-2 text-sm text-muted-foreground">Please try refreshing the page.</p>
        </div>
      </div>
    )
  }

  return (
    <PatientPortalHome
      cards={cards}
      firstName={firstName}
      onCardClick={handleCardClick}
    />
  )
}