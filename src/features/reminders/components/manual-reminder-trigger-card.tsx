// src/features/reminders/components/manual-reminder-trigger-card.tsx
'use client';

import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { runMedicineReminderSendNow } from '../manual-trigger-actions';
import type { SendDueRemindersResult } from '@/lib/medicine-reminders/send-due-reminders';

interface ManualReminderTriggerCardProps {
  canEdit: boolean;
}

export default function ManualReminderTriggerCard({ canEdit }: ManualReminderTriggerCardProps) {
  const [isRunning, setIsRunning] = useState(false);
  const [result, setResult] = useState<SendDueRemindersResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  async function handleRunNow() {
    if (!canEdit || isRunning) return;
    setIsRunning(true);
    setErrorMessage(null);
    setResult(null);

    const outcome = await runMedicineReminderSendNow();

    if (!outcome.success) {
      setErrorMessage(outcome.error);
    } else {
      setResult(outcome.result);
    }
    setIsRunning(false);
  }

  return (
    <Card className="bg-card border-border">
      <CardHeader className="pb-3">
        <CardTitle className="text-base font-semibold text-foreground">
          Medicine Reminders — Manual Send
        </CardTitle>
        <p className="text-xs text-muted-foreground">
          Runs the reminder send job immediately for whatever&apos;s due at the
          current minute (IST). Automatic scheduling starts once Vercel Cron
          is configured; until then, use this to test or send now.
        </p>
      </CardHeader>
      <CardContent className="space-y-3">
        <Button
          onClick={handleRunNow}
          disabled={!canEdit || isRunning}
          variant="outline"
        >
          {isRunning && <Loader2 className="mr-1.5 size-4 animate-spin" />}
          {isRunning ? 'Running…' : 'Run Now'}
        </Button>

        {!canEdit && (
          <p className="text-xs text-muted-foreground">
            Only a clinic admin can run this.
          </p>
        )}

        {errorMessage && (
          <p className="text-xs text-destructive">{errorMessage}</p>
        )}

        {result && (
          <div className="rounded-lg border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
            <p>
              Checked at {result.currentTime} IST — {result.reminderRowCount} reminder row(s) due,
              grouped into {result.groupedMessageCount} message(s).
            </p>
            <p className="mt-1">
              <span className="text-emerald-600 dark:text-emerald-400">{result.sent} sent</span>
              {' · '}
              <span className={result.failed > 0 ? 'text-destructive' : ''}>{result.failed} failed</span>
            </p>
            {result.errors && result.errors.length > 0 && (
              <ul className="mt-2 space-y-0.5">
                {result.errors.map((e, i) => (
                  <li key={i} className="text-destructive">• {e}</li>
                ))}
              </ul>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}