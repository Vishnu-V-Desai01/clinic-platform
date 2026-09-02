// Terms of Service / Privacy Policy content shown in the onboarding
// "View terms and policies" dialog.
//
// IMPORTANT: this is a SEPARATE COPY of the text in
// CURAKIN_Terms_of_Service_Draft_v1.docx and
// CURAKIN_Privacy_Policy_Draft_v1.docx. There is currently no single
// source of truth between the Word documents and this file. When the
// terms are finalized after legal review, BOTH the .docx files AND this
// file must be updated together, and TOS_VERSION bumped so any future
// re-consent logic can tell who accepted which version.

export const TOS_VERSION = '1.0'

export type LegalSection = {
  heading: string
  paragraphs?: string[]
  bullets?: string[]
}

export const TERMS_OF_SERVICE_SECTIONS: LegalSection[] = [
  {
    heading: 'Parties',
    paragraphs: [
      'These Terms of Service form a binding agreement between Vishnu V Desai, sole proprietor trading as CURAKIN HealthTech ("CURAKIN", "we", "us"), and the clinic or healthcare practice creating an account on the CURAKIN platform ("Clinic", "you"). By creating a clinic account, you agree to be bound by these Terms.',
    ],
  },
  {
    heading: '1. Nature of the Service',
    paragraphs: [
      'CURAKIN is an administrative and operational management tool for clinics — patient record-keeping, scheduling, billing, and communication.',
      'CURAKIN is NOT a clinical, diagnostic, or decision-support tool. It does not practice medicine and does not verify the clinical accuracy of any data entered. The Clinic and its doctors remain solely responsible for all clinical judgments, diagnoses, treatments, and patient care decisions.',
    ],
  },
  {
    heading: '2. Subscription Plans and Pricing',
    paragraphs: [
      'CURAKIN offers flat-fee annual pricing tiers, differentiated by permitted doctor headcount only: Solo (\u20B914,000/year, 1 doctor), Clinic (\u20B928,000/year, up to 4 doctors), Group (\u20B960,000/year, up to 10 doctors), and Enterprise (custom quote, 10+ doctors). Every tier includes the full feature set; there is no feature-based gating between tiers. Staff seats are unlimited on every tier.',
      'Multi-year prepayment discounts are available: 10% off the total for a 3-year term, 20% off for a 5-year term.',
      'CURAKIN is not currently registered for GST. Prices stated are therefore final, with no additional tax applied. This may change with notice if CURAKIN becomes GST-registered, affecting future invoices only.',
    ],
  },
  {
    heading: '3. Free Trial',
    paragraphs: [
      'New Clinic accounts receive a 14-day free trial with full access to all Services. Selecting and paying for a plan during the trial ends the trial immediately; the paid Subscription Term begins on the date of payment, not the trial\u2019s scheduled end date.',
    ],
  },
  {
    heading: '4. Payment Terms',
    bullets: [
      'All fees are payable upfront, in full, for the entire selected Subscription Term.',
      'All fees are strictly non-refundable, regardless of the reason, except where required by law.',
      'Once purchased, a Subscription Term cannot be shortened or cancelled prior to its natural expiry.',
      'A Clinic exceeding its tier\u2019s doctor-seat limit must upgrade to a higher tier; there is no per-seat surcharge pricing.',
    ],
  },
  {
    heading: '5. Renewal, Late Payment, and Account Status',
    paragraphs: [
      'The Clinic is responsible for renewing before the current term ends. Non-renewal triggers a 7-day grace period ("Past Due") with full access continuing. If payment is not received within the grace period, the account becomes "Expired."',
      'While Expired, the Clinic retains read access to existing data and can edit existing records, but cannot create new patient records, appointments, prescriptions, or other new entries. Automated WhatsApp messaging is suspended during this state.',
    ],
  },
  {
    heading: '6. Termination',
    paragraphs: [
      'CURAKIN may suspend or terminate an account for non-payment beyond the grace period, abuse or misuse of the Services, unlawful use, or breach of these Terms. Upon termination, CURAKIN will make existing patient records available for export via email or generated PDF, to enable continuity of patient care.',
      'The Clinic may not unilaterally cancel or shorten an active Subscription Term prior to its scheduled expiry.',
    ],
  },
  {
    heading: '7. Data Retention After Termination',
    paragraphs: [
      'Following termination, the Clinic\u2019s own interface access to its patient data ends 90 days after the termination date. This is an access restriction, not deletion: Patient Data is retained for up to 10 years from creation and remains accessible to the individual patient via their own patient portal throughout that period, independent of any clinic\u2019s subscription status. Patient portal access itself does not expire. At the 10-year mark, the corresponding data is permanently deleted.',
    ],
  },
  {
    heading: '8. Data Ownership',
    paragraphs: [
      'The Clinic owns all Patient Data entered into the Services. CURAKIN acts solely as a Data Processor on the Clinic\u2019s behalf and claims no ownership of Patient Data. Under the Digital Personal Data Protection Act, 2023, the Clinic is the Data Fiduciary and CURAKIN is the Data Processor.',
    ],
  },
  {
    heading: '9. Service Availability',
    paragraphs: [
      'CURAKIN does not independently guarantee any uptime or service-level commitment. The Services depend on third-party infrastructure providers (Supabase, Vercel, Clerk), and CURAKIN\u2019s practical availability inherits the commitments (if any) published by these providers.',
    ],
  },
  {
    heading: '10. Limitation of Liability',
    paragraphs: [
      'CURAKIN is an assistive operational tool only. CURAKIN has no liability for any clinical outcome, medical decision, diagnosis, or harm to any patient. All clinical responsibility rests solely with the Clinic and its treating doctors.',
      'In the event of data loss, CURAKIN will make reasonable efforts to recover affected data but does not guarantee recovery. Except for gross negligence or wilful misconduct, CURAKIN\u2019s total liability shall not exceed fees paid by the Clinic in the preceding 12 months, and CURAKIN is not liable for indirect, incidental, or consequential damages.',
    ],
  },
  {
    heading: '11. Governing Law and Dispute Resolution',
    paragraphs: [
      'These Terms are governed by the laws of India. Disputes shall be resolved by arbitration under the Arbitration and Conciliation Act, 1996, by a sole arbitrator, seated in Bengaluru, Karnataka.',
    ],
  },
  {
    heading: '12. Acceptance',
    paragraphs: [
      'By checking "I accept the terms and policy agreement" during account creation, you confirm that you have read, understood, and agree to be bound by these Terms of Service and the CURAKIN Privacy Policy.',
    ],
  },
]

export const PRIVACY_POLICY_SECTIONS: LegalSection[] = [
  {
    heading: 'Overview',
    paragraphs: [
      'This Privacy Policy describes how CURAKIN HealthTech handles personal data in connection with the CURAKIN clinic management and patient care platform.',
    ],
  },
  {
    heading: '1. Roles Under the DPDP Act',
    paragraphs: [
      'In relation to Patient Data, the Clinic is the Data Fiduciary — the entity that determines the purpose and means of processing a patient\u2019s personal data. CURAKIN acts as a Data Processor, processing Patient Data solely on the Clinic\u2019s instructions. In relation to a Clinic\u2019s own account and staff data, CURAKIN acts as Data Fiduciary for that limited purpose.',
    ],
  },
  {
    heading: '2. Data We Collect',
    bullets: [
      'Clinic Data: name, address, contact details, GST registration (where provided), staff and doctor account details, billing information.',
      'Patient Data: identity and contact information, emergency contacts, consultation notes, diagnoses, prescriptions, treatment history, test results, appointment and payment records.',
    ],
  },
  {
    heading: '3. How Data Is Used',
    paragraphs: [
      'Data is processed solely for purposes connected to operating the Services: patient record-keeping, scheduling, treatment and care continuity, billing, and patient communication such as appointment and medicine reminders. CURAKIN does not sell Patient Data and does not use it for advertising.',
    ],
  },
  {
    heading: '4. Consent Framework',
    paragraphs: [
      'CURAKIN implements granular, purpose-specific consent. Consent for each distinct processing purpose is recorded and can be independently withdrawn. Where a patient withdraws consent for core data processing, only the patient can reverse that withdrawal — a clinic cannot re-grant consent on a patient\u2019s behalf.',
    ],
  },
  {
    heading: '5. Third-Party Service Providers',
    bullets: [
      'Supabase (hosted on AWS ap-south-1, Mumbai) — database hosting and storage for all Clinic and Patient Data.',
      'Vercel — application hosting.',
      'Clerk — authentication and session management.',
      'MSG91 — WhatsApp message delivery for reminders, using patient phone numbers.',
      'Razorpay — payment processing for Clinic billing.',
      'Sentry — error monitoring, with minimized exposure to personal data.',
    ],
  },
  {
    heading: '6. Where Data Is Stored',
    paragraphs: [
      'All data is stored via Supabase, hosted on AWS in the ap-south-1 (Mumbai) region. Data is not routinely transferred outside India.',
    ],
  },
  {
    heading: '7. Data Retention',
    paragraphs: [
      'Following termination of a Clinic\u2019s subscription, the Clinic\u2019s own interface stops displaying that Clinic\u2019s patient records 90 days after termination. This is an access restriction, not deletion — Patient Data is retained up to 10 years from creation and remains accessible to the individual patient through their own patient portal throughout that period. A patient\u2019s portal account does not expire. At the end of the 10-year period, data is permanently deleted.',
    ],
  },
  {
    heading: '8. Patient Rights',
    paragraphs: [
      'Patients have the right to access their personal data, request correction, and request erasure, subject to the retention terms above. These rights can be exercised via the patient portal or by contacting the relevant Clinic directly.',
    ],
  },
  {
    heading: '9. Children\u2019s Data',
    paragraphs: [
      'Where a patient is a minor, the DPDP Act requires verifiable parental or guardian consent before processing that child\u2019s personal data. It is the Clinic\u2019s responsibility to obtain and record such consent at registration. CURAKIN does not use children\u2019s data for tracking or targeted advertising, and does not serve advertising on the platform at all.',
    ],
  },
  {
    heading: '10. Security',
    paragraphs: [
      'Access to data is governed by row-level security policies enforced at the database level, isolating each Clinic\u2019s data from others. All data access occurs through authenticated, server-side application logic.',
    ],
  },
  {
    heading: '11. Contact',
    paragraphs: [
      'For questions regarding this Privacy Policy, contact: vishnu.v.desai7899@gmail.com.',
    ],
  },
]