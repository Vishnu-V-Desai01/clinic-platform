// src/features/care-plans/components/reminders-section.tsx

'use client';

import { useState } from 'react';
import { Bell, Plus, Pencil, Trash2, Pill, Calendar, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Card } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { addReminder, updateReminder, deleteReminder } from '../actions';
import { CarePlanReminder } from '../types';
import { CarePlanReminderFormData } from '../schema';

interface RemindersSectionProps {
  carePlanId: string;
  reminders: CarePlanReminder[];
}

const getTypeIcon = (type: 'medicine' | 'follow_up' | 'suggestion') => {
  switch (type) {
    case 'medicine':
      return Pill;
    case 'follow_up':
      return Calendar;
    case 'suggestion':
      return Clock;
    default:
      return Bell;
  }
};

const getTypeLabel = (type: 'medicine' | 'follow_up' | 'suggestion'): string => {
  switch (type) {
    case 'medicine':
      return 'Medication';
    case 'follow_up':
      return 'Follow-up';
    case 'suggestion':
      return 'Suggestion';
    default:
      return 'Reminder';
  }
};

export function RemindersSection({
  carePlanId,
  reminders,
}: RemindersSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<CarePlanReminderFormData>({
    reminder_type: 'medicine',
    target_id: null,
    reminder_text: '',
    frequency: '',
    start_date: null,
    end_date: null,
    enabled: true,
  });

  const isEditMode = editingId !== null;
  const dialogTitle = isEditMode ? 'Edit Reminder' : 'Add Reminder';

  const resetForm = () => {
    setFormData({
      reminder_type: 'medicine',
      target_id: null,
      reminder_text: '',
      frequency: '',
      start_date: null,
      end_date: null,
      enabled: true,
    });
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (reminder: CarePlanReminder) => {
    setFormData({
      reminder_type: (reminder.reminder_type as
        | 'medicine'
        | 'follow_up'
        | 'suggestion') || 'medicine',
      target_id: reminder.target_id,
      reminder_text: reminder.reminder_text,
      frequency: reminder.frequency,
      start_date: reminder.start_date,
      end_date: reminder.end_date,
      enabled: reminder.enabled,
    });
    setEditingId(reminder.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.reminder_text.trim() || !formData.frequency.trim()) {
      return;
    }

    try {
      setIsLoading(true);
      if (isEditMode && editingId) {
        await updateReminder(editingId, formData);
      } else {
        await addReminder(carePlanId, formData);
      }
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving reminder:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this reminder?')) {
      return;
    }

    try {
      setIsLoading(true);
      await deleteReminder(id);
    } catch (error) {
      console.error('Error deleting reminder:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleEnabled = async (reminder: CarePlanReminder) => {
    try {
      setIsLoading(true);
      await updateReminder(reminder.id, {
        reminder_type: (reminder.reminder_type as
          | 'medicine'
          | 'follow_up'
          | 'suggestion') || 'medicine',
        target_id: reminder.target_id,
        reminder_text: reminder.reminder_text,
        frequency: reminder.frequency,
        start_date: reminder.start_date,
        end_date: reminder.end_date,
        enabled: !reminder.enabled,
      });
    } catch (error) {
      console.error('Error toggling reminder:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    setDialogOpen(open);
    if (!open) {
      resetForm();
    }
  };

  return (
    <div className="w-full space-y-4">
      {/* Section Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
            <Bell className="h-5 w-5 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold text-foreground">Reminders</h3>
            <span className="text-sm text-muted-foreground">
              ({reminders.length})
            </span>
          </div>
        </div>

        <Button
          onClick={handleOpenAdd}
          size="sm"
          className="gap-2"
          disabled={isLoading}
        >
          <Plus className="h-4 w-4" />
          Add Reminder
        </Button>
      </div>

      {/* Reminders List */}
      {reminders.length > 0 ? (
        <div className="space-y-2">
          {reminders.map((reminder) => {
            const TypeIcon = getTypeIcon(
              reminder.reminder_type as 'medicine' | 'follow_up' | 'suggestion'
            );
            const typeLabel = getTypeLabel(
              reminder.reminder_type as 'medicine' | 'follow_up' | 'suggestion'
            );

            return (
              <Card
                key={reminder.id}
                className={`p-4 ${!reminder.enabled ? 'opacity-60' : ''}`}
              >
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: Icon + Type + Text + Frequency */}
                  <div className="flex items-start gap-3 flex-1">
                    <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary/10 mt-0.5">
                      <TypeIcon className="h-5 w-5 text-primary" />
                    </div>
                    <div className="flex-1 space-y-1">
                      <p className="font-medium text-foreground">
                        {reminder.reminder_text}
                      </p>
                      <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                        <Badge variant="secondary" className="w-fit">
                          {typeLabel}
                        </Badge>
                        <span className="text-sm text-muted-foreground">
                          {reminder.frequency}
                        </span>
                        {reminder.start_date && (
                          <span className="text-xs text-muted-foreground">
                            From {new Date(reminder.start_date).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Status Badge + Actions */}
                  <div className="flex items-center gap-2">
                    <Badge
                      variant={reminder.enabled ? 'default' : 'secondary'}
                      className={
                        reminder.enabled
                          ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400'
                          : 'bg-muted text-muted-foreground'
                      }
                    >
                      {reminder.enabled ? 'Enabled' : 'Disabled'}
                    </Badge>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleToggleEnabled(reminder)}
                      disabled={isLoading}
                      className="h-8 w-8 p-0"
                    >
                      {reminder.enabled ? 'Disable' : 'Enable'}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEdit(reminder)}
                      disabled={isLoading}
                      className="h-8 w-8 p-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(reminder.id)}
                      disabled={isLoading}
                      className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <Bell className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No reminders set up yet</p>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Type */}
            <div className="space-y-2">
              <Label htmlFor="reminder-type">Reminder Type *</Label>
              <Select
                value={formData.reminder_type}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    reminder_type: value as
                      | 'medicine'
                      | 'follow_up'
                      | 'suggestion',
                  })
                }
                disabled={isLoading}
              >
                <SelectTrigger id="reminder-type">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="medicine">Medication</SelectItem>
                  <SelectItem value="follow_up">Follow-up</SelectItem>
                  <SelectItem value="suggestion">Suggestion</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Reminder Text */}
            <div className="space-y-2">
              <Label htmlFor="reminder-text">Reminder Text *</Label>
              <Input
                id="reminder-text"
                placeholder="e.g., Take paracetamol 500mg"
                value={formData.reminder_text}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    reminder_text: e.target.value,
                  })
                }
                disabled={isLoading}
              />
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="frequency">Frequency *</Label>
              <Select
                value={formData.frequency}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    frequency: value,
                  })
                }
                disabled={isLoading}
              >
                <SelectTrigger id="frequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="daily">Daily</SelectItem>
                  <SelectItem value="twice daily">Twice daily</SelectItem>
                  <SelectItem value="weekly">Weekly</SelectItem>
                  <SelectItem value="monthly">Monthly</SelectItem>
                  <SelectItem value="once">Once</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Start Date */}
            <div className="space-y-2">
              <Label htmlFor="start-date">Start Date</Label>
              <Input
                id="start-date"
                type="date"
                value={formData.start_date ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    start_date: e.target.value || null,
                  })
                }
                disabled={isLoading}
              />
            </div>

            {/* End Date */}
            <div className="space-y-2">
              <Label htmlFor="end-date">End Date</Label>
              <Input
                id="end-date"
                type="date"
                value={formData.end_date ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    end_date: e.target.value || null,
                  })
                }
                disabled={isLoading}
              />
            </div>

            {/* Enabled */}
            <div className="space-y-2">
              <Label htmlFor="enabled" className="flex items-center gap-2">
                <input
                  id="enabled"
                  type="checkbox"
                  checked={formData.enabled}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      enabled: e.target.checked,
                    })
                  }
                  disabled={isLoading}
                  className="rounded border border-input bg-background"
                />
                <span>Enable this reminder</span>
              </Label>
            </div>
          </div>

          <DialogFooter className="gap-2">
            <Button
              variant="outline"
              onClick={() => handleDialogOpenChange(false)}
              disabled={isLoading}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSave}
              disabled={
                isLoading ||
                !formData.reminder_text.trim() ||
                !formData.frequency.trim()
              }
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}