// src/features/care-plans/components/suggestions-section.tsx

'use client';

import { useState } from 'react';
import { Lightbulb, Plus, Pencil, Trash2 } from 'lucide-react';
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
import { addSuggestion, updateSuggestion, deleteSuggestion } from '../actions';
import { CarePlanSuggestion } from '../types';
import { CarePlanSuggestionFormData } from '../schema';

interface SuggestionsSectionProps {
  carePlanId: string;
  suggestions: CarePlanSuggestion[];
}

const categoryColors: Record<string, string> = {
  lifestyle: 'bg-blue-500/15 text-blue-700 dark:text-blue-400',
  diet: 'bg-green-500/15 text-green-700 dark:text-green-400',
  exercise: 'bg-orange-500/15 text-orange-700 dark:text-orange-400',
  precaution: 'bg-red-500/15 text-red-700 dark:text-red-400',
};

// Sentinel value for the Select component since SelectItem can't have value=""
const NONE_VALUE = 'none';

export function SuggestionsSection({
  carePlanId,
  suggestions,
}: SuggestionsSectionProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [formData, setFormData] = useState<CarePlanSuggestionFormData>({
    suggestion_text: '',
    category: null,
  });

  const isEditMode = editingId !== null;
  const dialogTitle = isEditMode ? 'Edit Suggestion' : 'Add Suggestion';

  const resetForm = () => {
    setFormData({
      suggestion_text: '',
      category: null,
    });
    setEditingId(null);
  };

  const handleOpenAdd = () => {
    resetForm();
    setDialogOpen(true);
  };

  const handleOpenEdit = (suggestion: CarePlanSuggestion) => {
    setFormData({
      suggestion_text: suggestion.suggestion_text,
      category: (suggestion.category as
        | 'lifestyle'
        | 'diet'
        | 'exercise'
        | 'precaution'
        | null) || null,
    });
    setEditingId(suggestion.id);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.suggestion_text.trim()) {
      return;
    }

    try {
      setIsLoading(true);
      if (isEditMode && editingId) {
        await updateSuggestion(editingId, formData);
      } else {
        await addSuggestion(carePlanId, formData);
      }
      setDialogOpen(false);
      resetForm();
    } catch (error) {
      console.error('Error saving suggestion:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Are you sure you want to delete this suggestion?')) {
      return;
    }

    try {
      setIsLoading(true);
      await deleteSuggestion(id);
    } catch (error) {
      console.error('Error deleting suggestion:', error);
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
            <Lightbulb className="h-5 w-5 text-primary" />
          </div>
          <div className="flex items-baseline gap-2">
            <h3 className="font-semibold text-foreground">Suggestions</h3>
            <span className="text-sm text-muted-foreground">
              ({suggestions.length})
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
          Add Suggestion
        </Button>
      </div>

      {/* Suggestions List */}
      {suggestions.length > 0 ? (
        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <Card key={suggestion.id} className="p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <div className="flex-1 space-y-2">
                  <p className="text-foreground">{suggestion.suggestion_text}</p>
                  {suggestion.category && (
                    <Badge
                      className={
                        categoryColors[suggestion.category] ||
                        'bg-muted text-muted-foreground'
                      }
                    >
                      {suggestion.category.charAt(0).toUpperCase() +
                        suggestion.category.slice(1)}
                    </Badge>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleOpenEdit(suggestion)}
                    disabled={isLoading}
                    className="h-8 w-8 p-0"
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleDelete(suggestion.id)}
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
          <Lightbulb className="mx-auto mb-3 h-10 w-10 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">No suggestions added yet</p>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={handleDialogOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{dialogTitle}</DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            {/* Suggestion Text */}
            <div className="space-y-2">
              <Label htmlFor="suggestion-text">Suggestion *</Label>
              <Input
                id="suggestion-text"
                placeholder="e.g., Reduce salt intake and avoid processed foods"
                value={formData.suggestion_text}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    suggestion_text: e.target.value,
                  })
                }
                disabled={isLoading}
              />
            </div>

            {/* Category */}
            <div className="space-y-2">
              <Label htmlFor="category">Category</Label>
              <Select
                value={formData.category ?? NONE_VALUE}
                onValueChange={(value) =>
                  setFormData({
                    ...formData,
                    category:
                      value === NONE_VALUE
                        ? null
                        : (value as
                            | 'lifestyle'
                            | 'diet'
                            | 'exercise'
                            | 'precaution'),
                  })
                }
                disabled={isLoading}
              >
                <SelectTrigger id="category">
                  <SelectValue placeholder="Select category" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NONE_VALUE}>None</SelectItem>
                  <SelectItem value="lifestyle">Lifestyle</SelectItem>
                  <SelectItem value="diet">Diet</SelectItem>
                  <SelectItem value="exercise">Exercise</SelectItem>
                  <SelectItem value="precaution">Precaution</SelectItem>
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
              disabled={isLoading || !formData.suggestion_text.trim()}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}