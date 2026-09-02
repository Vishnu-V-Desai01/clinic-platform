'use client';

import { useState } from 'react';
import { Building2, Loader2, AlertCircle } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { TermsDialog } from './TermsDialog';
import type { CreateClinicInput } from '../schema';

interface ClinicOnboardingScreenProps {
  onSubmit?: (data: CreateClinicInput) => void;
  isLoading?: boolean;
  error?: string | null;
  defaultFullName?: string;
}

export default function ClinicOnboardingScreen({
  onSubmit,
  isLoading = false,
  error = null,
  defaultFullName = '',
}: ClinicOnboardingScreenProps) {
  const [fullName, setFullName] = useState(defaultFullName);
  const [clinicName, setClinicName] = useState('');
  const [address, setAddress] = useState('');
  const [city, setCity] = useState('');
  const [state, setState] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [gstNumber, setGstNumber] = useState('');
  const [hfrId, setHfrId] = useState('');
  const [tosAccepted, setTosAccepted] = useState(false);
  const [termsOpen, setTermsOpen] = useState(false);

  const handleSubmit = () => {
    const trimmedFullName = fullName.trim();
    const trimmedName = clinicName.trim();
    if (!trimmedFullName || !trimmedName || !tosAccepted || !onSubmit) return;

    onSubmit({
      fullName: trimmedFullName,
      clinicName: trimmedName,
      address: address.trim() || undefined,
      city: city.trim() || undefined,
      state: state.trim() || undefined,
      postalCode: postalCode.trim() || undefined,
      phone: phone.trim() || undefined,
      email: email.trim() || undefined,
      licenseNumber: licenseNumber.trim() || undefined,
      gstNumber: gstNumber.trim() || undefined,
      hfrId: hfrId.trim() || undefined,
      tosAccepted,
    });
  };

  const isSubmitDisabled =
    !fullName.trim() || !clinicName.trim() || !tosAccepted || isLoading;
  const inputClass = 'border-border bg-background text-foreground';

  return (
    <div className="min-h-screen flex items-center justify-center p-4 py-10 bg-muted/30">
      <Card className="border border-border bg-card rounded-xl shadow-sm max-w-lg w-full p-8">
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

        <div className="space-y-2 mb-4">
          <Label htmlFor="full-name" className="text-foreground">
            Your name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="full-name"
            type="text"
            placeholder="e.g. Dr. Priya Sharma"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            required
            disabled={isLoading}
            className="h-11"
          />
        </div>

        <div className="space-y-2 mb-6">
          <Label htmlFor="clinic-name" className="text-foreground">
            Clinic name <span className="text-red-500">*</span>
          </Label>
          <Input
            id="clinic-name"
            type="text"
            placeholder="e.g. Sunrise Family Clinic"
            value={clinicName}
            onChange={(e) => setClinicName(e.target.value)}
            required
            disabled={isLoading}
            className="h-11"
          />
        </div>

        <p className="text-xs font-medium text-muted-foreground mb-3">
          The clinic details below are optional — you can add or change them anytime from Settings.
        </p>

        <Card className="bg-muted/40 border-border mb-4">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              Clinic Identity
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="license-number" className="text-xs">License / Reg. No.</Label>
                <Input
                  id="license-number"
                  value={licenseNumber}
                  onChange={(e) => setLicenseNumber(e.target.value)}
                  disabled={isLoading}
                  placeholder="e.g. MH-12345"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="gst-number" className="text-xs">GST Number</Label>
                <Input
                  id="gst-number"
                  value={gstNumber}
                  onChange={(e) => setGstNumber(e.target.value)}
                  disabled={isLoading}
                  placeholder="29ABCDE1234F1Z5"
                  className={inputClass}
                  maxLength={15}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="hfr-id" className="text-xs">HFR ID (ABDM, optional)</Label>
              <Input
                id="hfr-id"
                value={hfrId}
                onChange={(e) => setHfrId(e.target.value)}
                disabled={isLoading}
                placeholder="Health Facility Registry ID"
                className={inputClass}
              />
            </div>
          </CardContent>
        </Card>

        <Card className="bg-muted/40 border-border mb-6">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold text-foreground">
              Contact &amp; Address
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="phone" className="text-xs">Phone</Label>
                <Input
                  id="phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  disabled={isLoading}
                  placeholder="+91 98765 43210"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="email" className="text-xs">Email</Label>
                <Input
                  id="email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={isLoading}
                  placeholder="clinic@example.com"
                  className={inputClass}
                />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address" className="text-xs">Street Address</Label>
              <Input
                id="address"
                value={address}
                onChange={(e) => setAddress(e.target.value)}
                disabled={isLoading}
                placeholder="Building, Street, Area"
                className={inputClass}
              />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="city" className="text-xs">City</Label>
                <Input
                  id="city"
                  value={city}
                  onChange={(e) => setCity(e.target.value)}
                  disabled={isLoading}
                  placeholder="City"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="state" className="text-xs">State</Label>
                <Input
                  id="state"
                  value={state}
                  onChange={(e) => setState(e.target.value)}
                  disabled={isLoading}
                  placeholder="State"
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="postal-code" className="text-xs">PIN Code</Label>
                <Input
                  id="postal-code"
                  value={postalCode}
                  onChange={(e) => setPostalCode(e.target.value)}
                  disabled={isLoading}
                  placeholder="560001"
                  className={inputClass}
                />
              </div>
            </div>
          </CardContent>
        </Card>

        <div className="flex items-start gap-2.5 mb-2">
          <Checkbox
            id="tos-accepted"
            checked={tosAccepted}
            onCheckedChange={(checked) => setTosAccepted(checked === true)}
            disabled={isLoading}
            className="mt-0.5"
          />
          <Label htmlFor="tos-accepted" className="text-sm font-normal leading-snug text-foreground">
            I accept the terms and policy agreement <span className="text-red-500">*</span>
          </Label>
        </div>
        <button
          type="button"
          onClick={() => setTermsOpen(true)}
          className="text-xs text-primary underline underline-offset-2 mb-6 block"
        >
          View terms and policies
        </button>

        {error && (
          <div role="alert" className="flex items-start gap-2 text-sm text-destructive mb-4">
            <AlertCircle className="size-4 flex-shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

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

      <TermsDialog open={termsOpen} onOpenChange={setTermsOpen} />
    </div>
  );
}