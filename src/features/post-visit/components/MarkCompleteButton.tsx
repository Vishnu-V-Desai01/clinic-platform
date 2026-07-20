// src/features/post-visit/components/MarkCompleteButton.tsx
//
// Tiny client island: one button + the modal.
// Only renders for doctor-role users (enforced by the parent server
// component — don't add a role check here).
// Only shown when appointment.status === 'scheduled' (parent filters).
// Ownership is re-verified server-side in getVisitPrefill.

'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2 } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CompleteVisitModal from './CompleteVisitModal'

interface MarkCompleteButtonProps {
  appointmentId: string
  patientName:   string
  /** Extra callback in addition to router.refresh() — for parent state resets. */
  onComplete?:   () => void
  disabled?:     boolean
  /** visual variant — 'default' in list rows, 'outline' in detail headers */
  variant?:      'default' | 'outline' | 'ghost'
}

export default function MarkCompleteButton({
  appointmentId,
  patientName,
  onComplete,
  disabled,
  variant = 'default',
}: MarkCompleteButtonProps) {
  const router      = useRouter()
  const [open, setOpen] = useState(false)

  const handleComplete = () => {
    // Refresh server components so the appointment list reflects 'completed'
    router.refresh()
    onComplete?.()
  }

  return (
    <>
      <Button
        size="sm"
        variant={variant}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <CheckCircle2 className="mr-1.5 h-4 w-4" />
        Mark as Complete
      </Button>

      <CompleteVisitModal
        appointmentId={appointmentId}
        patientName={patientName}
        open={open}
        onOpenChange={setOpen}
        onComplete={handleComplete}
      />
    </>
  )
}