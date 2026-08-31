'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { getMyPortalStatus, getMyDisplayName } from '@/features/portal/actions'
import { listMyFamilyPatientCards } from '@/features/access-grants/actions'
import PatientPortalHome from '@/components/patient-portal-home'
import type { FamilyPatientCard } from '@/components/patient-portal-home'
import { Skeleton } from '@/components/ui/skeleton'

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
      <main className="mx-auto max-w-5xl px-4 py-6">
        {/* Greeting */}
        <div className="mb-8">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="mt-2 h-4 w-40" />
        </div>

        {/* My Clinics */}
        <div>
          <div className="mb-4">
            <Skeleton className="h-6 w-28" />
            <Skeleton className="mt-2 h-4 w-56" />
          </div>
          <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 xl:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => (
              <div
                key={i}
                className="flex h-full min-h-[160px] flex-col justify-between rounded-xl border border-border p-6"
              >
                <div>
                  <div className="mb-3 flex items-start justify-between gap-2">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="size-5 shrink-0 rounded" />
                  </div>
                  <Skeleton className="h-4 w-24" />
                </div>
                <Skeleton className="mt-4 h-3 w-28" />
              </div>
            ))}
          </div>
        </div>
      </main>
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