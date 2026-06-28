// src/features/clinic/actions.ts

'use server';

import { revalidatePath } from 'next/cache';
import { createServerSupabaseClient } from '@/lib/supabase/server';
import { getOrCreateProfile, requireRole } from '@/lib/supabase/profile';
import { UpdateClinicSettingsSchema } from './schema';
import type { ClinicSettings } from './types';
import type { z } from 'zod';

export async function getClinicSettings(): Promise<ClinicSettings | null> {
  const supabase = createServerSupabaseClient();
  const profile = await getOrCreateProfile();
  if (!profile) return null;

  await requireRole('doctor', 'staff');

  const { data, error } = await supabase
    .from('clinics')
    .select('*')
    .eq('id', profile.clinic_id)
    .single();

  if (error || !data) {
    console.error('[getClinicSettings]', error);
    return null;
  }

  return data as ClinicSettings;
}

export async function updateClinicSettings(
  input: z.infer<typeof UpdateClinicSettingsSchema>
) {
  try {
    const supabase = createServerSupabaseClient();
    const profile = await getOrCreateProfile();
    if (!profile) return { success: false, error: 'Profile not found' };

    await requireRole('doctor');

    const validatedInput = UpdateClinicSettingsSchema.parse(input);

    const { error } = await supabase
      .from('clinics')
      .update({
        name: validatedInput.name,
        address: validatedInput.address || null,
        city: validatedInput.city || null,
        state: validatedInput.state || null,
        postal_code: validatedInput.postal_code || null,
        phone: validatedInput.phone || null,
        email: validatedInput.email || null,
        license_number: validatedInput.license_number || null,
        gst_number: validatedInput.gst_number || null,
        hfr_id: validatedInput.hfr_id || null,
        show_branding_footer: validatedInput.show_branding_footer,
        updated_at: new Date().toISOString(),
      })
      .eq('id', profile.clinic_id);

    if (error) {
      console.error('[updateClinicSettings]', error);
      return { success: false, error: error.message || 'Failed to update settings' };
    }

    revalidatePath('/dashboard/settings');
    return { success: true };
  } catch (err: any) {
    console.error('[updateClinicSettings] Unexpected error:', err);
    return { success: false, error: err?.message || 'Unexpected error' };
  }
}