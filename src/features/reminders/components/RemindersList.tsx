// src/features/reminders/components/RemindersList.tsx
'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { Pill, Plus, Trash2, Edit2 } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select'
import {
  listRemindersForPatient,
  addReminder,
  updateReminder,
  deleteReminder,
  type MedicineReminder,
  type AddReminderInput,
  type UpdateReminderInput,
} from '@/features/reminders/actions'

const MEAL_NONE = 'meal_none' // sentinel value for "no meal"

interface RemindersListProps {
  patientId: string
}

export default function RemindersList({ patientId }: RemindersListProps) {
  const router = useRouter()
  const [reminders, setReminders] = useState<MedicineReminder[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isAdding, setIsAdding] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // Modals
  const [showAddModal, setShowAddModal] = useState(false)
  const [showDeleteDialog, setShowDeleteDialog] = useState(false)
  const [editingReminder, setEditingReminder] = useState<MedicineReminder | null>(null)
  const [deletingReminderId, setDeletingReminderId] = useState<string | null>(null)

  // Form state
  const [formData, setFormData] = useState({
    medicineName: '',
    reminderTime: '',
    mealAssociation: '',
    durationDays: '',
  })

  // Load reminders on mount
  useEffect(() => {
    loadReminders()
  }, [patientId])

  async function loadReminders() {
    setIsLoading(true)
    setError(null)
    const result = await listRemindersForPatient(patientId)
    if (result.success) {
      setReminders(result.data)
    } else {
      setError(result.error)
    }
    setIsLoading(false)
  }

  function openAddModal() {
    setFormData({
      medicineName: '',
      reminderTime: '',
      mealAssociation: '',
      durationDays: '',
    })
    setEditingReminder(null)
    setShowAddModal(true)
  }

  function openEditModal(reminder: MedicineReminder) {
    setFormData({
      medicineName: reminder.medicine_name,
      reminderTime: reminder.reminder_time,
      mealAssociation: reminder.meal_association || '',
      durationDays: reminder.duration_days ? String(reminder.duration_days) : '',
    })
    setEditingReminder(reminder)
    setShowAddModal(true)
  }

  async function handleSave() {
    setError(null)

    if (!formData.medicineName.trim()) {
      setError('Medicine name is required')
      return
    }
    if (!formData.reminderTime.match(/^\d{2}:\d{2}$/)) {
      setError('Time must be in HH:MM format')
      return
    }

    setIsAdding(true)

    try {
      if (editingReminder) {
        // Update
        const input: UpdateReminderInput = {
          reminderId: editingReminder.id,
        }
        if (formData.reminderTime !== editingReminder.reminder_time) {
          input.reminderTime = formData.reminderTime
        }
        if (formData.mealAssociation !== (editingReminder.meal_association || '')) {
          input.mealAssociation = formData.mealAssociation || null
        }
        const durationDays = formData.durationDays ? parseInt(formData.durationDays, 10) : null
        if (durationDays !== editingReminder.duration_days) {
          input.durationDays = durationDays
        }

        const result = await updateReminder(input)
        if (result.success) {
          setShowAddModal(false)
          await loadReminders()
          router.refresh()
        } else {
          setError(result.error)
        }
      } else {
        // Create
        const input: AddReminderInput = {
          patientId,
          medicineName: formData.medicineName,
          reminderTime: formData.reminderTime,
          mealAssociation: formData.mealAssociation || undefined,
          durationDays: formData.durationDays ? parseInt(formData.durationDays, 10) : null,
        }

        const result = await addReminder(input)
        if (result.success) {
          setShowAddModal(false)
          await loadReminders()
          router.refresh()
        } else {
          setError(result.error)
        }
      }
    } finally {
      setIsAdding(false)
    }
  }

  async function handleDelete(reminderId: string) {
    setError(null)
    setIsDeleting(true)

    try {
      console.log('[RemindersList] Deleting reminder:', reminderId)
      const result = await deleteReminder(reminderId)
      console.log('[RemindersList] Delete result:', result)

      if (result.success) {
        console.log('[RemindersList] Delete succeeded, removing from UI')

        // Immediately update local state
        const updated = reminders.filter((r) => r.id !== reminderId)
        setReminders(updated)

        // Close dialog
        setShowDeleteDialog(false)
        setDeletingReminderId(null)
        setIsDeleting(false)

        // Refresh page
        router.refresh()
      } else {
        console.error('[RemindersList] Delete failed:', result.error)
        setError(result.error)
        setIsDeleting(false)
      }
    } catch (err) {
      console.error('[RemindersList] Delete threw error:', err)
      setError(String(err))
      setIsDeleting(false)
    }
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-md bg-primary/10 text-primary">
              <Pill className="size-5" />
            </div>
            <CardTitle className="text-base font-semibold">Medicine Reminders</CardTitle>
          </div>
          <Button size="sm" onClick={openAddModal} disabled={isAdding || isDeleting}>
            <Plus className="size-4 mr-2" />
            Add Reminder
          </Button>
        </div>
      </CardHeader>

      <CardContent>
        {error && (
          <div className="mb-4 p-3 rounded-md bg-destructive/10 text-destructive text-sm">
            {error}
          </div>
        )}

        {isLoading ? (
          <p className="text-sm text-muted-foreground text-center py-8">Loading reminders...</p>
        ) : reminders.length === 0 ? (
          <div className="text-center py-8">
            <Pill className="mx-auto size-8 text-muted-foreground mb-2 opacity-50" />
            <p className="text-sm text-muted-foreground">No medicine reminders set yet</p>
            <Button size="sm" variant="outline" onClick={openAddModal} className="mt-3">
              Add First Reminder
            </Button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Medicine</TableHead>
                  <TableHead>Time</TableHead>
                  <TableHead>Meal</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {reminders.map((reminder) => (
                  <TableRow key={reminder.id}>
                    <TableCell className="font-medium">{reminder.medicine_name}</TableCell>
                    <TableCell>
                      <Badge variant="outline">{reminder.reminder_time}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {reminder.meal_association ? reminder.meal_association.replace(/_/g, ' ') : '—'}
                    </TableCell>
                    <TableCell className="text-sm">
                      {reminder.duration_days ? `${reminder.duration_days} days` : 'Ongoing'}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => openEditModal(reminder)}
                          disabled={isAdding || isDeleting}
                        >
                          <Edit2 className="size-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setDeletingReminderId(reminder.id)
                            setShowDeleteDialog(true)
                          }}
                          disabled={isAdding || isDeleting}
                        >
                          <Trash2 className="size-4 text-destructive" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>

      {/* Add/Edit Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingReminder ? 'Edit Reminder' : 'Add Medicine Reminder'}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="medicine">Medicine Name</Label>
              <Input
                id="medicine"
                value={formData.medicineName}
                onChange={(e) => setFormData({ ...formData, medicineName: e.target.value })}
                placeholder="e.g., Aspirin"
                disabled={editingReminder !== null}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="time">Reminder Time (HH:MM)</Label>
              <Input
                id="time"
                value={formData.reminderTime}
                onChange={(e) => setFormData({ ...formData, reminderTime: e.target.value })}
                placeholder="08:00"
                type="time"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="meal">Meal Association (Optional)</Label>
              <Select
                value={formData.mealAssociation || MEAL_NONE}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    mealAssociation: value === MEAL_NONE ? '' : value,
                  })
                }
              >
                <SelectTrigger id="meal">
                  <SelectValue placeholder="Select meal..." />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={MEAL_NONE}>None</SelectItem>
                  <SelectItem value="before_breakfast">Before Breakfast</SelectItem>
                  <SelectItem value="after_breakfast">After Breakfast</SelectItem>
                  <SelectItem value="before_lunch">Before Lunch</SelectItem>
                  <SelectItem value="after_lunch">After Lunch</SelectItem>
                  <SelectItem value="before_dinner">Before Dinner</SelectItem>
                  <SelectItem value="after_dinner">After Dinner</SelectItem>
                  <SelectItem value="before_night">Before Night</SelectItem>
                  <SelectItem value="after_night">After Night</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label htmlFor="duration">Duration (Days) — Leave blank for ongoing</Label>
              <Input
                id="duration"
                value={formData.durationDays}
                onChange={(e) => setFormData({ ...formData, durationDays: e.target.value })}
                placeholder="e.g., 7 for one week"
                type="number"
                min="1"
              />
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddModal(false)} disabled={isAdding}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={isAdding}>
              {isAdding
                ? editingReminder
                  ? 'Updating...'
                  : 'Adding...'
                : editingReminder
                  ? 'Update Reminder'
                  : 'Add Reminder'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <Dialog open={showDeleteDialog} onOpenChange={(open) => {
        if (!isDeleting) {
          setShowDeleteDialog(open)
        }
      }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Delete Reminder?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This reminder will be permanently removed. Patients won't receive this medicine
            reminder anymore.
          </p>
          {error && (
            <div className="p-3 rounded-md bg-destructive/10 text-destructive text-sm">
              {error}
            </div>
          )}
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setShowDeleteDialog(false)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingReminderId && handleDelete(deletingReminderId)}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  )
}