import { LegalDocument } from '@/components/legal-document'
import { TERMS_OF_SERVICE_SECTIONS, TOS_VERSION } from '@/features/onboarding/legal-content'

export const metadata = { title: 'Terms of Service | CURAKIN HealthTech' }

export default function TermsPage() {
  return (
    <LegalDocument
      title="Terms of Service"
      version={TOS_VERSION}
      sections={TERMS_OF_SERVICE_SECTIONS}
    />
  )
}