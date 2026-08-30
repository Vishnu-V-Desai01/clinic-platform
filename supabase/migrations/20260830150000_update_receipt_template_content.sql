-- supabase/migrations/20260830150000_update_receipt_template_content.sql
--
-- Item 3b: the 'receipt' template no longer sends a treatment-PDF
-- download link. Patients now view treatment details by logging into
-- their portal (/patient-portal), which they can already do per the
-- family-account system built earlier. {{4}} changes from a
-- per-payment expiring document token to a single static portal URL —
-- same link for every patient, every time, no expiry.
--
-- Content already matches what's live and Meta-approved on MSG91 for
-- all 5 languages as of this migration.

UPDATE message_templates
SET content = 'Hi {PATIENT_NAME}, thank you for visiting {CLINIC_NAME}. Your receipt is ready, and your treatment details are available in your patient profile. Receipt: {RECEIPT_LINK} To view your treatment details, please visit your profile: {PROFILE_LINK} The receipt link is active for 7 days. Please take care, and we wish you continued good health.'
WHERE type = 'receipt' AND language = 'en';

UPDATE message_templates
SET content = 'नमस्ते {PATIENT_NAME}, {CLINIC_NAME} में आने के लिए धन्यवाद। आपकी रसीद तैयार है, और आपके इलाज का विवरण आपकी पेशेंट प्रोफ़ाइल में उपलब्ध है। रसीद: {RECEIPT_LINK} इलाज का विवरण देखने के लिए अपनी प्रोफ़ाइल पर जाएँ: {PROFILE_LINK} रसीद लिंक 7 दिनों तक सक्रिय रहेगा। अपना ध्यान रखें, हम आपके उत्तम स्वास्थ्य की कामना करते हैं।'
WHERE type = 'receipt' AND language = 'hi';

UPDATE message_templates
SET content = 'வணக்கம் {PATIENT_NAME}, {CLINIC_NAME} க்கு வருகை தந்தமைக்கு நன்றி. உங்கள் ரசீது தயாராக உள்ளது, உங்கள் சிகிச்சை விவரங்கள் உங்கள் நோயாளி சுயவிவரத்தில் கிடைக்கும். ரசீது: {RECEIPT_LINK} சிகிச்சை விவரங்களைக் காண உங்கள் சுயவிவரத்திற்குச் செல்லவும்: {PROFILE_LINK} ரசீது இணைப்பு 7 நாட்களுக்கு செயல்படும். உங்களைப் பேணிக்கொள்ளுங்கள், நல்ல ஆரோக்கியம் வாழ்த்துகிறோம்.'
WHERE type = 'receipt' AND language = 'ta';

UPDATE message_templates
SET content = 'નમસ્તે {PATIENT_NAME}, {CLINIC_NAME} ની મુલાકાત લેવા બદલ આભાર. તમારી રસીદ તૈયાર છે, અને તમારી સારવારની વિગતો તમારી પેશન્ટ પ્રોફાઇલમાં ઉપલબ્ધ છે. રસીદ: {RECEIPT_LINK} સારવારની વિગતો જોવા માટે તમારી પ્રોફાઇલ પર જાઓ: {PROFILE_LINK} રસીદ લિંક 7 દિવસ સુધી ચાલુ રહેશે. તમારી સંભાળ રાખો, અમે તમારા સારા સ્વાસ્થ્યની કામના કરીએ છીએ.'
WHERE type = 'receipt' AND language = 'gu';

UPDATE message_templates
SET content = 'ನಮಸ್ಕಾರ {PATIENT_NAME}, {CLINIC_NAME} ಗೆ ಭೇಟಿ ನೀಡಿದ್ದಕ್ಕಾಗಿ ಧನ್ಯವಾದಗಳು. ನಿಮ್ಮ ರಸೀದಿ ಸಿದ್ಧವಾಗಿದೆ, ಮತ್ತು ನಿಮ್ಮ ಚಿಕಿತ್ಸೆಯ ವಿವರಗಳು ನಿಮ್ಮ ಪೇಷಂಟ್ ಪ್ರೊಫೈಲ್‌ನಲ್ಲಿ ಲಭ್ಯವಿದೆ. ರಸೀದಿ: {RECEIPT_LINK} ಚಿಕಿತ್ಸೆಯ ವಿವರಗಳನ್ನು ನೋಡಲು ನಿಮ್ಮ ಪ್ರೊಫೈಲ್‌ಗೆ ಭೇಟಿ ನೀಡಿ: {PROFILE_LINK} ರಸೀದಿ ಲಿಂಕ್ 7 ದಿನಗಳವರೆಗೆ ಸಕ್ರಿಯವಾಗಿರುತ್ತದೆ. ನಿಮ್ಮ ಆರೋಗ್ಯ ಕಾಪಾಡಿಕೊಳ್ಳಿ, ಶುಭವಾಗಲಿ.'
WHERE type = 'receipt' AND language = 'kn';