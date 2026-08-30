import { SignUp } from '@clerk/nextjs'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ redirect_url?: string }>
}) {
  const { redirect_url } = await searchParams

  return (
    <div className="flex min-h-screen items-center justify-center">
      <SignUp fallbackRedirectUrl={redirect_url || '/dashboard'} />
    </div>
  )
}