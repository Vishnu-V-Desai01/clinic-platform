// src/features/clinic/types.ts

export type ClinicSettings = {
  id: string;
  name: string;
  address: string | null;
  city: string | null;
  state: string | null;
  postal_code: string | null;
  country: string | null;
  phone: string | null;
  email: string | null;
  license_number: string | null;
  gst_number: string | null;
  hfr_id: string | null;
  timezone: string | null;
  // show_branding_footer intentionally omitted from this type — Item 9
  // made the watermark mandatory and removed the disable option. The
  // column still exists on the clinics table (additive-only migrations)
  // and a `select('*')` will still return it on the raw row, but the app
  // no longer types, reads, or writes it anywhere.
  receipt_counter: number;
  created_at: string;
  updated_at: string | null;
};