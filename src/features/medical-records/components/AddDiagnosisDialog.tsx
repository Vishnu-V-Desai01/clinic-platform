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
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"

export interface DiagnosisFormItem {
  condition_name: string
  code:           string
  severity:       "mild" | "moderate" | "severe" | ""
  status:         "active" | "resolved" | "inactive"
  notes:          string
}

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (item: DiagnosisFormItem) => void
}

const SEVERITIES = [
  { value: "mild",     label: "Mild"     },
  { value: "moderate", label: "Moderate" },
  { value: "severe",   label: "Severe"   },
] as const

const STATUSES = [
  { value: "active",   label: "Active"   },
  { value: "resolved", label: "Resolved" },
  { value: "inactive", label: "Inactive" },
] as const

export default function AddDiagnosisDialog({ open, onClose, onAdd }: Props) {
  const [conditionName, setConditionName] = useState("")
  const [code,          setCode]          = useState("")
  const [severity,      setSeverity]      = useState<DiagnosisFormItem["severity"]>("")
  const [status,        setStatus]        = useState<"active" | "resolved" | "inactive">("active")
  const [notes,         setNotes]         = useState("")
  const [error,         setError]         = useState<string | null>(null)

  // Reset every time the dialog closes
  useEffect(() => {
    if (!open) {
      setConditionName("")
      setCode("")
      setSeverity("")
      setStatus("active")
      setNotes("")
      setError(null)
    }
  }, [open])

  function handleAdd() {
    if (!conditionName.trim()) {
      setError("Diagnosis name is required.")
      return
    }
    onAdd({
      condition_name: conditionName.trim(),
      code:           code.trim(),
      severity,
      status,
      notes:          notes.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Diagnosis</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Condition name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="dx-condition">
              Diagnosis <span className="text-destructive">*</span>
            </Label>
            <Input
              id="dx-condition"
              value={conditionName}
              autoFocus
              placeholder="e.g. Migraine, Type 2 Diabetes"
              onChange={(e) => {
                setConditionName(e.target.value)
                if (error) setError(null)
              }}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* ICD-10 code + Severity */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="dx-code">
                ICD-10 code{" "}
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="dx-code"
                value={code}
                placeholder="e.g. G43.9"
                onChange={(e) => setCode(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="dx-severity">
                Severity{" "}
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Select
                value={severity || "__none__"}
                onValueChange={(v) =>
                  setSeverity(v === "__none__" ? "" : (v as DiagnosisFormItem["severity"]))
                }
              >
                <SelectTrigger id="dx-severity">
                  <SelectValue placeholder="None" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">None</SelectItem>
                  {SEVERITIES.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Status */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="dx-status">Status</Label>
            <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
              <SelectTrigger id="dx-status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {STATUSES.map((s) => (
                  <SelectItem key={s.value} value={s.value}>
                    {s.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Notes */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="dx-notes">
              Notes{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Textarea
              id="dx-notes"
              value={notes}
              rows={2}
              placeholder="Any additional notes"
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd}>
            Add Diagnosis
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}