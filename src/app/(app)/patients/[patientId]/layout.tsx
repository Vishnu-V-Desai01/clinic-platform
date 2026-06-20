// src/app/(app)/patients/[patientId]/layout.tsx

import { ReactNode } from 'react';

interface PatientLayoutProps {
  children: ReactNode;
  params: Promise<{ patientId: string }>;
}

export default async function PatientLayout({ children, params }: PatientLayoutProps) {
  const { patientId } = await params;

  return <>{children}</>;
}