// src/features/post-visit/components/RemindersCard.tsx
//
// Card 2 of 5. Spacious design for adding reminder times.
// Doctor picks a medicine + enters duration + time (12-hour with AM/PM) + meal association.

'use client'

import { useState } from 'react'
import { Clock, Plus, X } from 'lucide-react'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import type { PrescriptionLine, MedicineReminderTime } from '../types'

interface RemindersCardProps {
  prescriptions:         PrescriptionLine[]
  reminderTimes:         MedicineReminderTime[]
  onReminderTimesChange: (times: MedicineReminderTime[]) => void
}

const MEAL_ASSOCIATIONS = [
  { label: 'Before breakfast', value: 'before_breakfast' },
  { label: 'With breakfast', value: 'with_breakfast' },
  { label: 'After breakfast', value: 'after_breakfast' },
  { label: 'Before lunch', value: 'before_lunch' },
  { label: 'With lunch', value: 'with_lunch' },
  { label: 'After lunch', value: 'after_lunch' },
  { label: 'Before dinner', value: 'before_dinner' },
  { label: 'With dinner', value: 'with_dinner' },
  { label: 'After dinner', value: 'after_dinner' },
  { label: 'Before bedtime', value: 'before_bedtime' },
  { label: 'At bedtime', value: 'at_bedtime' },
  { label: 'Any time', value: 'any_time' },
]

// Convert 12-hour time to 24-hour format (HH:MM)
function convertTo24Hour(hour: string, minute: string, period: 'AM' | 'PM'): string {
  let h = parseInt(hour, 10)
  const m = parseInt(minute, 10)

  if (period === 'PM' && h !== 12) h += 12
  if (period === 'AM' && h === 12) h = 0

  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`
}

// Convert 24-hour time to 12-hour format
function convertTo12Hour(time24: string): { hour: string; minute: string; period: 'AM' | 'PM' } {
  const [h, m] = time24.split(':').map(Number)
  let hour = h
  let period: 'AM' | 'PM' = 'AM'

  if (h >= 12) {
    period = 'PM'
    if (h > 12) hour = h - 12
  } else if (h === 0) {
    hour = 12
  }

  return {
    hour: String(hour),
    minute: String(m).padStart(2, '0'),
    period,
  }
}

export default function RemindersCard({
  prescriptions,
  reminderTimes,
  onReminderTimesChange,
}: RemindersCardProps) {
  const [formMedicine,    setFormMedicine]    = useState('')
  const [formDuration,    setFormDuration]    = useState('')
  const [formHour,        setFormHour]        = useState('08')
  const [formMinute,      setFormMinute]      = useState('00')
  const [formPeriod,      setFormPeriod]      = useState<'AM' | 'PM'>('AM')
  const [formMealAssoc,   setFormMealAssoc]   = useState('')

  const activePrescriptions = prescriptions.filter((rx) => !rx.isDeleted)

  const handleAddReminder = () => {
    if (!formMedicine.trim() || !formHour.trim() || !formMinute.trim()) return

    // Convert to 24-hour format for storage
    const time24 = convertTo24Hour(formHour, formMinute, formPeriod)

    const newReminder: MedicineReminderTime = {
      localId:         crypto.randomUUID(),
      medicineName:    formMedicine,
      time:            time24,
      duration:        formDuration || undefined,
      mealAssociation: formMealAssoc || undefined,
    }
    onReminderTimesChange([...reminderTimes, newReminder])
    setFormMedicine('')
    setFormDuration('')
    setFormHour('08')
    setFormMinute('00')
    setFormPeriod('AM')
    setFormMealAssoc('')
  }

  const handleRemoveReminder = (localId: string) =>
    onReminderTimesChange(reminderTimes.filter((r) => r.localId !== localId))

  // Group reminders by medicine for display
  const remindersByMedicine = reminderTimes.reduce(
    (acc, reminder) => {
      if (!acc[reminder.medicineName]) acc[reminder.medicineName] = []
      acc[reminder.medicineName].push(reminder)
      return acc
    },
    {} as Record<string, MedicineReminderTime[]>,
  )

  // Format time for display (convert from 24-hour to 12-hour)
  const formatTimeDisplay = (time24: string) => {
    const { hour, minute, period } = convertTo12Hour(time24)
    return `${hour}:${minute} ${period}`
  }

  return (
    <div className="flex flex-col gap-12">
      {/* Header */}
      <div className="space-y-2">
        <h2 className="text-lg font-semibold text-foreground">Medicine Reminders</h2>
        <p className="text-sm text-muted-foreground">
          Set reminder times for each medicine. WhatsApp reminders will be sent at these times.
        </p>
      </div>

      {/* Empty state */}
      {activePrescriptions.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/20 py-12">
          <Clock className="h-8 w-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            Add medicines in the previous step to schedule reminders.
          </p>
        </div>
      ) : (
        <>
          {/* Add reminder form — increased spacing and padding */}
          <div className="space-y-8 rounded-lg border border-border bg-muted/20 p-10">
            <h3 className="text-sm font-semibold text-foreground">Add reminder time</h3>

            {/* Row 1: Medicine (full width) */}
            <div className="flex flex-col gap-3">
              <Label htmlFor="pv-reminder-med" className="text-sm font-medium">
                Medicine
              </Label>
              <Select value={formMedicine} onValueChange={setFormMedicine}>
                <SelectTrigger id="pv-reminder-med" className="h-11">
                  <SelectValue placeholder="Select medicine" />
                </SelectTrigger>
                <SelectContent>
                  {activePrescriptions.map((rx) => (
                    <SelectItem key={rx.localId} value={rx.medicineName}>
                      <span>{rx.medicineName}</span>
                      {rx.dosage && (
                        <span className="text-xs text-muted-foreground ml-2">
                          {rx.dosage}
                        </span>
                      )}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Row 2: Duration (full width) */}
            <div className="flex flex-col gap-3">
              <Label htmlFor="pv-reminder-duration" className="text-sm font-medium">
                Duration (days)
              </Label>
              <Input
                id="pv-reminder-duration"
                type="number"
                min={1}
                placeholder="e.g. 7"
                value={formDuration}
                onChange={(e) => setFormDuration(e.target.value)}
                className="h-11 text-base"
              />
            </div>

            {/* Row 3: Time section (full width) */}
            <div className="flex flex-col gap-3">
              <Label className="text-sm font-medium">Time</Label>
              <div className="flex gap-3 items-end">
                {/* Hour */}
                <div className="flex flex-col gap-2 flex-1">
                  <Input
                    type="number"
                    min="1"
                    max="12"
                    step="1"
                    value={formHour}
                    onChange={(e) => {
                      const val = Math.min(12, Math.max(1, parseInt(e.target.value, 10) || 1))
                      setFormHour(String(val))
                    }}
                    className="h-11 text-center text-base"
                    placeholder="HH"
                  />
                  <span className="text-xs text-muted-foreground text-center">Hour</span>
                </div>

                {/* Separator */}
                <div className="pb-2">
                  <span className="text-2xl font-semibold text-foreground">:</span>
                </div>

                {/* Minute */}
                <div className="flex flex-col gap-2 flex-1">
                  <Input
                    type="number"
                    min="0"
                    max="59"
                    step="1"
                    value={formMinute}
                    onChange={(e) => {
                      const val = Math.min(59, Math.max(0, parseInt(e.target.value, 10) || 0))
                      setFormMinute(String(val).padStart(2, '0'))
                    }}
                    className="h-11 text-center text-base"
                    placeholder="MM"
                  />
                  <span className="text-xs text-muted-foreground text-center">Minute</span>
                </div>

                {/* AM/PM */}
                <div className="flex flex-col gap-2 flex-1">
                  <Select value={formPeriod} onValueChange={(v) => setFormPeriod(v as 'AM' | 'PM')}>
                    <SelectTrigger className="h-11">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="AM">AM</SelectItem>
                      <SelectItem value="PM">PM</SelectItem>
                    </SelectContent>
                  </Select>
                  <span className="text-xs text-muted-foreground text-center">Period</span>
                </div>
              </div>
            </div>

            {/* Row 4: Meal association (full width) */}
            <div className="flex flex-col gap-3">
              <Label htmlFor="pv-reminder-meal" className="text-sm font-medium">
                Meal association
              </Label>
              <Select value={formMealAssoc} onValueChange={setFormMealAssoc}>
                <SelectTrigger id="pv-reminder-meal" className="h-11">
                  <SelectValue placeholder="Select timing (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {MEAL_ASSOCIATIONS.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Add button */}
            <div className="pt-4">
              <Button onClick={handleAddReminder} className="w-full sm:w-auto" size="lg">
                <Plus className="mr-2 h-4 w-4" />
                Add reminder
              </Button>
            </div>
          </div>

          {/* Scheduled reminders */}
          {reminderTimes.length > 0 && (
            <div className="space-y-6">
              <h3 className="text-sm font-semibold text-foreground">Scheduled reminders</h3>

              <div className="flex flex-col gap-6">
                {activePrescriptions.map((rx) => {
                  const timesForMedicine = remindersByMedicine[rx.medicineName] ?? []
                  if (timesForMedicine.length === 0) return null

                  return (
                    <div
                      key={rx.localId}
                      className="rounded-lg border border-border bg-background/50 p-6"
                    >
                      <div className="mb-6 flex items-center gap-3">
                        <Clock className="h-5 w-5 text-primary" />
                        <div>
                          <p className="font-semibold text-foreground">{rx.medicineName}</p>
                          {rx.dosage && (
                            <p className="text-xs text-muted-foreground">{rx.dosage}</p>
                          )}
                        </div>
                      </div>

                      <div className="space-y-3">
                        {timesForMedicine.map((reminder) => (
                          <div
                            key={reminder.localId}
                            className="flex items-center justify-between rounded-lg bg-muted/50 px-4 py-3"
                          >
                            <div className="flex flex-col gap-1">
                              <span className="font-mono text-sm font-semibold text-foreground">
                                {formatTimeDisplay(reminder.time)}
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {reminder.mealAssociation && (
                                  <span className="text-xs text-muted-foreground">
                                    {MEAL_ASSOCIATIONS.find((m) => m.value === reminder.mealAssociation)?.label}
                                  </span>
                                )}
                                {reminder.duration && (
                                  <span className="text-xs text-muted-foreground">
                                    {reminder.duration} day{reminder.duration !== '1' ? 's' : ''}
                                  </span>
                                )}
                              </div>
                            </div>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-7 w-7 shrink-0 text-muted-foreground hover:text-foreground"
                              onClick={() => handleRemoveReminder(reminder.localId)}
                              aria-label={`Remove reminder at ${formatTimeDisplay(reminder.time)}`}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}