/**
 * Tests for src/features/consent/types.ts
 * No real logic here, just static data - the one thing worth guarding is
 * that CONSENT_PURPOSES, CONSENT_PURPOSE_LABELS, and
 * CONSENT_PURPOSE_DESCRIPTIONS stay in sync, since nothing else would
 * catch a purpose added to one list and forgotten in another.
 */

import {
  CONSENT_PURPOSES,
  CONSENT_PURPOSE_LABELS,
  CONSENT_PURPOSE_DESCRIPTIONS,
} from '../../../features/consent/types'

describe('consent purpose data consistency', () => {
  it('has a label for every purpose in CONSENT_PURPOSES', () => {
    for (const purpose of CONSENT_PURPOSES) {
      expect(CONSENT_PURPOSE_LABELS[purpose]).toBeTruthy()
    }
  })

  it('has a description for every purpose in CONSENT_PURPOSES', () => {
    for (const purpose of CONSENT_PURPOSES) {
      expect(CONSENT_PURPOSE_DESCRIPTIONS[purpose]).toBeTruthy()
    }
  })

  it('has no label entries for purposes outside CONSENT_PURPOSES', () => {
    const labelKeys = Object.keys(CONSENT_PURPOSE_LABELS)
    expect(labelKeys.sort()).toEqual([...CONSENT_PURPOSES].sort())
  })

  it('has no description entries for purposes outside CONSENT_PURPOSES', () => {
    const descriptionKeys = Object.keys(CONSENT_PURPOSE_DESCRIPTIONS)
    expect(descriptionKeys.sort()).toEqual([...CONSENT_PURPOSES].sort())
  })

  it('has no duplicate purposes in the list', () => {
    expect(new Set(CONSENT_PURPOSES).size).toBe(CONSENT_PURPOSES.length)
  })
})