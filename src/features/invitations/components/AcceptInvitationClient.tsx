'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import { Loader2, AlertCircle } from 'lucide-react'
import InvitationAcceptScreen from './InvitationAcceptScreen'
import { acceptInvitationAction } from '../public-actions'
import type { InvitationLookup } from '../public-actions'

type Props = {
  token: string
  invitation: NonNullable<InvitationLookup>
  isSignedIn: boolean
  signInHref: string
  signUpHref: string
}

export function AcceptInvitationClient({
  token,
  invitation,
  isSignedIn,
  signInHref,
  signUpHref,
}: Props) {
  const router = useRouter()
  const [fullName, setFullName] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleJoin() {
    setError(null)
    startTransition(async () => {
      const result = await acceptInvitationAction(token, fullName)
      if (result && !result.success) {
        setError(result.error)
      }
      // On success, acceptInvitationAction redirects server-side.
    })
  }

  // When signed in: show name collection + join button inline,
  // not through InvitationAcceptScreen — the screen's onJoin
  // doesn't carry the name value.
  if (isSignedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
        <div className="w-full max-w-md space-y-6 text-center">
          <h1 className="text-2xl font-semibold">
            You&apos;re invited to join {invitation.clinicName}
          </h1>
          <p className="text-sm text-muted-foreground">
            Role: {invitation.role}
            {invitation.staffType ? ` · ${invitation.staffType}` : ''}
          </p>
          <div className="space-y-2 text-left">
            <Label htmlFor="fullName">Your full name</Label>
            <Input
              id="fullName"
              type="text"
              placeholder="e.g. Dr. Priya Nair"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              disabled={isPending}
              className="h-11"
            />
            <p className="text-xs text-muted-foreground">
              This is how your name will appear to patients and staff.
            </p>
          </div>
          {error && (
            <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
          <Button
            onClick={handleJoin}
            disabled={isPending || !fullName.trim()}
            className="w-full"
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 mr-2 animate-spin" />
                Joining…
              </>
            ) : (
              'Join clinic'
            )}
          </Button>
        </div>
      </div>
    )
  }

  return (
    <InvitationAcceptScreen
      state="valid"
      clinicName={invitation.clinicName}
      role={invitation.role}
      staffType={invitation.staffType}
      isSignedIn={false}
      isLoading={isPending}
      error={error}
      onSignIn={() => router.push(signInHref)}
      onSignUp={() => router.push(signUpHref)}
    />
  )
}