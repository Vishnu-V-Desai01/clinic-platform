"use client"

import { useEffect, useState } from "react"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import TreatmentNameCombobox from "@/features/clinical-snippets/components/TreatmentNameCombobox"
import type { ClinicalNoteSnippet } from "@/features/clinical-snippets/types"

export interface TreatmentFormItem {
  treatment_name: string
  notes:          string
}

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (item: TreatmentFormItem) => void
}

export default function AddTreatmentDialog({ open, onClose, onAdd }: Props) {
  const [treatmentName, setTreatmentName] = useState("")
  const [notes,         setNotes]         = useState("")
  const [error,         setError]         = useState<string | null>(null)

  // Reset every time the dialog closes
  useEffect(() => {
    if (!open) {
      setTreatmentName("")
      setNotes("")
      setError(null)
    }
  }, [open])

  function handleSnippetSelect(snippet: ClinicalNoteSnippet) {
    setTreatmentName(snippet.title)
    setNotes(snippet.body)
    if (error) setError(null)
  }

  function handleAdd() {
    if (!treatmentName.trim()) {
      setError("Treatment is required.")
      return
    }
    onAdd({
      treatment_name: treatmentName.trim(),
      notes:          notes.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Treatment</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Treatment — free text or pick a snippet */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-name">
              Treatment <span className="text-destructive">*</span>
            </Label>
            <TreatmentNameCombobox
              id="tx-name"
              name={treatmentName}
              onNameChange={(v) => {
                setTreatmentName(v)
                if (error) setError(null)
              }}
              onSnippetSelect={handleSnippetSelect}
              autoFocus
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
            <p className="text-xs text-muted-foreground">
              Type freely, or pick a saved snippet to fill both fields.
            </p>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="tx-notes">
              Notes{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="tx-notes"
              value={notes}
              rows={3}
              placeholder="Work performed, materials used, follow-up plan…"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd}>
            Add Treatment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}