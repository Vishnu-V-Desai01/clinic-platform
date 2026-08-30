// src/features/post-visit/components/EditVisitButton.tsx
//
// Companion to MarkCompleteButton — same pattern, but for a COMPLETED
// appointment. Reuses CompleteVisitModal directly: edit vs. create mode is
// detected server-side in getVisitPrefill (presence of an existing
// encounter for this appointment), so no separate modal is needed.
//
// Visibility is the caller's responsibility (see appointments-list.tsx) —
// this component renders unconditionally once mounted. Server-side
// permission (admin / treating doctor / staff-charges-only) is
// independently re-verified in getVisitPrefill/completeVisit regardless of
// what the UI shows, per the same defence-in-depth pattern used throughout
// this app.

'use client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Pencil } from 'lucide-react'
import { Button } from '@/components/ui/button'
import CompleteVisitModal from './CompleteVisitModal'

interface EditVisitButtonProps {
  appointmentId: string
  patientName:   string
  onComplete?:   () => void
  disabled?:     boolean
  variant?:      'default' | 'outline' | 'ghost'
}

export default function EditVisitButton({
  appointmentId,
  patientName,
  onComplete,
  disabled,
  variant = 'outline',
}: EditVisitButtonProps) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  const handleComplete = () => {
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
        <Pencil className="mr-1.5 h-4 w-4" />
        Edit Visit
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