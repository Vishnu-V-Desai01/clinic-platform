-- ============================================================================
-- Migration: Fix Medicine Receipt Templates (Issue 6)
-- Purpose: The English medicine_receipt template was seeded in
--          20260826140000_medicine_receipt_message_type.sql with placeholder
--          copy, and the other 4 languages were deliberately deferred until
--          final WhatsApp copy was reviewed (per that migration's own
--          comment). This migration:
--            1. Updates the English template to the final approved wording
--            2. Adds the remaining 4 languages (hi, ta, gu, kn)
--          Constraints for 'medicine_receipt' were already added in that
--          prior migration — not touched here, nothing to redo.
-- Additive only.
-- ============================================================================

-- 1. Update English template to final approved wording
UPDATE public.message_templates
SET content = 'Hi {PATIENT_NAME}, thank you for choosing {CLINIC_NAME} for your care. Your medicine receipt is ready for you. Download your receipt: {RECEIPT_LINK}. The link will be active for 7 days. Please take care and follow your prescribed medicines as advised. Wishing you good health.',
    updated_at = now()
WHERE type = 'medicine_receipt' AND language = 'en';

-- 2. Insert the remaining 4 languages (idempotent — safe to re-run)
INSERT INTO public.message_templates (type, language, content) VALUES
('medicine_receipt', 'hi', 'नमस्ते {PATIENT_NAME}, {CLINIC_NAME} से अपनी देखभाल के लिए आपको धन्यवाद। आपकी दवा की रसीद आपके लिए तैयार है। अपनी रसीद डाउनलोड करें: {RECEIPT_LINK}। यह लिंक 7 दिनों तक सक्रिय रहेगा। कृपया देखभाल करें और सलाह के अनुसार अपनी दवाओं का पालन करें। आपके स्वास्थ्य की कामना करते हैं।'),
('medicine_receipt', 'ta', 'வணக்கம் {PATIENT_NAME}, {CLINIC_NAME} இல் உங்கள் பராமரிப்புக்கு நன்றி. உங்கள் மருந்து ரசீது உங்களுக்கு தயாரிக்கப்பட்டுள்ளது. உங்கள் ரசீதைப் பதிவிறக்கவும்: {RECEIPT_LINK}. இந்த இணைப்பு 7 நாட்களுக்கு செயல்படும். தயவுசெய்து கவனம் எடுத்துக் கொள்ளுங்கள் மற்றும் ஆலோசனை கூறியபடி உங்கள் மருந்துகளைப் பின்பற்றுங்கள். உங்கள் நல்வாழ்வை விரும்புகிறோம்.'),
('medicine_receipt', 'gu', 'નમસ્તે {PATIENT_NAME}, {CLINIC_NAME} ખાતે તમારી સંભાળ માટે આભાર. તમારી દવા ની રસીદ તમારા માટે તૈયાર છે. તમારી રસીદ ડાઉનલોડ કરો: {RECEIPT_LINK}. આ લિંક 7 દિવસ માટે સક્રિય રહેશે. કૃપયા સાવચેતી રાખો અને આપેલી સલાહ મુજબ તમારી દવાઓ લો. તમારા સુખી સ્વાસ્થ્યની આશા રાખીએ છીએ.'),
('medicine_receipt', 'kn', 'ನಮಸ್ಕಾರ {PATIENT_NAME}, {CLINIC_NAME} ನಲ್ಲಿ ನಿಮ್ಮ ಚಿಕಿತ್ಸೆಗೆ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ಔಷಧ ರಸೀದಿ ನಿಮಗೆ ಸಿದ್ಧವಾಗಿದೆ. ನಿಮ್ಮ ರಸೀದಿ ಡೌನ್‌ಲೋಡ್ ಮಾಡಿ: {RECEIPT_LINK}. ಈ ಲಿಂಕ್ 7 ದಿನಗಳ ಕಾಲ ಸಕ್ರಿಯವಾಗಿರುತ್ತದೆ. ದಯವಿಟ್ಟು ಸೂಚಿಸಿದಂತೆ ಸಮಾಲೋಚನೆ ಮತ್ತು ನಿಮ್ಮ ಔಷಧಗಳನ್ನು ಅನುಸರಿಸಿ. ನಿಮ್ಮ ಸುಸ್ಥ ಆರೋಗ್ಯಕ್ಕಾಗಿ ಹಾರೈಸುತ್ತಿದೆ.')
ON CONFLICT (type, language) DO NOTHING;