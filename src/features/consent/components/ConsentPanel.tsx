'use client'

import { useState } from 'react'
import { ShieldCheck, Check, X, Lock, Loader2 } from 'lucide-react'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Separator } from '@/components/ui/separator'
import {
  CONSENT_PURPOSES,
  CONSENT_PURPOSE_LABELS,
  CONSENT_PURPOSE_DESCRIPTIONS,
} from '../types'
import type { ConsentPurpose } from '../types'

// Minimal view type — only the fields this UI needs
export type ConsentRecord = {
  id:         string
  purpose:    ConsentPurpose
  is_active:  boolean
  granted_at: string | null
  revoked_at: string | null
}

export interface ConsentPanelProps {
  consents:   ConsentRecord[]
  patientId:  string
  onGrant:    (purpose: ConsentPurpose) => void
  onRevoke:   (consentId: string) => void
  isLoading:  boolean
}

type Status = 'Active' | 'Revoked' | 'Not Granted'

const dateFormatter = new Intl.DateTimeFormat('en-IN', {
  day: 'numeric', month: 'short', year: 'numeric',
})

function formatDate(value: string | null): string {
  if (!value) return ''
  const d = new Date(value)
  return Number.isNaN(d.getTime()) ? '' : dateFormatter.format(d)
}

function deriveStatus(record: ConsentRecord | undefined): Status {
  if (record?.is_active === true) return 'Active'
  if (record?.is_active === false && record.revoked_at) return 'Revoked'
  return 'Not Granted'
}

export default function ConsentPanel({
  consents,
  patientId,
  onGrant,
  onRevoke,
  isLoading,
}: ConsentPanelProps) {
  const [pendingKey, setPendingKey] = useState<string | null>(null)

  function handleGrant(purpose: ConsentPurpose) {
    setPendingKey(`grant:${purpose}`)
    onGrant(purpose)
  }

  function handleRevoke(consentId: string, purpose: ConsentPurpose) {
    setPendingKey(`revoke:${purpose}`)
    onRevoke(consentId)
  }

  return (
    <Card className="border-border bg-card p-6 shadow-sm" data-patient-id={patientId}>
      {/* Header */}
      <div className="flex items-center gap-3">
        <div
          className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary"
          aria-hidden="true"
        >
          <ShieldCheck className="size-5" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground">Patient Consent</h2>
          <p className="text-sm text-muted-foreground">
            Recorded under DPDP Act 2023 — all changes are audited
          </p>
        </div>
      </div>

      {/* Purpose cards — driven entirely by types.ts; no duplicate label strings here */}
      <div className="mt-6 grid grid-cols-1 gap-4 md:grid-cols-2">
        {CONSENT_PURPOSES.map((purpose) => {
          const record      = consents.find((c) => c.purpose === purpose)
          const status      = deriveStatus(record)
          const grantPending  = isLoading && pendingKey === `grant:${purpose}`
          const revokePending = isLoading && pendingKey === `revoke:${purpose}`

          return (
            <div
              key={purpose}
              className="flex flex-col rounded-xl border border-border bg-card p-5 shadow-sm"
            >
              {/* Label + badge */}
              <div className="flex items-start justify-between gap-3">
                <h3 className="font-semibold text-foreground">
                  {CONSENT_PURPOSE_LABELS[purpose]}
                </h3>
                <StatusBadge status={status} />
              </div>

              {/* Description */}
              <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                {CONSENT_PURPOSE_DESCRIPTIONS[purpose]}
              </p>

              <Separator className="my-4" />

              {/* Action row */}
              <div className="mt-auto flex items-center justify-between gap-3">
                {status === 'Active' && record && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Granted on {formatDate(record.granted_at)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                      onClick={() => handleRevoke(record.id, purpose)}
                      className="border-destructive/40 text-destructive hover:bg-destructive/10 hover:text-destructive"
                    >
                      {revokePending
                        ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        : <X className="size-4" aria-hidden="true" />}
                      Revoke
                    </Button>
                  </>
                )}

                {status === 'Not Granted' && (
                  <Button
                    size="sm"
                    disabled={isLoading}
                    onClick={() => handleGrant(purpose)}
                    className="w-full"
                  >
                    {grantPending
                      ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                      : <Check className="size-4" aria-hidden="true" />}
                    Grant Consent
                  </Button>
                )}

                {status === 'Revoked' && record && (
                  <>
                    <span className="text-xs text-muted-foreground">
                      Revoked on {formatDate(record.revoked_at)}
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={isLoading}
                      onClick={() => handleGrant(purpose)}
                    >
                      {grantPending
                        ? <Loader2 className="size-4 animate-spin" aria-hidden="true" />
                        : <Check className="size-4" aria-hidden="true" />}
                      Re-grant
                    </Button>
                  </>
                )}
              </div>
            </div>
          )
        })}
      </div>

      {/* Footer */}
      <div className="mt-6 flex items-center gap-1.5 text-sm text-muted-foreground">
        <Lock className="size-3.5" aria-hidden="true" />
        <span>Consent can be revoked by the patient at any time</span>
      </div>
    </Card>
  )
}

function StatusBadge({ status }: { status: Status }) {
  if (status === 'Active') {
    return (
      <Badge className="shrink-0 gap-1.5 border-transparent bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
        <span className="size-1.5 rounded-full bg-emerald-600 dark:bg-emerald-400" aria-hidden="true" />
        Active
      </Badge>
    )
  }
  if (status === 'Revoked') {
    return (
      <Badge className="shrink-0 gap-1.5 border-transparent bg-destructive/15 text-destructive">
        <span className="size-1.5 rounded-full bg-destructive" aria-hidden="true" />
        Revoked
      </Badge>
    )
  }
  return (
    <Badge variant="secondary" className="shrink-0 gap-1.5">
      <span className="size-1.5 rounded-full bg-muted-foreground/60" aria-hidden="true" />
      Not Granted
    </Badge>
  )
}