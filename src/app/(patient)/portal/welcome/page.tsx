'use client'

import { useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { completePortalOnboarding, getMyPortalStatus } from '@/features/portal/actions'
import PatientPortalWelcome from '@/components/patient-portal-welcome'

export default function WelcomePage() {
  const router = useRouter()
  const [familyCode, setFamilyCode] = useState('')
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const loadFamilyCode = async () => {
      try {
        const result = await getMyPortalStatus()
        if (!result.success) {
          setError('Failed to load family code')
          return
        }
        setFamilyCode(result.data.familyCode)
      } catch (err) {
        console.error('Error loading family code:', err)
        setError('An error occurred')
      } finally {
        setLoading(false)
      }
    }

    loadFamilyCode()
  }, [])

  const handleComplete = async () => {
    const result = await completePortalOnboarding()
    if (result.success) {
      router.push('/portal')
    } else {
      throw new Error(result.error)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="inline-flex h-8 w-8 animate-spin rounded-full border-4 border-muted border-t-primary" />
          <p className="mt-4 text-sm text-muted-foreground">Loading…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <p className="text-red-600 font-medium">{error}</p>
          <p className="mt-2 text-sm text-muted-foreground">Please refresh the page.</p>
        </div>
      </div>
    )
  }

  return (
    <PatientPortalWelcome familyCode={familyCode} onComplete={handleComplete} />
  )
}