// src/features/pharmacy/components/pharmacy-messaging-settings-card.tsx
//
// Standalone card on the Settings page — deliberately separate from
// ClinicSettingsForm rather than merged into it. That form's save action
// (updateClinicSettings) is gated to role === 'doctor' only; this setting
// is gated to is_clinic_admin (which can be staff too, per the Chat A
// access model). Mixing the two into one save button would either wrongly
// narrow this setting to doctors only, or wrongly loosen the clinic-identity
// form to any admin — keeping them as separate cards with separate save
// actions preserves both permission boundaries correctly.

'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { setAutoSendMedicineReceipts } from '../actions';

interface PharmacyMessagingSettingsCardProps {
  initialAutoSend: boolean;
  canEdit: boolean;
}

export default function PharmacyMessagingSettingsCard({
  initialAutoSend,
  canEdit,
}: PharmacyMessagingSettingsCardProps) {
  const [autoSend, setAutoSend] = useState(initialAutoSend);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  async function handleToggle(checked: boolean) {
    if (!canEdit) return;
    const previous = autoSend;
    setAutoSend(checked); // optimistic
    setIsSaving(true);
    setErrorMessage(null);
    setSavedMessage(null);

    const result = await setAutoSendMedicineReceipts({ auto_send: checked });

    if (!result.ok) {
      setAutoSend(previous); // revert on failure
      setErrorMessage(result.error);
    } else {
      setSavedMessage('Saved.');
      setTimeout(() => setSavedMessage(null), 2000);
    }
    setIsSaving(false);
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">
          Pharmacy Messaging
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Controls how medicine receipts are sent to patients over WhatsApp
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          <input
            id="auto-send-medicine-receipts"
            type="checkbox"
            checked={autoSend}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={!canEdit || isSaving}
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
          />
          <div>
            <Label
              htmlFor="auto-send-medicine-receipts"
              className="text-sm font-medium text-foreground cursor-pointer"
            >
              Send medicine receipts automatically
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              When on (default), the WhatsApp receipt sends the moment a medicine bill is
              completed — no staff action needed. When off, the receipt is still generated
              and appears in Messages, ready for a staff member to send manually.
            </p>
            {errorMessage && <p className="text-xs text-destructive mt-1">{errorMessage}</p>}
            {savedMessage && (
              <p className="text-xs text-emerald-600 dark:text-emerald-400 mt-1">{savedMessage}</p>
            )}
          </div>
        </div>
        {!canEdit && (
          <p className="text-xs text-muted-foreground mt-3">
            Only a clinic admin can change this setting.
          </p>
        )}
      </CardContent>
    </Card>
  );
}