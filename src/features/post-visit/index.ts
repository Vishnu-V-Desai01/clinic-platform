// src/features/post-visit/index.ts
// Public surface for the post-visit feature.
// All consumers import from here — never directly from internals.

export { default as CompleteVisitModal } from './components/CompleteVisitModal'
export { default as MarkCompleteButton } from './components/MarkCompleteButton'

export { completeVisit, getVisitPrefill } from './actions'

export type {
  CompleteVisitPayload,
  CompleteVisitResult,
  VisitPrefill,
  WizardState,
  WizardStep,
} from './types'