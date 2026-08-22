'use client'

import { useState } from 'react'
import { Card } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Loader2 } from 'lucide-react'

interface PatientPortalWelcomeProps {
  familyCode: string
  onComplete: () => Promise<void>
}

export default function PatientPortalWelcome({
  familyCode,
  onComplete,
}: PatientPortalWelcomeProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleComplete = async () => {
    setLoading(true)
    setError(null)

    try {
      await onComplete()
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : 'Something went wrong. Please try again.'
      setError(errorMessage)
      setLoading(false)
    }
  }

  return (
    <main className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-lg">
        {/* Welcome Header */}
        <div className="text-center mb-8">
          <h1 className="text-3xl font-bold text-foreground mb-3">Welcome to CURAKIN</h1>
          <p className="text-lg text-muted-foreground mb-4">
            Your personal health records, under your control
          </p>
          <p className="text-sm text-muted-foreground leading-relaxed">
            CURAKIN is a DPDP Act 2023 compliant patient portal. You own your data and control who
            sees it. Your clinic will manage your records, but you&apos;re always in charge.
          </p>
        </div>

        {/* Family ID Display */}
        <Card className="mb-8 bg-primary/10 border border-primary/20 p-6 rounded-xl">
          <p className="text-xs text-muted-foreground mb-2 text-center">
            Your Unique Family ID
          </p>
          <p className="font-mono text-2xl font-semibold text-foreground text-center tracking-wide">
            {familyCode}
          </p>
          <p className="text-xs text-muted-foreground italic text-center mt-3">
            Share this with clinics or doctors who need to request access to your records.
          </p>
        </Card>

        {/* Action Button */}
        <div className="space-y-4">
          <Button onClick={handleComplete} disabled={loading} className="w-full" size="lg">
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
                Setting up…
              </>
            ) : (
              "Let's Get Started"
            )}
          </Button>

          {error && (
            <div className="p-4 bg-destructive/10 border border-destructive/20 rounded-lg">
              <p className="text-sm text-destructive">{error}</p>
            </div>
          )}

          <p className="text-xs text-muted-foreground text-center">
            You can manage your privacy settings anytime in "My Consents"
          </p>
        </div>
      </div>
    </main>
  )
}