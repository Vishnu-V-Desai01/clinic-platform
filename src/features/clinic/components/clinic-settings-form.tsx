// src/features/clinic/components/clinic-settings-form.tsx

'use client';

import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { updateClinicSettings } from '../actions';
import type { ClinicSettings } from '../types';

interface ClinicSettingsFormProps {
  clinic: ClinicSettings;
  canEdit: boolean;
}

export default function ClinicSettingsForm({
  clinic,
  canEdit,
}: ClinicSettingsFormProps) {
  const [name, setName] = useState(clinic.name || '');
  const [address, setAddress] = useState(clinic.address || '');
  const [city, setCity] = useState(clinic.city || '');
  const [state, setState] = useState(clinic.state || '');
  const [postalCode, setPostalCode] = useState(clinic.postal_code || '');
  const [phone, setPhone] = useState(clinic.phone || '');
  const [email, setEmail] = useState(clinic.email || '');
  const [licenseNumber, setLicenseNumber] = useState(clinic.license_number || '');
  const [gstNumber, setGstNumber] = useState(clinic.gst_number || '');
  const [hfrId, setHfrId] = useState(clinic.hfr_id || '');
  const [showBrandingFooter, setShowBrandingFooter] = useState(
    clinic.show_branding_footer ?? true
  );
  const [isLoading, setIsLoading] = useState(false);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const nextReceiptLabel =
    'RCP-' +
    new Date().getFullYear() +
    '-' +
    String(clinic.receipt_counter + 1).padStart(6, '0');

  const handleSubmit = async () => {
    if (!name.trim()) {
      setErrorMessage('Clinic name is required');
      return;
    }

    setIsLoading(true);
    setSuccessMessage(null);
    setErrorMessage(null);

    try {
      const result = await updateClinicSettings({
        name: name.trim(),
        address: address.trim() || null,
        city: city.trim() || null,
        state: state.trim() || null,
        postal_code: postalCode.trim() || null,
        phone: phone.trim() || null,
        email: email.trim() || null,
        license_number: licenseNumber.trim() || null,
        gst_number: gstNumber.trim() || null,
        hfr_id: hfrId.trim() || null,
        show_branding_footer: showBrandingFooter,
      });

      if (!result.success) {
        setErrorMessage(result.error || 'Failed to save settings');
        return;
      }

      setSuccessMessage('Settings saved. All future receipts will use these details.');
    } catch (err: any) {
      setErrorMessage(err?.message || 'Unexpected error saving settings');
    } finally {
      setIsLoading(false);
    }
  };

  const inputClass = 'border-border bg-background text-foreground';

  return (
    <div className="space-y-6">

      {/* Receipt counter info */}
      <div className="flex items-center gap-6 p-4 bg-muted rounded-lg border border-border">
        <div>
          <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">
            Receipts Issued
          </p>
          <p className="text-2xl font-bold text-foreground">{clinic.receipt_counter}</p>
        </div>
        <div className="border-l border-border pl-6">
          <p className="text-xs text-muted-foreground">Next receipt number</p>
          <p className="text-sm font-mono font-semibold text-foreground">{nextReceiptLabel}</p>
        </div>
      </div>

      {successMessage ? (
        <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-700 dark:text-emerald-400">
          {successMessage}
        </div>
      ) : null}

      {errorMessage ? (
        <div className="rounded-lg border border-destructive/30 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {errorMessage}
        </div>
      ) : null}

      {/* Clinic Identity */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">
            Clinic Identity
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Appears in the header of every receipt and treatment document
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="clinic-name">
              Clinic Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="clinic-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={!canEdit}
              placeholder="e.g. City Care Clinic"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="license-number">License / Reg. No.</Label>
              <Input
                id="license-number"
                value={licenseNumber}
                onChange={(e) => setLicenseNumber(e.target.value)}
                disabled={!canEdit}
                placeholder="e.g. MH-12345"
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="gst-number">
                GST Number{' '}
                <span className="text-xs text-muted-foreground">(optional)</span>
              </Label>
              <Input
                id="gst-number"
                value={gstNumber}
                onChange={(e) => setGstNumber(e.target.value)}
                disabled={!canEdit}
                placeholder="29ABCDE1234F1Z5"
                className={inputClass}
                maxLength={15}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="hfr-id">
              HFR ID{' '}
              <span className="text-xs text-muted-foreground">
                (ABDM Health Facility Registry — optional)
              </span>
            </Label>
            <Input
              id="hfr-id"
              value={hfrId}
              onChange={(e) => setHfrId(e.target.value)}
              disabled={!canEdit}
              placeholder="Health Facility Registry ID"
              className={inputClass}
            />
          </div>
        </CardContent>
      </Card>

      {/* Contact & Address */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">
            Contact & Address
          </CardTitle>
          <p className="text-xs text-muted-foreground">
            Printed on receipts so patients can contact you
          </p>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                disabled={!canEdit}
                placeholder="+91 98765 43210"
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={!canEdit}
                placeholder="clinic@example.com"
                className={inputClass}
              />
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="address">Street Address</Label>
            <Input
              id="address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              disabled={!canEdit}
              placeholder="Building, Street, Area"
              className={inputClass}
            />
          </div>

          <div className="grid grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city">City</Label>
              <Input
                id="city"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                disabled={!canEdit}
                placeholder="City"
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state">State</Label>
              <Input
                id="state"
                value={state}
                onChange={(e) => setState(e.target.value)}
                disabled={!canEdit}
                placeholder="State"
                className={inputClass}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="postal-code">PIN Code</Label>
              <Input
                id="postal-code"
                value={postalCode}
                onChange={(e) => setPostalCode(e.target.value)}
                disabled={!canEdit}
                placeholder="560001"
                className={inputClass}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Document Settings */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-3">
          <CardTitle className="text-base font-semibold text-foreground">
            Document Settings
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-start gap-3">
            <input
              id="branding-toggle"
              type="checkbox"
              checked={showBrandingFooter}
              onChange={(e) => {
                if (canEdit) setShowBrandingFooter(e.target.checked);
              }}
              disabled={!canEdit}
              className="mt-0.5 h-4 w-4 rounded border-border accent-primary"
            />
            <div>
              <Label
                htmlFor="branding-toggle"
                className="text-sm font-medium text-foreground cursor-pointer"
              >
                Show &ldquo;Powered by CURA&rdquo; on receipts
              </Label>
              <p className="text-xs text-muted-foreground mt-0.5">
                Adds a small, unobtrusive footer to receipts and treatment documents.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {canEdit ? (
        <div className="flex justify-end pb-8">
          <Button
            onClick={handleSubmit}
            disabled={isLoading}
            className="bg-primary hover:bg-primary/90 text-primary-foreground"
          >
            {isLoading ? 'Saving...' : 'Save Settings'}
          </Button>
        </div>
      ) : (
        <p className="text-xs text-muted-foreground text-center pb-8">
          Clinic settings can only be edited by the doctor.
        </p>
      )}
    </div>
  );
}