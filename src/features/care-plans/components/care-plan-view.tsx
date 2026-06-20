// src/features/care-plans/components/care-plan-view.tsx

'use client';

import { useEffect, useState } from 'react';
import { getCarePlanForPatient, createOrUpdateCarePlan } from '../actions';
import { CarePlanWithDetails } from '../types';
import { Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MedicinesSection } from './medicines-section';
import { FollowUpsSection } from './follow-ups-section';
import { SuggestionsSection } from './suggestions-section';
import { RemindersSection } from './reminders-section';

interface CarePlanViewProps {
  patientId: string;
}

export function CarePlanView({ patientId }: CarePlanViewProps) {
  const [carePlan, setCarePlan] = useState<CarePlanWithDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);

  useEffect(() => {
    const fetchCarePlan = async () => {
      try {
        setLoading(true);
        setError(null);
        const plan = await getCarePlanForPatient(patientId);
        setCarePlan(plan);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load care plan');
      } finally {
        setLoading(false);
      }
    };

    fetchCarePlan();
  }, [patientId]);

  const handleCreateCarePlan = async () => {
    try {
      setIsCreating(true);
      setError(null);
      const newPlan = await createOrUpdateCarePlan(patientId, {});
      // Refetch to get the full plan with related data
      const fullPlan = await getCarePlanForPatient(patientId);
      setCarePlan(fullPlan);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create care plan');
    } finally {
      setIsCreating(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <Card className="border-destructive bg-destructive/10">
        <CardHeader>
          <CardTitle className="text-destructive">Error Loading Care Plan</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-destructive">{error}</p>
        </CardContent>
      </Card>
    );
  }

  if (!carePlan) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Care Plan Found</CardTitle>
          <CardDescription>Create a care plan to start managing medicines, follow-ups, and reminders.</CardDescription>
        </CardHeader>
        <CardContent>
          <Button
            onClick={handleCreateCarePlan}
            disabled={isCreating}
            className="gap-2"
          >
            {isCreating ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Creating...
              </>
            ) : (
              'Create Care Plan'
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Care Plan Header */}
      <Card>
        <CardHeader>
          <CardTitle>Care Plan</CardTitle>
          <CardDescription>
            Created on {new Date(carePlan.created_at).toLocaleDateString()}
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Care Plan Tabs */}
      <Tabs defaultValue="medicines" className="w-full">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="medicines">Medicines</TabsTrigger>
          <TabsTrigger value="follow-ups">Follow-ups</TabsTrigger>
          <TabsTrigger value="suggestions">Suggestions</TabsTrigger>
          <TabsTrigger value="reminders">Reminders</TabsTrigger>
        </TabsList>

        <TabsContent value="medicines" className="space-y-4">
          <MedicinesSection carePlanId={carePlan.id} medicines={carePlan.medicines} />
        </TabsContent>

        <TabsContent value="follow-ups" className="space-y-4">
          <FollowUpsSection carePlanId={carePlan.id} followUps={carePlan.follow_ups} />
        </TabsContent>

        <TabsContent value="suggestions" className="space-y-4">
          <SuggestionsSection
            carePlanId={carePlan.id}
            suggestions={carePlan.suggestions}
          />
        </TabsContent>

        <TabsContent value="reminders" className="space-y-4">
          <RemindersSection carePlanId={carePlan.id} reminders={carePlan.reminders} />
        </TabsContent>
      </Tabs>
    </div>
  );
}