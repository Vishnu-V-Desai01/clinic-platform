'use client'

import { useState } from 'react'
import { Loader2 } from 'lucide-react'
import { toast } from 'sonner'

interface DocumentDownloadButtonProps {
  href: string
  className?: string
  children: React.ReactNode
  loadingLabel?: string
  ariaLabel?: string
  /** When true, the loading state shows only a spinner (no label) — for icon-only buttons. */
  iconOnly?: boolean
}

export default function DocumentDownloadButton({
  href,
  className,
  children,
  loadingLabel = 'Generating…',
  ariaLabel,
  iconOnly = false,
}: DocumentDownloadButtonProps) {
  const [isGenerating, setIsGenerating] = useState(false)

  async function handleClick() {
    if (isGenerating) return
    setIsGenerating(true)

    // Open a blank tab synchronously, inside the same click handler, so
    // popup blockers don't intercept it — we only navigate it once the
    // PDF is actually ready, rather than pointing it straight at the API
    // route the moment the user clicks.
    //
    // Deliberately NOT passing noopener/noreferrer here: those flags make
    // window.open() return null, which meant we could never get a handle
    // back to navigate this tab once the PDF was ready — the tab would
    // open blank and just sit there. The tab only ever gets a same-origin
    // blob: URL we generate ourselves below, so there's no security
    // downside to keeping the reference.
    const newTab = window.open('', '_blank')

    try {
      const res = await fetch(href)
      if (!res.ok) throw new Error('Failed to generate document')
      const blob = await res.blob()
      const blobUrl = URL.createObjectURL(blob)

      if (newTab && !newTab.closed) {
        newTab.location.href = blobUrl
      } else {
        // Reference unavailable or the tab got closed in the meantime —
        // fall back to opening fresh. This one can safely carry
        // noopener/noreferrer since we don't need a reference to it.
        window.open(blobUrl, '_blank', 'noopener,noreferrer')
      }

      // Give the new tab time to actually load the blob before revoking it.
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000)
    } catch (err) {
      newTab?.close()
      toast.error('Could not generate the document. Please try again.')
    } finally {
      setIsGenerating(false)
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={isGenerating}
      aria-label={ariaLabel}
      className={className}
    >
      {isGenerating ? (
        iconOnly ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <>
            <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            {loadingLabel}
          </>
        )
      ) : (
        children
      )}
    </button>
  )
}