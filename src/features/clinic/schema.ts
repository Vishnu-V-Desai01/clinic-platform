// src/features/clinic/schema.ts

import { z } from 'zod';

export const UpdateClinicSettingsSchema = z.object({
  name: z.string().min(1, 'Clinic name is required').max(100),
  address: z.string().max(500).nullish(),
  city: z.string().max(100).nullish(),
  state: z.string().max(100).nullish(),
  postal_code: z.string().max(20).nullish(),
  phone: z.string().max(20).nullish(),
  email: z.string().max(200).nullish(),
  license_number: z.string().max(100).nullish(),
  gst_number: z.string().max(15).nullish(),
  hfr_id: z.string().max(100).nullish(),
  show_branding_footer: z.boolean(),
});