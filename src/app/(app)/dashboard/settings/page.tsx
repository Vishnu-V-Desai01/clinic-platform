// src/app/(app)/dashboard/settings/page.tsx
export const dynamic = 'force-dynamic';
import { Settings } from 'lucide-react';
import { getOrCreateProfile } from '@/lib/supabase/profile';
import { getClinicSettings } from '@/features/clinic/actions';
import { getAutoSendMedicineReceiptsSetting } from '@/features/pharmacy/actions';
import { getAutoSendConsultationReceiptsSetting } from '@/features/payments/actions';
import ClinicSettingsForm from '@/features/clinic/components/clinic-settings-form';
import PharmacyMessagingSettingsCard from '@/features/pharmacy/components/pharmacy-messaging-settings-card';
import ConsultationMessagingSettingsCard from '@/features/payments/components/consultation-messaging-settings-card';
import ManualReminderTriggerCard from '@/features/reminders/components/manual-reminder-trigger-card';
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
  // Admin-only edit, not "any doctor" — matches the requireAdmin() guard now
  // enforced in updateClinicSettings. A non-admin doctor/staff member still
  // sees the page (read access is fine) but the form renders view-only.
  const canEdit = profile.is_clinic_admin;
  // Independent from the clinic-identity form above: gated by
  // is_clinic_admin (any admin — doctor or staff), not role === 'doctor'.
  // A failed fetch degrades to hiding the card rather than breaking the
  // whole settings page, matching how the pharmacy dashboard handles the
  // same "module might not be enabled" possibility elsewhere.
  const autoSendResult = await getAutoSendMedicineReceiptsSetting();
  const autoSendMedicineReceipts = autoSendResult.ok ? autoSendResult.data : null;
  // Same pattern, consultation receipts (Item 2).
  const autoSendConsultationResult = await getAutoSendConsultationReceiptsSetting();
  const autoSendConsultationReceipts = autoSendConsultationResult.success
    ? autoSendConsultationResult.auto_send_consultation_receipts
    : null;
  return (
    <div className="p-4 md:p-8">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center gap-3">
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
        {autoSendConsultationReceipts !== null && (
          <ConsultationMessagingSettingsCard
            initialAutoSend={autoSendConsultationReceipts}
            canEdit={profile.is_clinic_admin}
          />
        )}
        {autoSendMedicineReceipts !== null && (
          <PharmacyMessagingSettingsCard
            initialAutoSend={autoSendMedicineReceipts}
            canEdit={profile.is_clinic_admin}
          />
        )}
        <ManualReminderTriggerCard canEdit={profile.is_clinic_admin} />
      </div>
    </div>
  );
}