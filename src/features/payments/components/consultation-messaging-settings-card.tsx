// src/features/payments/components/consultation-messaging-settings-card.tsx
//
// Mirrors PharmacyMessagingSettingsCard exactly — standalone card,
// separate save action, gated by is_clinic_admin (not role === 'doctor'),
// for the same reason: keeping this independent from ClinicSettingsForm's
// doctor-only save preserves both permission boundaries correctly.
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { setAutoSendConsultationReceipts } from '../actions';

interface ConsultationMessagingSettingsCardProps {
  initialAutoSend: boolean;
  canEdit: boolean;
}

export default function ConsultationMessagingSettingsCard({
  initialAutoSend,
  canEdit,
}: ConsultationMessagingSettingsCardProps) {
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

    const result = await setAutoSendConsultationReceipts({ auto_send: checked });

    if (!result.success) {
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
          Consultation Receipt Messaging
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Controls how consultation and manual receipts are sent to patients over WhatsApp
        </p>
      </CardHeader>
      <CardContent>
        <div className="flex items-start gap-3">
          <input
            id="auto-send-consultation-receipts"
            type="checkbox"
            checked={autoSend}
            onChange={(e) => handleToggle(e.target.checked)}
            disabled={!canEdit || isSaving}
            className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
          />
          <div>
            <Label
              htmlFor="auto-send-consultation-receipts"
              className="text-sm font-medium text-foreground cursor-pointer"
            >
              Send consultation receipts automatically
            </Label>
            <p className="text-xs text-muted-foreground mt-0.5">
              When on (default), the WhatsApp receipt sends the moment a payment is first
              collected — no staff action needed. When off, the receipt is still generated
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