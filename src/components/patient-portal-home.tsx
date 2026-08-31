'use client'

import { Card } from '@/components/ui/card'
import { ChevronRight, Building2 } from 'lucide-react'

export interface FamilyPatientCard {
  id: string
  firstName: string
  lastName: string
  clinicName: string
  createdAt: string
}

export interface PatientPortalHomeProps {
  cards: FamilyPatientCard[]
  firstName?: string
  onCardClick: (patientId: string) => void
}

export default function PatientPortalHome({
  cards,
  firstName,
  onCardClick,
}: PatientPortalHomeProps) {
  const formatDate = (isoDate: string): string => {
    try {
      return new Intl.DateTimeFormat('en-IN', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      }).format(new Date(isoDate))
    } catch {
      return isoDate
    }
  }

  return (
    <main className="curakin-preview mx-auto max-w-5xl bg-background px-4 py-6">
      {/* Greeting Section */}
      <div className="mb-8">
        <h1 className="curakin-h1">
          Welcome back{firstName ? `, ${firstName}` : ''}
        </h1>
        <p className="text-sm text-muted-foreground">
          Your CURAKIN Patient Portal
        </p>
      </div>

      {/* My Clinics Section */}
      <div>
        <div className="mb-4">
          <h2 className="curakin-h2">My Clinics</h2>
          <p className="text-sm text-muted-foreground">
            Your registered patient cards across clinics
          </p>
        </div>

        {cards.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-muted/50">
              <Building2 className="h-8 w-8 text-muted-foreground" aria-hidden="true" />
            </div>
            <h3 className="font-semibold text-foreground mb-2">
              No clinic enrollments yet
            </h3>
            <p className="max-w-xs text-sm text-muted-foreground">
              Your clinic will register you via email and link your account.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-5">
            {cards.map((card) => (
              <button
                key={card.id}
                onClick={() => onCardClick(card.id)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    onCardClick(card.id)
                  }
                }}
                className="text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 rounded-xl transition-all"
                aria-label={`Open ${card.clinicName || 'clinic'} patient card`}
              >
                <Card className="curakin-card-flat flex h-full min-h-[160px] flex-col justify-between rounded-xl p-6 transition-shadow hover:shadow-md">
                  <div>
                    <div className="mb-3 flex items-start justify-between gap-2">
                      <h3 className="text-xl font-semibold text-primary">
                        {card.clinicName || 'Clinic'}
                      </h3>
                      <ChevronRight
                        className="h-5 w-5 shrink-0 text-muted-foreground"
                        aria-hidden="true"
                      />
                    </div>
                    <p className="text-sm text-muted-foreground">
                      {card.firstName} {card.lastName}
                    </p>
                  </div>
                  <p className="mt-4 text-xs text-muted-foreground">
                    Registered {formatDate(card.createdAt)}
                  </p>
                </Card>
              </button>
            ))}
          </div>
        )}
      </div>
    </main>
  )
}