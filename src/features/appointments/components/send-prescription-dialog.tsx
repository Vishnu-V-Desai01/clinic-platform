"use client"

import { useState, useTransition } from "react"
import { FileText, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { sendPrescriptionMessage } from "../actions"

interface SendPrescriptionDialogProps {
  appointmentId: string
  patientName:   string
  open:          boolean
  onOpenChange:  (open: boolean) => void
}

export default function SendPrescriptionDialog({
  appointmentId,
  patientName,
  open,
  onOpenChange,
}: SendPrescriptionDialogProps) {
  const [isSending, startTransition] = useTransition()
  const [error,     setError]        = useState<string | null>(null)
  const [sent,      setSent]         = useState(false)

  function handleConfirm() {
    setError(null)
    startTransition(async () => {
      const result = await sendPrescriptionMessage(appointmentId)
      if (!result.success) {
        setError(result.error)
        return
      }
      setSent(true)
    })
  }

  function handleClose(next: boolean) {
    if (isSending) return
    if (!next) {
      // Reset for next time this dialog opens
      setError(null)
      setSent(false)
    }
    onOpenChange(next)
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-sm">
        {sent ? (
          <>
            <DialogHeader>
              <DialogTitle>Prescription sent</DialogTitle>
              <DialogDescription>
                The prescription was sent to {patientName} over WhatsApp.
              </DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button onClick={() => handleClose(false)}>Close</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Send Prescription</DialogTitle>
              <DialogDescription>
                Generate and send this visit&apos;s prescription to {patientName} over WhatsApp.
              </DialogDescription>
            </DialogHeader>

            <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-3">
              <FileText className="size-5 shrink-0 text-primary" />
              <p className="text-sm text-muted-foreground">
                A PDF of the prescribed medicines will be generated and a download link
                sent by WhatsApp. This cannot be undone once sent.
              </p>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}

            <DialogFooter>
              <Button variant="outline" onClick={() => handleClose(false)} disabled={isSending}>
                Cancel
              </Button>
              <Button onClick={handleConfirm} disabled={isSending}>
                {isSending && <Loader2 className="mr-1.5 size-4 animate-spin" />}
                {isSending ? "Sending…" : "Send Prescription"}
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  )
}