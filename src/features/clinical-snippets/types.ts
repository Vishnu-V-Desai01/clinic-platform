// src/features/clinical-snippets/types.ts
//
// Item 7a: doctor-scoped saved snippets for clinical notes. Each doctor
// manages and sees only their own — no clinic-wide sharing, per the
// confirmed scope decision.

export type ClinicalNoteSnippet = {
  id: string
  title: string
  body: string
  createdAt: string
  updatedAt: string
}