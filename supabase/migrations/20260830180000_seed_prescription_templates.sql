-- Item 6: seed message_templates for the 'prescription' type, all 5
-- languages. Content matches what was submitted to Meta for approval —
-- English will work as soon as approved; hi/ta/gu/kn rows exist now too
-- so sendMessage's template lookup succeeds the moment each individual
-- language clears review, with no further migration needed later.
-- ON CONFLICT DO NOTHING, matching the idempotent-seed pattern used for
-- medicine_receipt templates.

INSERT INTO message_templates (type, language, content) VALUES
  ('prescription', 'en', 'Hi {PATIENT_NAME}, your prescription from {CLINIC_NAME} is ready. Prescribed by {DOCTOR_NAME} for your visit on {VISIT_DATE}. Download your prescription here: {PDF_LINK} This link is active for 7 days. Please follow the dosage as advised by your doctor. Take care.'),
  ('prescription', 'hi', 'नमस्ते {PATIENT_NAME}, {CLINIC_NAME} से आपका प्रिस्क्रिप्शन तैयार है। {VISIT_DATE} की आपकी विज़िट के लिए {DOCTOR_NAME} द्वारा लिखा गया। अपना प्रिस्क्रिप्शन यहाँ डाउनलोड करें: {PDF_LINK} यह लिंक 7 दिनों तक सक्रिय रहेगा। कृपया डॉक्टर की बताई खुराक का पालन करें। अपना ध्यान रखें।'),
  ('prescription', 'ta', 'வணக்கம் {PATIENT_NAME}, {CLINIC_NAME} இலிருந்து உங்கள் மருந்துச்சீட்டு தயாராக உள்ளது. {VISIT_DATE} அன்று உங்கள் வருகைக்காக {DOCTOR_NAME} பரிந்துரைத்தது. உங்கள் மருந்துச்சீட்டை இங்கே பதிவிறக்கவும்: {PDF_LINK} இந்த இணைப்பு 7 நாட்களுக்கு செயல்படும். மருத்துவர் அறிவுறுத்திய அளவின்படி மருந்துகளை எடுத்துக்கொள்ளுங்கள். நலமாக இருங்கள்.'),
  ('prescription', 'gu', 'નમસ્તે {PATIENT_NAME}, {CLINIC_NAME} તરફથી તમારું પ્રિસ્ક્રિપ્શન તૈયાર છે. {VISIT_DATE} ના રોજની તમારી મુલાકાત માટે {DOCTOR_NAME} દ્વારા લખાયેલ. તમારું પ્રિસ્ક્રિપ્શન અહીંથી ડાઉનલોડ કરો: {PDF_LINK} આ લિંક 7 દિવસ સુધી ચાલુ રહેશે. કૃપા કરીને ડૉક્ટરે જણાવેલ ડોઝનું પાલન કરો. તમારી સંભાળ રાખો.'),
  ('prescription', 'kn', 'ನಮಸ್ಕಾರ {PATIENT_NAME}, {CLINIC_NAME} ನಿಂದ ನಿಮ್ಮ ಔಷಧಿ ಚೀಟಿ ಸಿದ್ಧವಾಗಿದೆ. {VISIT_DATE} ರಂದು ನಿಮ್ಮ ಭೇಟಿಗಾಗಿ {DOCTOR_NAME} ಅವರು ಸೂಚಿಸಿದ್ದಾರೆ. ನಿಮ್ಮ ಔಷಧಿ ಚೀಟಿಯನ್ನು ಇಲ್ಲಿ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ: {PDF_LINK} ಈ ಲಿಂಕ್ 7 ದಿನಗಳವರೆಗೆ ಸಕ್ರಿಯವಾಗಿರುತ್ತದೆ. ದಯವಿಟ್ಟು ವೈದ್ಯರು ಸೂಚಿಸಿದ ಡೋಸ್ ಅನ್ನು ಅನುಸರಿಸಿ. ನಿಮ್ಮ ಆರೋಗ್ಯ ಕಾಪಾಡಿಕೊಳ್ಳಿ.')
ON CONFLICT (type, language) DO NOTHING;