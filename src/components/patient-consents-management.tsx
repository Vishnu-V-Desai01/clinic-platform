'use client'

import { useState } from 'react'
import { Loader2, ShieldCheck } from 'lucide-react'
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion'
import { Button } from '@/components/ui/button'
import { CONSENT_PURPOSE_LABELS, CONSENT_PURPOSE_DESCRIPTIONS } from '@/features/consent/types'
import type { ConsentPurpose } from '@/features/consent/types'

interface ConsentRow {
  patientId: string
  purpose: string
  isActive: boolean
}

interface PatientCardWithConsents {
  id: string
  firstName: string
  lastName: string
  clinicName: string
  consents: ConsentRow[]
}

interface PatientConsentsManagementProps {
  cardsWithConsents: PatientCardWithConsents[]
  onToggleConsent: (patientId: string, purpose: string, newState: boolean) => Promise<void>
}

export default function PatientConsentsManagement({
  cardsWithConsents,
  onToggleConsent,
}: PatientConsentsManagementProps) {
  const [loading, setLoading] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, boolean>>({})

  const handleToggle = async (patientId: string, purpose: string, newState: boolean) => {
    const key = `${patientId}:${purpose}`

    // Set loading state and clear any prior error
    setLoading((prev) => ({ ...prev, [key]: true }))
    setErrors((prev) => ({ ...prev, [key]: false }))

    try {
      await onToggleConsent(patientId, purpose, newState)
    } catch (_error) {
      setErrors((prev) => ({ ...prev, [key]: true }))
    } finally {
      setLoading((prev) => ({ ...prev, [key]: false }))
    }
  }

  if (cardsWithConsents.length === 0) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-6">
        <div className="text-center py-12">
          <ShieldCheck
            className="mx-auto mb-4 h-12 w-12 text-muted-foreground"
            aria-hidden="true"
          />
          <p className="text-muted-foreground">
            You haven&apos;t registered at any clinics yet. Once registered, you&apos;ll see
            consent options here.
          </p>
        </div>
      </div>
    )
  }

  // Get all unique purposes from the CONSENT_PURPOSE_LABELS
  const purposes = Object.entries(CONSENT_PURPOSE_LABELS).map(([key, label]) => ({
    key: key as ConsentPurpose,
    name: label,
    description: CONSENT_PURPOSE_DESCRIPTIONS[key as ConsentPurpose],
  }))

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-balance text-2xl font-bold text-foreground sm:text-3xl">
          Your Privacy & Consent
        </h1>
        <p className="mt-2 text-lg text-muted-foreground">
          Control how CURAKIN and your clinics use your data
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          You can enable or disable each purpose independently. Changes take effect immediately.
        </p>
      </div>

      {/* Accordion of clinics */}
      <Accordion type="single" collapsible className="space-y-3">
        {cardsWithConsents.map((card) => (
          <AccordionItem
            key={card.id}
            value={card.id}
            className="rounded-lg border border-border bg-card shadow-sm"
          >
            <AccordionTrigger className="px-4 py-3 hover:bg-muted/50 [&>svg]:size-5">
              <div className="text-left">
                <span className="font-semibold text-primary">{card.clinicName}</span>
                <span className="text-muted-foreground"> — </span>
                <span className="text-muted-foreground">
                  {card.firstName} {card.lastName}
                </span>
              </div>
            </AccordionTrigger>

            <AccordionContent className="px-4 pb-0 pt-0">
              <div className="divide-y divide-border">
                {purposes.map((purpose) => {
                  const consent = card.consents.find((c) => c.purpose === purpose.key)
                  const isActive = consent?.isActive ?? false
                  const loadingKey = `${card.id}:${purpose.key}`
                  const isLoading = loading[loadingKey]
                  const hasError = errors[loadingKey]

                  return (
                    <div
                      key={purpose.key}
                      className={`flex items-start justify-between gap-4 py-3 ${
                        isLoading ? 'cursor-not-allowed opacity-70' : ''
                      }`}
                    >
                      <div className="flex-1">
                        <p className="font-medium text-foreground">{purpose.name}</p>
                        <p className="text-sm text-muted-foreground">{purpose.description}</p>
                      </div>

                      <div className="flex flex-col items-end gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleToggle(card.id, purpose.key, !isActive)}
                          disabled={isLoading}
                          aria-label={`Toggle ${purpose.name} consent for ${card.firstName} ${card.lastName} at ${card.clinicName}`}
                          className={
                            isActive
                              ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                              : ''
                          }
                        >
                          {isLoading ? (
                            <>
                              <Loader2
                                className="mr-2 h-4 w-4 animate-spin"
                                aria-hidden="true"
                              />
                              Saving…
                            </>
                          ) : isActive ? (
                            'Enabled'
                          ) : (
                            'Disabled'
                          )}
                        </Button>
                        {hasError && (
                          <p
                            className="text-xs text-destructive"
                            aria-live="polite"
                            role="status"
                          >
                            Couldn&apos;t save. Try again.
                          </p>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  )
}