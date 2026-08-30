'use client'

import { useState, useTransition } from 'react'
import { claimByPhone } from './actions'

export default function PhoneClaimForm() {
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setError(null)
    startTransition(async () => {
      const result = await claimByPhone(phone)
      // A successful claim redirects server-side and this code never
      // runs; reaching here means it failed.
      if (result?.error) {
        setError(result.error)
      }
    })
  }

  return (
    <div className="max-w-md w-full space-y-4 text-center">
      <h1 className="text-2xl font-semibold">No patient record found</h1>
      <p className="text-sm text-muted-foreground">
        We couldn&apos;t find a patient record matching your account&apos;s
        email address. If your clinic registered you with your WhatsApp
        number instead, enter it below to find your record.
      </p>

      <form onSubmit={handleSubmit} className="space-y-3 text-left">
        <div className="flex flex-col gap-2">
          <label htmlFor="claim-phone" className="text-sm font-medium">
            WhatsApp number
          </label>
          <div className="flex">
            <span className="flex h-11 items-center rounded-l-md border border-r-0 border-input bg-muted/50 px-3 text-sm text-muted-foreground">
              +91
            </span>
            <input
              id="claim-phone"
              type="tel"
              inputMode="numeric"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="98765 43210"
              className="h-11 flex-1 rounded-r-md border border-input px-3 text-sm outline-none focus-visible:ring-2 focus-visible:ring-sky-500"
              disabled={isPending}
              required
            />
          </div>
        </div>

        {error && (
          <p className="text-sm text-destructive">{error}</p>
        )}

        <button
          type="submit"
          disabled={isPending}
          className="w-full h-11 rounded-md bg-sky-500 text-white text-sm font-medium hover:bg-sky-600 disabled:opacity-60"
        >
          {isPending ? 'Checking…' : 'Find my record'}
        </button>
      </form>

      <p className="text-xs text-muted-foreground">
        Still no luck? Please check with your clinic to confirm the phone
        number or email they registered you with.
      </p>
    </div>
  )
}