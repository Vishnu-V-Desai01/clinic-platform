import { LegalDocument } from '@/components/legal-document'
import { PRIVACY_POLICY_SECTIONS, TOS_VERSION } from '@/features/onboarding/legal-content'

export const metadata = { title: 'Privacy Policy | CURAKIN HealthTech' }

export default function PrivacyPage() {
  return (
    <LegalDocument
      title="Privacy Policy"
      version={TOS_VERSION}
      sections={PRIVACY_POLICY_SECTIONS}
    />
  )
}