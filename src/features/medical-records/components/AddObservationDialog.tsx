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

import { COMMON_OBSERVATION_TYPES } from "../types"

export interface ObservationFormItem {
  observation_type: string
  value:            string
  unit:             string
  code:             string
}

interface Props {
  open:    boolean
  onClose: () => void
  onAdd:   (item: ObservationFormItem) => void
}

export default function AddObservationDialog({ open, onClose, onAdd }: Props) {
  const [observationType, setObservationType] = useState("")
  const [customType,      setCustomType]      = useState("")
  const [value,           setValue]           = useState("")
  const [unit,            setUnit]            = useState("")
  const [code,            setCode]            = useState("")
  const [errors,          setErrors]          = useState<{
    type?: string
    customType?: string
    value?: string
  }>({})

  const isOther = observationType === "other"

  useEffect(() => {
    if (!open) {
      setObservationType("")
      setCustomType("")
      setValue("")
      setUnit("")
      setCode("")
      setErrors({})
    }
  }, [open])

  function handleTypeChange(type: string) {
    setObservationType(type)
    setErrors((prev) => ({ ...prev, type: undefined }))
    if (type !== "other") {
      const found = COMMON_OBSERVATION_TYPES.find((t) => t.value === type)
      setUnit(found?.unit ?? "")
      setCustomType("")
    } else {
      setUnit("")
    }
  }

  function handleAdd() {
    const newErrors: typeof errors = {}
    if (!observationType) newErrors.type = "Type is required."
    if (isOther && !customType.trim()) newErrors.customType = "Please specify the observation type."
    if (!value.trim()) newErrors.value = "Value is required."

    if (Object.keys(newErrors).length) {
      setErrors(newErrors)
      return
    }

    onAdd({
      observation_type: isOther ? customType.trim() : observationType,
      value:             value.trim(),
      unit:              unit.trim(),
      code:              code.trim(),
    })
  }

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onClose() }}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Add Vital / Observation</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Type */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="obs-type">
              Type <span className="text-destructive">*</span>
            </Label>
            <Select value={observationType || undefined} onValueChange={handleTypeChange}>
              <SelectTrigger id="obs-type">
                <SelectValue placeholder="Select observation type" />
              </SelectTrigger>
              <SelectContent>
                {COMMON_OBSERVATION_TYPES.map((t) => (
                  <SelectItem key={t.value} value={t.value}>
                    {t.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.type && <p className="text-xs text-destructive">{errors.type}</p>}
          </div>

          {/* Custom type — only shown when "Other" is selected */}
          {isOther && (
            <div className="flex flex-col gap-2">
              <Label htmlFor="obs-custom-type">
                Specify type <span className="text-destructive">*</span>
              </Label>
              <Input
                id="obs-custom-type"
                value={customType}
                autoFocus
                placeholder="e.g. Capillary refill, Skin rash size"
                onChange={(e) => {
                  setCustomType(e.target.value)
                  setErrors((prev) => ({ ...prev, customType: undefined }))
                }}
              />
              {errors.customType && (
                <p className="text-xs text-destructive">{errors.customType}</p>
              )}
            </div>
          )}

          {/* Value + Unit */}
          <div className="grid grid-cols-2 gap-4">
            <div className="flex flex-col gap-2">
              <Label htmlFor="obs-value">
                Value <span className="text-destructive">*</span>
              </Label>
              <Input
                id="obs-value"
                value={value}
                autoFocus={!isOther}
                placeholder="e.g. 128/84"
                onChange={(e) => {
                  setValue(e.target.value)
                  setErrors((prev) => ({ ...prev, value: undefined }))
                }}
              />
              {errors.value && <p className="text-xs text-destructive">{errors.value}</p>}
            </div>
            <div className="flex flex-col gap-2">
              <Label htmlFor="obs-unit">Unit</Label>
              <Input
                id="obs-unit"
                value={unit}
                placeholder="e.g. mmHg"
                onChange={(e) => setUnit(e.target.value)}
              />
            </div>
          </div>

          {/* LOINC code */}
          <div className="flex flex-col gap-2">
            <Label htmlFor="obs-code">
              LOINC code{" "}
              <span className="text-xs text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="obs-code"
              value={code}
              placeholder="e.g. 85354-9"
              onChange={(e) => setCode(e.target.value)}
            />
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button type="button" onClick={handleAdd}>
            Add Vital
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}