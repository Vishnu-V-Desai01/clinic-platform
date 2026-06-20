// src/features/care-plans/components/follow-ups-section.tsx

'use client';

import { useState } from 'react';
import { CalendarCheck, Plus, Pencil, Trash2, Calendar } from 'lucide-react';
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
import { addFollowUp, updateFollowUp, deleteFollowUp } from '../actions';
import { CarePlanFollowUp } from '../types';
import { CarePlanFollowUpFormData } from '../schema';

interface FollowUpsSectionProps {
  carePlanId: string;
  followUps: CarePlanFollowUp[];
}

const formatDate = (isoString: string | null): string => {
  if (!isoString) return 'N/A';
  const formatter = new Intl.DateTimeFormat('en-IN', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
  return formatter.format(new Date(isoString));
};

const getPriorityColor = (
  priority: string | null
): { dot: string; label: string } => {
  switch (priority) {
    case 'high':
      return { dot: 'bg-red-500', label: 'High' };
    case 'medium':
      return { dot: 'bg-amber-500', label: 'Medium' };
    case 'low':
      return { dot: 'bg-muted-foreground', label: 'Low' };
    default:
      return { dot: 'bg-muted-foreground', label: 'None' };
  }
};

const getStatusBadgeColor = (
  status: 'pending' | 'completed' | 'cancelled'
): string => {
  switch (status) {
    case 'completed':
      return 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-400';
    case 'cancelled':
      return 'bg-red-500/15 text-red-700 dark:text-red-400';
    case 'pending':
    default:
      return 'bg-amber-500/15 text-amber-700 dark:text-amber-400';
  }
};

// Sentinel value for the Select component since SelectItem can't have value=""
const NONE_VALUE = 'none';

export function FollowUpsSection({ carePlanId, followUps }: FollowUpsSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<CarePlanFollowUpFormData>({
    description: '',
    scheduled_date: null,
    priority: null,
    status: 'pending',
  });

  const isEditMode = editingId !== null;
  const dialogTitle = isEditMode ? 'Edit Follow-up' : 'Add Follow-up';

  const resetForm = () => {
    setFormData({
      description: '',
      scheduled_date: null,
      priority: null,
      status: 'pending',
    });
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (followUp: CarePlanFollowUp) => {
    setFormData({
      description: followUp.description,
      scheduled_date: followUp.scheduled_date,
      priority: (followUp.priority as 'high' | 'medium' | 'low' | null) || null,
      status: followUp.status,
    });
    setEditingId(followUp.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.description.trim()) {
      return;
    }

    try {
      setIsLoading(true);
      if (isEditMode && editingId) {
        await updateFollowUp(editingId, formData);
      } else {
        await addFollowUp(carePlanId, formData);
      }
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving follow-up:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this follow-up?')) {
      return;
    }

    try {
      setIsLoading(true);
      await deleteFollowUp(id);
    } catch (error) {
      console.error('Error deleting follow-up:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleToggleStatus = async (followUp: CarePlanFollowUp) => {
    const newStatus: 'pending' | 'completed' | 'cancelled' =
      followUp.status === 'pending' ? 'completed' : 'pending';

    try {
      setIsLoading(true);
      await updateFollowUp(followUp.id, {
        description: followUp.description,
        scheduled_date: followUp.scheduled_date,
        priority: (followUp.priority as 'high' | 'medium' | 'low' | null) || null,
        status: newStatus,
      });
    } catch (error) {
      console.error('Error toggling follow-up status:', error);
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
            <CalendarCheck className="h-5 w-5 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold text-foreground">Follow-ups</h3>
            <span className="text-sm text-muted-foreground">({followUps.length})</span>
          </div>
        </div>

        <Button onClick={handleOpenAdd} size="sm" className="gap-2" disabled={isLoading}>
          <Plus className="h-4 w-4" />
          Add Follow-up
        </Button>
      </div>

      {/* Follow-ups List */}
      {followUps.length > 0 ? (
        <div className="space-y-2">
          {followUps.map((followUp) => {
            const priorityColor = getPriorityColor(followUp.priority);
            const isCompleted = followUp.status === 'completed';

            return (
              <Card key={followUp.id} className="p-4">
                <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  {/* Left: Description + Date + Priority */}
                  <div className="flex-1 space-y-1">
                    <p
                      className={`font-medium ${
                        isCompleted
                          ? 'line-through text-muted-foreground'
                          : 'text-foreground'
                      }`}
                    >
                      {followUp.description}
                    </p>
                    <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
                      {followUp.scheduled_date && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <Calendar className="h-4 w-4" />
                          {formatDate(followUp.scheduled_date)}
                        </div>
                      )}
                      {followUp.priority && (
                        <div className="flex items-center gap-1.5 text-sm text-muted-foreground">
                          <span
                            className={`inline-block h-2 w-2 rounded-full ${priorityColor.dot}`}
                          />
                          {priorityColor.label}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Right: Status Badge + Actions */}
                  <div className="flex items-center gap-2 sm:gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleToggleStatus(followUp)}
                      disabled={isLoading}
                      className={getStatusBadgeColor(followUp.status)}
                    >
                      {followUp.status.charAt(0).toUpperCase() +
                        followUp.status.slice(1)}
                    </Button>

                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleOpenEdit(followUp)}
                      disabled={isLoading}
                      className="h-8 w-8 p-0"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleDelete(followUp.id)}
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
          <CalendarCheck className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No follow-ups scheduled</p>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Description */}
            <div className="space-y-2">
              <Label htmlFor="description">Description *</Label>
              <Input
                id="description"
                placeholder="e.g., Review blood sugar levels"
                value={formData.description}
                onChange={(e) =>
                  setFormData({ ...formData, description: e.target.value })
                }
                disabled={isLoading}
              />
            </div>

            {/* Scheduled Date */}
            <div className="space-y-2">
              <Label htmlFor="scheduled-date">Scheduled Date</Label>
              <Input
                id="scheduled-date"
                type="date"
                value={formData.scheduled_date ?? ''}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    scheduled_date: e.target.value || null,
                  })
                }
                disabled={isLoading}
              />
            </div>

            {/* Priority */}
            <div className="space-y-2">
              <Label htmlFor="priority">Priority</Label>
              <Select
                value={formData.priority ?? NONE_VALUE}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    priority:
                      value === NONE_VALUE
                        ? null
                        : (value as 'high' | 'medium' | 'low'),
                  })
                }
                disabled={isLoading}
              >
                <SelectTrigger id="priority">
                  <SelectValue placeholder="Select priority" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  <SelectItem value="low">Low</SelectItem>
                  <SelectItem value="medium">Medium</SelectItem>
                  <SelectItem value="high">High</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Status */}
            <div className="space-y-2">
              <Label htmlFor="status">Status</Label>
              <Select
                value={formData.status}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    status: value as 'pending' | 'completed' | 'cancelled',
                  })
                }
                disabled={isLoading}
              >
                <SelectTrigger id="status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="cancelled">Cancelled</SelectItem>
                </SelectContent>
              </Select>
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
              disabled={isLoading || !formData.description.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}