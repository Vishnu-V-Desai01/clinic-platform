// src/app/(app)/dashboard/settings/page.tsx

export const dynamic = 'force-dynamic';

import { Settings } from 'lucide-react';
import { getOrCreateProfile } from '@/lib/supabase/profile';
import { getClinicSettings } from '@/features/clinic/actions';
import ClinicSettingsForm from '@/features/clinic/components/clinic-settings-form';

export const metadata = { title: 'Clinic Settings' };

export default async function SettingsPage() {
  const profile = await getOrCreateProfile();

  if (!profile || !['doctor', 'staff'].includes(profile.role)) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">Access restricted.</p>
      </div>
    );
  }

  const clinic = await getClinicSettings();

  if (!clinic) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <p className="text-muted-foreground">
          Clinic record not found. Run the seed migration and try again.
        </p>
      </div>
    );
  }

  const canEdit = profile.role === 'doctor';

  return (
    <div className="p-4 md:p-8">
      <div className="max-w-2xl mx-auto">
        <div className="flex items-center gap-3 mb-8">
          <div className="flex size-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Settings className="size-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-foreground">
              Clinic Settings
            </h1>
            <p className="text-sm text-muted-foreground">
              {canEdit
                ? 'Configure your clinic identity — stamped on every receipt'
                : 'Clinic configuration — view only'}
            </p>
          </div>
        </div>

        <ClinicSettingsForm clinic={clinic} canEdit={canEdit} />
      </div>
    </div>
  );
}