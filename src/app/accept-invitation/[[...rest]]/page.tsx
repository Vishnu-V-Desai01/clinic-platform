import { auth, currentUser } from '@clerk/nextjs/server'
import { lookupInvitationByToken } from '@/features/invitations/public-actions'
import { AcceptInvitationClient } from '@/features/invitations/components/AcceptInvitationClient'
import InvitationAcceptScreen from '@/features/invitations/components/InvitationAcceptScreen'
import { WrongAccountScreen } from '@/features/invitations/components/WrongAccountScreen'

export default async function AcceptInvitationPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>
}) {
  const { token } = await searchParams

  if (!token) {
    return <InvitationAcceptScreen state="invalid" />
  }

  const invitation = await lookupInvitationByToken(token)

  if (!invitation) {
    return <InvitationAcceptScreen state="invalid" />
  }

  if (invitation.status === 'accepted') {
    return <InvitationAcceptScreen state="used" clinicName={invitation.clinicName} />
  }

  if (invitation.status === 'expired' || invitation.isExpired) {
    return <InvitationAcceptScreen state="expired" clinicName={invitation.clinicName} />
  }

  const { userId } = await auth()

  if (userId) {
    const user = await currentUser()
    const currentEmail = user?.emailAddresses[0]?.emailAddress ?? ''

    if (currentEmail.toLowerCase() !== invitation.invitedEmail.toLowerCase()) {
      return (
        <WrongAccountScreen
          invitedEmail={invitation.invitedEmail}
          currentEmail={currentEmail}
          token={token}
        />
      )
    }
  }

  const acceptInvitationPath = `/accept-invitation?token=${encodeURIComponent(token)}`
  const signInHref = `/sign-in?redirect_url=${encodeURIComponent(acceptInvitationPath)}`
  const signUpHref = `/sign-up?redirect_url=${encodeURIComponent(acceptInvitationPath)}`

  return (
    <AcceptInvitationClient
      token={token}
      invitation={invitation}
      isSignedIn={!!userId}
      signInHref={signInHref}
      signUpHref={signUpHref}
    />
  )
}