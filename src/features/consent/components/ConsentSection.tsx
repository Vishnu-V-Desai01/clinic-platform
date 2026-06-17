import { getPatientConsents } from '../actions'
import ConsentManager from './ConsentManager'

interface ConsentSectionProps {
  patientId: string
}

export default async function ConsentSection({ patientId }: ConsentSectionProps) {
  const rawConsents = await getPatientConsents(patientId)

  // Map to the minimal view type ConsentPanel expects
  const consents = rawConsents.map((c) => ({
    id:         c.id,
    purpose:    c.purpose,
    is_active:  c.is_active,
    granted_at: c.granted_at,
    revoked_at: c.revoked_at,
  }))

  return <ConsentManager consents={consents} patientId={patientId} />
}