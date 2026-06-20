// src/app/(app)/patients/[patientId]/page.tsx

import { Suspense } from 'react';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile, requireRole } from '@/lib/supabase/profile';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Pill, Calendar, DollarSign } from 'lucide-react';
import { CarePlanView } from '@/features/care-plans/components/care-plan-view';

interface PatientDetailPageProps {
  params: Promise<{ patientId: string }>;
}

async function PatientInfo({ patientId }: { patientId: string }) {
  const supabase = await createServerSupabaseClient();
  await requireRole('doctor', 'staff', 'patient');

  const { data: patient, error } = await supabase
    .from('patients')
    .select('id, mrn, first_name, last_name, date_of_birth')
    .eq('id', patientId)
    .single();

  if (error || !patient) {
    return null;
  }

  const fullName = `${patient.first_name || ''} ${patient.last_name || ''}`.trim();
  const mrn = patient.mrn || 'N/A';

  return (
    <div className="space-y-2">
      <h1 className="text-3xl font-bold text-foreground">{fullName}</h1>
      <p className="text-sm text-muted-foreground">MRN: {mrn}</p>
    </div>
  );
}

export default async function PatientDetailPage({ params }: PatientDetailPageProps) {
  const { patientId } = await params;

  return (
    <div className="flex flex-col gap-6">
      <Suspense fallback={<div className="h-12 animate-pulse rounded bg-muted" />}>
        <PatientInfo patientId={patientId} />
      </Suspense>

      <Tabs defaultValue="overview" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Overview</span>
          </TabsTrigger>
          <TabsTrigger value="medical-records" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Records</span>
          </TabsTrigger>
          <TabsTrigger value="care-plan" className="flex items-center gap-2">
            <Pill className="h-4 w-4" />
            <span className="hidden sm:inline">Care Plan</span>
          </TabsTrigger>
          <TabsTrigger value="appointments" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Appointments</span>
          </TabsTrigger>
          <TabsTrigger value="payments" className="flex items-center gap-2">
            <DollarSign className="h-4 w-4" />
            <span className="hidden sm:inline">Payments</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="overview" className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-muted-foreground">Patient overview coming soon.</p>
          </div>
        </TabsContent>

        <TabsContent value="medical-records" className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-muted-foreground">Medical records view coming soon.</p>
          </div>
        </TabsContent>

        <TabsContent value="care-plan" className="space-y-4">
          <Suspense
            fallback={
              <div className="rounded-lg border border-border bg-background p-8 text-center">
                <p className="text-muted-foreground">Loading care plan...</p>
              </div>
            }
          >
            <CarePlanView patientId={patientId} />
          </Suspense>
        </TabsContent>

        <TabsContent value="appointments" className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-muted-foreground">Appointments view coming soon.</p>
          </div>
        </TabsContent>

        <TabsContent value="payments" className="space-y-4">
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-muted-foreground">Payments view coming soon.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}