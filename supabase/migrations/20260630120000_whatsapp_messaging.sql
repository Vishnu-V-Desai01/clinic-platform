-- ============================================================================
-- Migration: WhatsApp Messaging (Chat 11B)
-- Purpose: message templates, send queue, delivery audit log, usage/overage
-- tracking, and overage payment records.
-- Additive only.
-- ============================================================================

-- 2. message_templates
CREATE TABLE message_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type TEXT NOT NULL,
  language VARCHAR(10) NOT NULL,
  content TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT message_templates_type_check
    CHECK (type IN ('registration', 'appointment', 'receipt')),
  CONSTRAINT message_templates_language_check
    CHECK (language IN ('en', 'hi', 'ta', 'gu', 'kn')),
  CONSTRAINT message_templates_type_language_unique
    UNIQUE (type, language)
);

COMMENT ON TABLE message_templates IS
  'Fixed WhatsApp templates with {PLACEHOLDER} syntax. Not editable by clinics. Seeded via migration only.';


-- 3. message_queue
CREATE TABLE message_queue (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  patient_id UUID NOT NULL REFERENCES patients(id) ON DELETE CASCADE,
  appointment_id UUID REFERENCES appointments(id) ON DELETE CASCADE,
  payment_id UUID REFERENCES payments(id) ON DELETE CASCADE,

  type TEXT NOT NULL,
  language VARCHAR(10) NOT NULL,
  phone VARCHAR(20) NOT NULL,
  placeholders JSONB NOT NULL DEFAULT '{}'::jsonb,

  status TEXT NOT NULL DEFAULT 'pending',
  scheduled_send_time TIMESTAMPTZ NOT NULL DEFAULT now(),
  expires_at TIMESTAMPTZ,

  provider TEXT,
  provider_message_id TEXT,
  error_message TEXT,

  sent_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  cancelled_by UUID REFERENCES profiles(id),
  created_by UUID REFERENCES profiles(id),

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT message_queue_type_check
    CHECK (type IN ('registration', 'appointment', 'receipt')),
  CONSTRAINT message_queue_language_check
    CHECK (language IN ('en', 'hi', 'ta', 'gu', 'kn')),
  CONSTRAINT message_queue_status_check
    CHECK (status IN ('pending', 'sent', 'failed', 'cancelled', 'expired')),
  CONSTRAINT message_queue_type_link_check
    CHECK (
      (type = 'registration' AND appointment_id IS NULL AND payment_id IS NULL) OR
      (type = 'appointment' AND appointment_id IS NOT NULL AND payment_id IS NULL) OR
      (type = 'receipt' AND payment_id IS NOT NULL AND appointment_id IS NULL)
    )
);

CREATE INDEX idx_message_queue_clinic_status ON message_queue (clinic_id, status);
CREATE INDEX idx_message_queue_clinic_type_status ON message_queue (clinic_id, type, status);
CREATE INDEX idx_message_queue_scheduled_send_time ON message_queue (scheduled_send_time) WHERE status = 'pending';
CREATE INDEX idx_message_queue_expires_at ON message_queue (expires_at) WHERE status = 'pending' AND expires_at IS NOT NULL;

COMMENT ON TABLE message_queue IS
  'Pending and historical WhatsApp messages. Created by system events (patient added, appointment approved, payment marked paid). Sent manually by staff/doctor via Send / Send All.';
COMMENT ON COLUMN message_queue.expires_at IS
  'Only set for appointment-type messages = the appointment start time. If not sent before this, the scheduler marks it expired.';


-- 4. message_delivery_logs
CREATE TABLE message_delivery_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  message_queue_id UUID NOT NULL REFERENCES message_queue(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  performed_by UUID REFERENCES profiles(id),
  provider TEXT,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT message_delivery_logs_action_check
    CHECK (action IN ('created', 'sent', 'failed', 'cancelled', 'expired'))
);

CREATE INDEX idx_message_delivery_logs_clinic ON message_delivery_logs (clinic_id, created_at DESC);
CREATE INDEX idx_message_delivery_logs_queue_id ON message_delivery_logs (message_queue_id);

COMMENT ON TABLE message_delivery_logs IS
  'Immutable audit trail of every action taken on a message_queue row. Never updated or deleted by the app.';


-- 5. clinic_message_usage
CREATE TABLE clinic_message_usage (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  billing_month DATE NOT NULL,

  messages_sent INTEGER NOT NULL DEFAULT 0,
  included_limit INTEGER NOT NULL DEFAULT 250,
  overage_rate_paise INTEGER NOT NULL DEFAULT 150,

  overage_count INTEGER GENERATED ALWAYS AS (GREATEST(messages_sent - included_limit, 0)) STORED,
  overage_amount_paise INTEGER GENERATED ALWAYS AS (GREATEST(messages_sent - included_limit, 0) * overage_rate_paise) STORED,

  is_settled BOOLEAN NOT NULL DEFAULT false,
  settled_at TIMESTAMPTZ,

  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT clinic_message_usage_clinic_month_unique UNIQUE (clinic_id, billing_month)
);

CREATE INDEX idx_clinic_message_usage_clinic ON clinic_message_usage (clinic_id, billing_month DESC);

COMMENT ON TABLE clinic_message_usage IS
  'One row per clinic per calendar month. messages_sent incremented by trigger when a message_queue row transitions to sent. overage_count / overage_amount_paise are auto-calculated, generated columns.';
COMMENT ON COLUMN clinic_message_usage.billing_month IS
  'First day of the calendar month this row tracks, e.g. 2026-06-01.';
COMMENT ON COLUMN clinic_message_usage.overage_rate_paise IS
  'Snapshot of the per-message overage rate in paise at the time (150 = Rs 1.50). Stored per-row so past months are unaffected if pricing changes later.';


-- 6. message_payments
CREATE TABLE message_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  clinic_id UUID NOT NULL REFERENCES clinics(id) ON DELETE CASCADE,
  usage_id UUID REFERENCES clinic_message_usage(id) ON DELETE SET NULL,

  amount_paise INTEGER NOT NULL,
  payment_method TEXT,
  payment_reference TEXT,

  paid_by UUID REFERENCES profiles(id),
  paid_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),

  CONSTRAINT message_payments_amount_check CHECK (amount_paise > 0)
);

CREATE INDEX idx_message_payments_clinic ON message_payments (clinic_id, paid_at DESC);

COMMENT ON TABLE message_payments IS
  'Records of clinic overage settlements. amount_paise stored as integer paise, matching the platform money convention.';


-- 7. Trigger: auto-increment usage when a message is marked sent
CREATE OR REPLACE FUNCTION trg_increment_message_usage()
RETURNS TRIGGER
SECURITY DEFINER
SET search_path = public
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'sent' AND OLD.status IS DISTINCT FROM 'sent' THEN
    INSERT INTO clinic_message_usage (clinic_id, billing_month, messages_sent)
    VALUES (NEW.clinic_id, date_trunc('month', now())::date, 1)
    ON CONFLICT (clinic_id, billing_month)
    DO UPDATE SET
      messages_sent = clinic_message_usage.messages_sent + 1,
      updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_message_queue_sent
  AFTER UPDATE ON message_queue
  FOR EACH ROW
  EXECUTE FUNCTION trg_increment_message_usage();

COMMENT ON FUNCTION trg_increment_message_usage IS
  'Increments the current month usage counter whenever a message_queue row transitions into sent status. SECURITY DEFINER so it can write to clinic_message_usage regardless of the calling user''s RLS grants.';


-- 8. updated_at auto-touch triggers
CREATE OR REPLACE FUNCTION trg_touch_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER trg_message_templates_updated_at
  BEFORE UPDATE ON message_templates
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

CREATE TRIGGER trg_message_queue_updated_at
  BEFORE UPDATE ON message_queue
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();

CREATE TRIGGER trg_clinic_message_usage_updated_at
  BEFORE UPDATE ON clinic_message_usage
  FOR EACH ROW EXECUTE FUNCTION trg_touch_updated_at();


-- 9. Row Level Security
ALTER TABLE message_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_delivery_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinic_message_usage ENABLE ROW LEVEL SECURITY;
ALTER TABLE message_payments ENABLE ROW LEVEL SECURITY;

CREATE POLICY message_templates_select_staff_doctor
  ON message_templates FOR SELECT
  TO authenticated
  USING (get_my_role() IN ('doctor', 'staff'));

CREATE POLICY message_queue_select_own_clinic
  ON message_queue FOR SELECT
  TO authenticated
  USING (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'));

CREATE POLICY message_queue_insert_own_clinic
  ON message_queue FOR INSERT
  TO authenticated
  WITH CHECK (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'));

CREATE POLICY message_queue_update_own_clinic
  ON message_queue FOR UPDATE
  TO authenticated
  USING (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'))
  WITH CHECK (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'));

CREATE POLICY message_delivery_logs_select_own_clinic
  ON message_delivery_logs FOR SELECT
  TO authenticated
  USING (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'));

CREATE POLICY message_delivery_logs_insert_own_clinic
  ON message_delivery_logs FOR INSERT
  TO authenticated
  WITH CHECK (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'));

CREATE POLICY clinic_message_usage_select_own_clinic
  ON clinic_message_usage FOR SELECT
  TO authenticated
  USING (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'));

CREATE POLICY message_payments_select_own_clinic
  ON message_payments FOR SELECT
  TO authenticated
  USING (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'));

CREATE POLICY message_payments_insert_own_clinic
  ON message_payments FOR INSERT
  TO authenticated
  WITH CHECK (clinic_id = get_my_clinic_id() AND get_my_role() IN ('doctor', 'staff'));


-- 10. Seed: 3 types x 5 languages = 15 template rows
INSERT INTO message_templates (type, language, content) VALUES
('registration', 'en', 'Welcome to {CLINIC_NAME}, {PATIENT_NAME}! Your patient account is ready. Login email: {EMAIL} | Password: {DEFAULT_PASSWORD}. Access your dashboard here: {LOGIN_LINK}'),
('registration', 'hi', '{CLINIC_NAME} में आपका स्वागत है, {PATIENT_NAME}! आपका मरीज़ खाता तैयार है। लॉगिन ईमेल: {EMAIL} | पासवर्ड: {DEFAULT_PASSWORD}। डैशबोर्ड यहाँ देखें: {LOGIN_LINK}'),
('registration', 'ta', '{CLINIC_NAME}-க்கு வரவேற்கிறோம், {PATIENT_NAME}! உங்கள் நோயாளர் கணக்கு தயாராக உள்ளது. மின்னஞ்சல்: {EMAIL} | கடவுச்சொல்: {DEFAULT_PASSWORD}. டாஷ்போர்டைப் பார்க்க: {LOGIN_LINK}'),
('registration', 'gu', '{CLINIC_NAME} માં આપનું સ્વાગત છે, {PATIENT_NAME}! તમારું પેશન્ટ ખાતું તૈયાર છે. ઈમેલ: {EMAIL} | પાસવર્ડ: {DEFAULT_PASSWORD}. ડેશબોર્ડ અહીં જુઓ: {LOGIN_LINK}'),
('registration', 'kn', '{CLINIC_NAME} ಗೆ {PATIENT_NAME} ಅವರಿಗೆ ಸ್ವಾಗತ! ನಿಮ್ಮ ರೋಗಿಯ ಖಾತೆ ಸಿದ್ಧವಾಗಿದೆ. ಇಮೇಲ್: {EMAIL} | ಪಾಸ್‌ವರ್ಡ್: {DEFAULT_PASSWORD}. ಡ್ಯಾಶ್‌ಬೋರ್ಡ್ ಇಲ್ಲಿ ನೋಡಿ: {LOGIN_LINK}'),

('appointment', 'en', 'Hi {PATIENT_NAME}, your appointment with Dr. {DOCTOR_NAME} at {CLINIC_NAME} is confirmed for {APPOINTMENT_DATE} at {APPOINTMENT_TIME}. This is a no-reply message. For questions, message us here: {DASHBOARD_LINK} or call {CLINIC_PHONE}.'),
('appointment', 'hi', 'नमस्ते {PATIENT_NAME}, {CLINIC_NAME} में डॉ. {DOCTOR_NAME} के साथ आपकी अपॉइंटमेंट {APPOINTMENT_DATE} को {APPOINTMENT_TIME} बजे तय है। यह एक नो-रिप्लाई संदेश है। प्रश्नों के लिए यहाँ संपर्क करें: {DASHBOARD_LINK} या कॉल करें {CLINIC_PHONE}।'),
('appointment', 'ta', 'வணக்கம் {PATIENT_NAME}, {CLINIC_NAME}-இல் டாக்டர் {DOCTOR_NAME} உடனான உங்கள் அப்பாயிண்ட்மென்ட் {APPOINTMENT_DATE} அன்று {APPOINTMENT_TIME} மணிக்கு உறுதி செய்யப்பட்டுள்ளது. இது பதில் தர முடியாத செய்தி. கேள்விகளுக்கு: {DASHBOARD_LINK} அல்லது அழைக்கவும்: {CLINIC_PHONE}'),
('appointment', 'gu', 'નમસ્તે {PATIENT_NAME}, {CLINIC_NAME} માં ડૉ. {DOCTOR_NAME} સાથેની તમારી અપોઈન્ટમેન્ટ {APPOINTMENT_DATE} ના રોજ {APPOINTMENT_TIME} વાગ્યે નક્કી છે. આ નો-રિપ્લાય સંદેશ છે. પ્રશ્નો માટે: {DASHBOARD_LINK} અથવા કૉલ કરો {CLINIC_PHONE}'),
('appointment', 'kn', 'ನಮಸ್ಕಾರ {PATIENT_NAME}, {CLINIC_NAME} ನಲ್ಲಿ ಡಾ. {DOCTOR_NAME} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ {APPOINTMENT_DATE} ರಂದು {APPOINTMENT_TIME} ಕ್ಕೆ ಖಚಿತವಾಗಿದೆ. ಇದು ಉತ್ತರಿಸಲಾಗದ ಸಂದೇಶ. ಪ್ರಶ್ನೆಗಳಿಗೆ: {DASHBOARD_LINK} ಅಥವಾ ಕರೆ ಮಾಡಿ {CLINIC_PHONE}'),

('receipt', 'en', 'Hi {PATIENT_NAME}, thank you for visiting {CLINIC_NAME}. Your receipt and treatment summary are ready. Receipt: {RECEIPT_LINK} | Treatment summary: {TREATMENT_PDF_LINK}. Links are active for 7 days.'),
('receipt', 'hi', 'नमस्ते {PATIENT_NAME}, {CLINIC_NAME} आने के लिए धन्यवाद। आपकी रसीद और उपचार सारांश तैयार है। रसीद: {RECEIPT_LINK} | उपचार सारांश: {TREATMENT_PDF_LINK}। लिंक 7 दिनों तक सक्रिय रहेंगे।'),
('receipt', 'ta', 'வணக்கம் {PATIENT_NAME}, {CLINIC_NAME}-க்கு வருகை தந்ததற்கு நன்றி. உங்கள் ரசீது மற்றும் சிகிச்சை சுருக்கம் தயார். ரசீது: {RECEIPT_LINK} | சிகிச்சை சுருக்கம்: {TREATMENT_PDF_LINK}. இணைப்புகள் 7 நாட்கள் செயல்படும்.'),
('receipt', 'gu', 'નમસ્તે {PATIENT_NAME}, {CLINIC_NAME} ની મુલાકાત બદલ આભાર. તમારી રસીદ અને સારવાર સારાંશ તૈયાર છે. રસીદ: {RECEIPT_LINK} | સારવાર સારાંશ: {TREATMENT_PDF_LINK}. લિંક 7 દિવસ માટે સક્રિય રહેશે.'),
('receipt', 'kn', 'ನಮಸ್ಕಾರ {PATIENT_NAME}, {CLINIC_NAME} ಗೆ ಭೇಟಿ ನೀಡಿದ್ದಕ್ಕೆ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ರಸೀದಿ ಮತ್ತು ಚಿಕಿತ್ಸಾ ಸಾರಾಂಶ ಸಿದ್ಧವಾಗಿದೆ. ರಸೀದಿ: {RECEIPT_LINK} | ಚಿಕಿತ್ಸಾ ಸಾರಾಂಶ: {TREATMENT_PDF_LINK}. ಲಿಂಕ್‌ಗಳು 7 ದಿನಗಳವರೆಗೆ ಸಕ್ರಿಯವಾಗಿರುತ್ತವೆ.');