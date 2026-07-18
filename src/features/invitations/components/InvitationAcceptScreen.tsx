'use client';

import React from 'react';
import { Mail, Unlink, CheckCircle2, Clock, Loader2, AlertCircle } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface InvitationAcceptScreenProps {
  state?: 'valid' | 'invalid' | 'used' | 'expired';
  clinicName?: string;
  role?: 'doctor' | 'staff';
  staffType?: string | null;
  isSignedIn?: boolean;
  isLoading?: boolean;
  error?: string | null;
  onJoin?: () => void;
  onSignIn?: () => void;
  onSignUp?: () => void;
}

export default function InvitationAcceptScreen({
  state = 'valid',
  clinicName = 'Sunrise Family Clinic',
  role = 'staff',
  staffType = 'nurse',
  isSignedIn = true,
  isLoading = false,
  error = null,
  onJoin,
  onSignIn,
  onSignUp,
}: InvitationAcceptScreenProps) {
  const stateConfig = {
    valid: {
      icon: Mail,
      iconChipClass: 'bg-primary/10 text-primary',
      heading: `You're invited to join ${clinicName}`,
    },
    invalid: {
      icon: Unlink,
      iconChipClass: 'bg-muted text-muted-foreground',
      heading: 'Invalid invitation link',
    },
    used: {
      icon: CheckCircle2,
      iconChipClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
      heading: 'Invitation already used',
    },
    expired: {
      icon: Clock,
      iconChipClass: 'bg-amber-500/15 text-amber-700 dark:text-amber-400',
      heading: 'Invitation expired',
    },
  };

  const config = stateConfig[state];
  const Icon = config.icon;

  const roleLabel = staffType ? `${role} · ${staffType}` : role;

  const getSubtext = () => {
    switch (state) {
      case 'valid':
        return `Role: ${roleLabel}`;
      case 'invalid':
        return 'This link may be incorrect or may have been removed. Check the link in your email, or ask your clinic admin to send a new invitation.';
      case 'used':
        return "This invitation has already been accepted. If this wasn't you, contact your clinic admin.";
      case 'expired':
        return 'This invitation is no longer valid. Ask your clinic admin to send you a new one.';
      default:
        return '';
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-muted/30">
      <Card className="border border-border bg-card rounded-xl shadow-sm p-8 max-w-md w-full">
        <div className="flex justify-center mb-6">
          <div className={`size-12 rounded-xl flex items-center justify-center ${config.iconChipClass}`}>
            <Icon className="size-6" aria-hidden="true" />
          </div>
        </div>

        <h1 className="text-xl font-semibold text-foreground text-center mb-2">
          {config.heading}
        </h1>

        <p className="text-sm text-muted-foreground text-center mb-6">
          {getSubtext()}
        </p>

        {state === 'valid' && isSignedIn && (
          <div className="space-y-3">
            <Button onClick={onJoin} disabled={isLoading} className="w-full">
              {isLoading ? (
                <>
                  <Loader2 className="size-4 mr-2 animate-spin" aria-hidden="true" />
                  Joining…
                </>
              ) : (
                'Join clinic'
              )}
            </Button>
            {error && (
              <div role="alert" className="flex items-start gap-2 text-sm text-destructive">
                <AlertCircle className="size-4 flex-shrink-0 mt-0.5" aria-hidden="true" />
                <span>{error}</span>
              </div>
            )}
          </div>
        )}

        {state === 'valid' && !isSignedIn && (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground text-center">
              Sign in or create an account to accept this invitation.
            </p>
            <div className="flex justify-center items-center gap-2">
              <button
                onClick={onSignIn}
                className="text-sm font-medium text-primary hover:underline"
              >
                Sign in
              </button>
              <span className="text-muted-foreground">·</span>
              <button
                onClick={onSignUp}
                className="text-sm font-medium text-primary hover:underline"
              >
                Sign up
              </button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}