'use client';

import { useState } from 'react';
import { Building2, Loader2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';

interface ClinicOnboardingScreenProps {
  onSubmit?: (clinicName: string) => void;
  isLoading?: boolean;
  error?: string | null;
}

export default function ClinicOnboardingScreen({
  onSubmit,
  isLoading = false,
  error = null,
}: ClinicOnboardingScreenProps) {
  const [clinicName, setClinicName] = useState('');

  const handleSubmit = () => {
    const trimmedName = clinicName.trim();
    if (trimmedName && onSubmit) {
      onSubmit(trimmedName);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !e.nativeEvent.isComposing) {
      handleSubmit();
    }
  };

  const isSubmitDisabled = !clinicName.trim() || isLoading;

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="border border-border bg-card rounded-xl shadow-sm max-w-md w-full p-8">
        <div className="flex justify-center mb-6">
          <div className="size-12 rounded-xl bg-primary/10 text-primary flex items-center justify-center">
            <Building2 className="size-6" />
          </div>
        </div>

        <h1 className="text-2xl font-semibold text-foreground text-center mb-2">
          Welcome to CURAKIN
        </h1>

        <p className="text-sm text-muted-foreground text-center mb-4">
          Set up your clinic to get started.
        </p>

        <p className="text-xs text-muted-foreground text-center leading-relaxed mb-6">
          If you were invited by an existing clinic, use the invitation link from your email instead
          of this form. If you&apos;re a patient, use the link your clinic sent you on WhatsApp.
        </p>

        <div className="space-y-4 mb-6">
          <div>
            <Label htmlFor="clinic-name" className="text-foreground">
              Clinic name <span className="text-red-500">*</span>
            </Label>
            <Input
              id="clinic-name"
              type="text"
              placeholder="e.g. Sunrise Family Clinic"
              value={clinicName}
              onChange={(e) => setClinicName(e.target.value)}
              onKeyDown={handleKeyDown}
              required
              disabled={isLoading}
              className="h-11 mt-2"
            />
          </div>

          {error && (
            <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
              <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}
        </div>

        <Button onClick={handleSubmit} disabled={isSubmitDisabled} className="w-full h-11">
          {isLoading ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" />
              Creating clinic…
            </>
          ) : (
            'Create clinic & get started'
          )}
        </Button>
      </Card>
    </div>
  );
}