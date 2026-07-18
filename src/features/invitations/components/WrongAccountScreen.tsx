'use client'

import { SignOutButton } from '@clerk/nextjs'

export function WrongAccountScreen({
  invitedEmail,
  currentEmail,
  token,
}: {
  invitedEmail: string
  currentEmail: string
  token: string
}) {
  const acceptInvitationPath = `/accept-invitation?token=${encodeURIComponent(token)}`
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(acceptInvitationPath)}`

  return (
    <div className="min-h-screen flex items-center justify-center p-6">
      <div className="max-w-md w-full space-y-4 text-center">
        <h1 className="text-2xl font-semibold">Wrong account</h1>
        <p className="text-sm text-muted-foreground">
          This invitation was sent to <strong>{invitedEmail}</strong>, but
          you are currently signed in as <strong>{currentEmail}</strong>.
        </p>
        <p className="text-sm text-muted-foreground">
          Sign out and sign in with the invited email address to accept this invitation.
        </p>
        <SignOutButton redirectUrl={signInHref}>
          <button className="inline-block mt-2 text-sm font-medium text-primary underline">
            Sign in with a different account
          </button>
        </SignOutButton>
      </div>
    </div>
  )
}