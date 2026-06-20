// src/features/care-plans/components/medicines-section.tsx

'use client';

import { useState } from 'react';
import { Plus, Pencil, Trash2, Pill } from 'lucide-react';
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
import { addMedicine, updateMedicine, deleteMedicine } from '../actions';
import { CarePlanMedicine } from '../types';
import { CarePlanMedicineFormData } from '../schema';

interface MedicinesSectionProps {
  carePlanId: string;
  medicines: CarePlanMedicine[];
}

export function MedicinesSection({ carePlanId, medicines }: MedicinesSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<CarePlanMedicineFormData>({
    medicine_name: '',
    strength: null,
    unit: null,
    frequency: '',
    duration_value: null,
    duration_unit: null,
    instructions: null,
  });

  const isEditMode = editingId !== null;
  const dialogTitle = isEditMode ? 'Edit Medicine' : 'Add Medicine';

  const resetForm = () => {
    setFormData({
      medicine_name: '',
      strength: null,
      unit: null,
      frequency: '',
      duration_value: null,
      duration_unit: null,
      instructions: null,
    });
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (medicine: CarePlanMedicine) => {
    setFormData({
      medicine_name: medicine.medicine_name,
      strength: medicine.strength,
      unit: medicine.unit,
      frequency: medicine.frequency,
      duration_value: medicine.duration_value,
      duration_unit: (medicine.duration_unit as
        | 'days'
        | 'weeks'
        | 'months'
        | 'ongoing'
        | null) || null,
      instructions: medicine.instructions,
    });
    setEditingId(medicine.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.medicine_name.trim() || !formData.frequency.trim()) {
      return;
    }

    try {
      setIsLoading(true);
      if (isEditMode && editingId) {
        await updateMedicine(editingId, formData);
      } else {
        await addMedicine(carePlanId, formData);
      }
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving medicine:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this medicine?')) {
      return;
    }

    try {
      setIsLoading(true);
      await deleteMedicine(id);
    } catch (error) {
      console.error('Error deleting medicine:', error);
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
            <Pill className="h-5 w-5 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold text-foreground">Medicines</h3>
            <span className="text-sm text-muted-foreground">({medicines.length})</span>
          </div>
        </div>

        <Button onClick={handleOpenAdd} size="sm" className="gap-2" disabled={isLoading}>
          <Plus className="h-4 w-4" />
          Add Medicine
        </Button>
      </div>

      {/* Medicine List */}
      {medicines.length > 0 ? (
        <div className="space-y-2">
          {medicines.map((medicine) => (
            <Card key={medicine.id} className="p-4">
              <div className="flex flex-col justify-between gap-3 sm:flex-row sm:items-center">
                <div className="flex-1">
                  <h4 className="font-medium text-foreground">{medicine.medicine_name}</h4>
                  <p className="text-sm text-muted-foreground">
                    {[medicine.strength, medicine.unit].filter(Boolean).join(' ')} · {medicine.frequency}
                    {medicine.duration_value &&
                      ` · ${medicine.duration_value} ${medicine.duration_unit}`}
                  </p>
                  {medicine.instructions && (
                    <p className="mt-1 text-xs text-muted-foreground">
                      Instructions: {medicine.instructions}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(medicine)}
                    disabled={isLoading}
                    className="h-8 w-8 p-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(medicine.id)}
                    disabled={isLoading}
                    className="h-8 w-8 p-0 text-destructive hover:text-destructive"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      ) : (
        <Card className="p-8 text-center">
          <Pill className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No medicines added yet</p>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Medicine Name */}
            <div className="space-y-2">
              <Label htmlFor="medicine-name">Medicine Name *</Label>
              <Input
                id="medicine-name"
                placeholder="e.g., Metformin"
                value={formData.medicine_name}
                onChange={(e) =>
                  setFormData({ ...formData, medicine_name: e.target.value })
                }
                disabled={isLoading}
              />
            </div>

            {/* Strength & Unit */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="medicine-strength">Strength</Label>
                <Input
                  id="medicine-strength"
                  placeholder="e.g., 500"
                  value={formData.strength ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, strength: e.target.value || null })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="medicine-unit">Unit</Label>
                <Input
                  id="medicine-unit"
                  placeholder="e.g., mg"
                  value={formData.unit ?? ''}
                  onChange={(e) =>
                    setFormData({ ...formData, unit: e.target.value || null })
                  }
                  disabled={isLoading}
                />
              </div>
            </div>

            {/* Frequency */}
            <div className="space-y-2">
              <Label htmlFor="medicine-frequency">Frequency *</Label>
              <Select
                value={formData.frequency}
                onValueChange={(value) =>
                  setFormData({ ...formData, frequency: value })
                }
                disabled={isLoading}
              >
                <SelectTrigger id="medicine-frequency">
                  <SelectValue placeholder="Select frequency" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="once daily">Once daily</SelectItem>
                  <SelectItem value="twice daily">Twice daily</SelectItem>
                  <SelectItem value="thrice daily">Thrice daily</SelectItem>
                  <SelectItem value="as needed">As needed</SelectItem>
                  <SelectItem value="nightly">Nightly</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Duration */}
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="duration-value">Duration</Label>
                <Input
                  id="duration-value"
                  type="number"
                  placeholder="e.g., 30"
                  value={formData.duration_value ?? ''}
                  onChange={(e) =>
                    setFormData({
                      ...formData,
                      duration_value: e.target.value
                        ? parseInt(e.target.value)
                        : null,
                    })
                  }
                  disabled={isLoading}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="duration-unit">Unit</Label>
                <Select
                  value={formData.duration_unit ?? ''}
                  onValueChange={(value) =>
                    setFormData({
                      ...formData,
                      duration_unit: (value as
                        | 'days'
                        | 'weeks'
                        | 'months'
                        | 'ongoing') || null,
                    })
                  }
                  disabled={isLoading}
                >
                  <SelectTrigger id="duration-unit">
                    <SelectValue placeholder="Select unit" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="days">Days</SelectItem>
                    <SelectItem value="weeks">Weeks</SelectItem>
                    <SelectItem value="months">Months</SelectItem>
                    <SelectItem value="ongoing">Ongoing</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            {/* Instructions */}
            <div className="space-y-2">
              <Label htmlFor="medicine-instructions">Instructions</Label>
              <Input
                id="medicine-instructions"
                placeholder="e.g., With food, after meals"
                value={formData.instructions ?? ''}
                onChange={(e) =>
                  setFormData({ ...formData, instructions: e.target.value || null })
                }
                disabled={isLoading}
              />
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
                !formData.medicine_name.trim() ||
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