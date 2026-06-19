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

export interface PrescriptionFormItem {
  medicine_name: string
  dosage:        string
  frequency:     string
  duration:      string
  instructions:  string
  status:        "active" | "stopped" | "completed"
}

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (item: PrescriptionFormItem) => void
}

const STATUSES = [
  { value: "active",    label: "Active"    },
  { value: "stopped",   label: "Stopped"   },
  { value: "completed", label: "Completed" },
] as const

const FREQUENCY_OPTIONS = [
  "Once daily",
  "Twice daily",
  "Three times daily",
  "Four times daily",
  "Every 6 hours",
  "Every 8 hours",
  "As needed",
  "At bedtime",
]

export default function AddPrescriptionDialog({ open, onClose, onAdd }: Props) {
  const [medicineName,  setMedicineName]  = useState("")
  const [dosage,        setDosage]        = useState("")
  const [frequency,     setFrequency]     = useState("")
  const [duration,      setDuration]      = useState("")
  const [instructions,  setInstructions]  = useState("")
  const [status,        setStatus]        = useState<PrescriptionFormItem["status"]>("active")
  const [error,         setError]         = useState<string | null>(null)

  useEffect(() => {
    if (!open) {
      setMedicineName("")
      setDosage("")
      setFrequency("")
      setDuration("")
      setInstructions("")
      setStatus("active")
      setError(null)
    }
  }, [open])

  function handleAdd() {
    if (!medicineName.trim()) {
      setError("Drug name is required.")
      return
    }
    onAdd({
      medicine_name: medicineName.trim(),
      dosage:        dosage.trim(),
      frequency,
      duration:      duration.trim(),
      instructions:  instructions.trim(),
      status,
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Prescription</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Drug name */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="rx-name">
              Drug name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="rx-name"
              value={medicineName}
              autoFocus
              placeholder="e.g. Sumatriptan"
              onChange={(e) => {
                setMedicineName(e.target.value)
                if (error) setError(null)
              }}
            />
            {error && <p className="text-xs text-destructive">{error}</p>}
          </div>

          {/* Dosage + Frequency */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rx-dosage">Dosage</Label>
              <Input
                id="rx-dosage"
                value={dosage}
                placeholder="e.g. 500 mg"
                onChange={(e) => setDosage(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rx-frequency">Frequency</Label>
              <Select value={frequency || undefined} onValueChange={setFrequency}>
                <SelectTrigger id="rx-frequency">
                  <SelectValue placeholder="Select" />
                </SelectTrigger>
                <SelectContent>
                  {FREQUENCY_OPTIONS.map((f) => (
                    <SelectItem key={f} value={f}>
                      {f}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {/* Duration + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="rx-duration">Duration</Label>
              <Input
                id="rx-duration"
                value={duration}
                placeholder="e.g. 7 days"
                onChange={(e) => setDuration(e.target.value)}
              />
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="rx-status">Status</Label>
              <Select value={status} onValueChange={(v) => setStatus(v as typeof status)}>
                <SelectTrigger id="rx-status">
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
          </div>

          {/* Instructions */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="rx-instructions">Instructions</Label>
            <Input
              id="rx-instructions"
              value={instructions}
              placeholder="e.g. Take after meals"
              onChange={(e) => setInstructions(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd}>
            Add Prescription
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}