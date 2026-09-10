BEGIN;

-- ============================================================
-- Item 1/2 (Sept 2026): appointment confirmation template
-- placeholder restructure.
--
-- The live MSG91/Meta template for 'appointment' (all 5
-- languages) was edited to drop the dead dashboard-link URL and
-- end on a clinic phone number instead. This changes the
-- template from 7 positional variables to 6.
--
-- This migration updates message_templates.content for all 5
-- appointment rows so extractPlaceholderOrder() (provider-
-- mapping.ts) derives the same 6-token order the now-live MSG91
-- templates expect: PATIENT_NAME, DOCTOR_NAME, CLINIC_NAME,
-- APPOINTMENT_DATE, APPOINTMENT_TIME, CLINIC_PHONE.
--
-- Must land in the same commit as the appointmentPlaceholdersSchema
-- change (schema.ts) and the placeholders object in
-- createAppointmentMessage (messaging/actions.ts) that drops
-- DASHBOARD_LINK — those three together are what caused the
-- appointment-type-only send failures fixed here.
-- ============================================================

UPDATE message_templates
SET content = 'Hi {PATIENT_NAME}, your appointment with Dr {DOCTOR_NAME} at {CLINIC_NAME} is confirmed. Date: {APPOINTMENT_DATE} Time: {APPOINTMENT_TIME} This is a no-reply message. For questions, please contact us by calling or messaging {CLINIC_PHONE} Thank you.'
WHERE type = 'appointment' AND language = 'en';

UPDATE message_templates
SET content = 'नमस्ते {PATIENT_NAME}, {CLINIC_NAME} में डॉ. {DOCTOR_NAME} के साथ आपकी अपॉइंटमेंट {APPOINTMENT_DATE} को {APPOINTMENT_TIME} बजे तय है। यह एक नो-रिप्लाई संदेश है। प्रश्नों के लिए कृपया कॉल करें या संदेश भेजें {CLINIC_PHONE} धन्यवाद।'
WHERE type = 'appointment' AND language = 'hi';

UPDATE message_templates
SET content = 'வணக்கம் {PATIENT_NAME}, {CLINIC_NAME}-இல் டாக்டர் {DOCTOR_NAME} உடனான உங்கள் அப்பாயிண்ட்மென்ட் {APPOINTMENT_DATE} அன்று {APPOINTMENT_TIME} மணிக்கு உறுதி செய்யப்பட்டுள்ளது। இது பதில் தர முடியாத செய்தி। கேள்விகளுக்கு தயவுசெய்து அழைக்கவும் அல்லது செய்தி அனுப்பவும் {CLINIC_PHONE} நன்றி।'
WHERE type = 'appointment' AND language = 'ta';

UPDATE message_templates
SET content = 'નમસ્તે {PATIENT_NAME}, {CLINIC_NAME} માં ડૉ. {DOCTOR_NAME} સાથેની તમારી એપોઈન્ટમેન્ટ {APPOINTMENT_DATE} ના રોજ {APPOINTMENT_TIME} વાગ્યે નક્કી છે. આ નો-રિપ્લાય સંદેશ છે. પ્રશ્નો માટે કૃપા કરી કૉલ કરો અથવા સંદેશ મોકલો {CLINIC_PHONE} આભાર.'
WHERE type = 'appointment' AND language = 'gu';

UPDATE message_templates
SET content = 'ನಮಸ್ಕಾರ {PATIENT_NAME}, {CLINIC_NAME} ನಲ್ಲಿ ಡಾ. {DOCTOR_NAME} ಅವರೊಂದಿಗೆ ನಿಮ್ಮ ಅಪಾಯಿಂಟ್‌ಮೆಂಟ್ {APPOINTMENT_DATE} ರಂದು {APPOINTMENT_TIME} ಕ್ಕೆ ಖಚಿತವಾಗಿದೆ. ಇದು ಉತ್ತರಿಸಲಾಗದ ಸಂದೇಶ. ಪ್ರಶ್ನೆಗಳಿಗೆ ದಯವಿಟ್ಟು ಕರೆ ಮಾಡಿ ಅಥವಾ ಸಂದೇಶ ಕಳುಹಿಸಿ {CLINIC_PHONE} ಧನ್ಯವಾದಗಳು.'
WHERE type = 'appointment' AND language = 'kn';

COMMIT;