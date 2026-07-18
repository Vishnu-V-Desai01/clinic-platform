/**
 * Tests for src/features/medical-records/actions.ts
 *
 * Covers getEncountersForPatient, getEncounterWithDetails, and
 * createEncounter - the three functions whose design questions are
 * settled. The rest (addDiagnosis/addObservation/addPrescription/
 * addTestResult, the update*Status functions) are covered in later steps.
 *
 * Unlike every other feature tested so far, this file uses
 * getOrCreateProfile() directly with manual role checks, not
 * requireRole() - so it never redirects, and there's no
 * "getOrCreateProfile mocked as a trusted boundary" reuse from
 * lib/supabase/profile.test.ts to lean on beyond the function itself
 * already being fully tested there.
 */

jest.mock('@/lib/supabase/profile', () => ({
  getOrCreateProfile: jest.fn(),
}))

jest.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: jest.fn(),
}))

import { getOrCreateProfile } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import {
  getEncountersForPatient,
  getEncounterWithDetails,
  createEncounter,
  addDiagnosis,
  addObservation,
  addPrescription,
  addTestResult,
} from '../../../features/medical-records/actions'

function makeChain(result: { data: any; error: any }) {
  const chain: any = {}
  const methods = ['select', 'eq', 'is', 'in', 'order', 'update', 'insert', 'upsert']
  for (const m of methods) chain[m] = jest.fn(() => chain)
  chain.single = jest.fn(() => Promise.resolve(result))
  chain.maybeSingle = jest.fn(() => Promise.resolve(result))
  chain.then = (resolve: any, reject: any) => Promise.resolve(result).then(resolve, reject)
  return chain
}

function makeSupabaseClient(...results: { data: any; error: any }[]) {
  const chains = results.map(makeChain)
  const from = jest.fn()
  chains.forEach((chain) => from.mockReturnValueOnce(chain))
  return { from, chains }
}

function makeProfile(overrides: { id?: string; clinic_id?: string | null; role?: string } = {}): any {
  return {
    id: overrides.id ?? 'doctor-1',
    // clinic_id uses `in` rather than `??` on purpose: `??` can't tell
    // "not provided" from "explicitly null".
    clinic_id: 'clinic_id' in overrides ? overrides.clinic_id : 'clinic-a',
    role: overrides.role ?? 'doctor',
    clerk_user_id: 'clerk-1',
    email: 'doc@test.clinic',
    full_name: 'Dr Test',
  }
}

describe('getEncountersForPatient', () => {
  it('returns encounters ordered newest first for a doctor', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ role: 'doctor' }))
    const encounters = [{ id: 'e1', encounter_date: '2026-07-10' }, { id: 'e2', encounter_date: '2026-07-01' }]
    const { from, chain } = (() => {
      const c = makeSupabaseClient({ data: encounters, error: null })
      return { from: c.from, chain: c.chains[0] }
    })()
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getEncountersForPatient('p1')

    expect(result).toEqual({ data: encounters })
    expect(chain.eq).toHaveBeenCalledWith('patient_id', 'p1')
    expect(chain.order).toHaveBeenCalledWith('encounter_date', { ascending: false })
  })

  it('returns an empty array, not null, when there are no encounters', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getEncountersForPatient('p1')

    expect(result).toEqual({ data: [] })
  })

  it('works for staff too', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ role: 'staff' }))
    const { from } = makeSupabaseClient({ data: [], error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getEncountersForPatient('p1')

    expect(result).toEqual({ data: [] })
  })

  it('FIXED: rejects a patient-role caller (previously any authenticated role could call this)', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ role: 'patient' }))

    const result = await getEncountersForPatient('p1')

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns Unauthorized when there is no profile at all', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(null)

    const result = await getEncountersForPatient('p1')

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('surfaces the query error message directly', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'db down' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getEncountersForPatient('p1')

    expect(result).toEqual({ error: 'db down' })
  })

  it('falls back to a generic error if something throws unexpectedly', async () => {
    jest.mocked(getOrCreateProfile).mockRejectedValue(new Error('unexpected'))

    const result = await getEncountersForPatient('p1')

    expect(result).toEqual({ error: 'Failed to load encounters' })
  })
})

describe('getEncounterWithDetails', () => {
  const encounterRow = {
    id: 'enc-1',
    clinic_id: 'clinic-a',
    patient_id: 'p1',
    doctor_id: 'doctor-1',
    encounter_date: '2026-07-15',
    chief_complaint: 'Fever',
    notes: null,
    status: 'active',
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
  }

  // Order matches the Promise.all array in the source exactly:
  // encounters, diagnoses, observations, prescriptions, test_results.
  function makeFiveResults(overrides: {
    encounter?: { data: any; error: any }
    diagnoses?: { data: any; error: any }
    observations?: { data: any; error: any }
    prescriptions?: { data: any; error: any }
    testResults?: { data: any; error: any }
  } = {}) {
    return makeSupabaseClient(
      overrides.encounter ?? { data: encounterRow, error: null },
      overrides.diagnoses ?? { data: [], error: null },
      overrides.observations ?? { data: [], error: null },
      overrides.prescriptions ?? { data: [], error: null },
      overrides.testResults ?? { data: [], error: null },
    )
  }

  it('returns Unauthorized when there is no profile', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(null)

    const result = await getEncounterWithDetails('enc-1')

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('FIXED: rejects a patient-role caller', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ role: 'patient' }))

    const result = await getEncounterWithDetails('enc-1')

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('returns the encounter with all children when everything loads successfully, no warnings key', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const diagnoses = [{ id: 'd1', condition_name: 'Flu' }]
    const { from } = makeFiveResults({ diagnoses: { data: diagnoses, error: null } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getEncounterWithDetails('enc-1')

    expect(result).toEqual({
      data: {
        ...encounterRow,
        diagnoses,
        observations: [],
        prescriptions: [],
        test_results: [],
      },
    })
  })

  it('returns "Encounter not found" when the encounter query succeeds with no row', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeFiveResults({ encounter: { data: null, error: null } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getEncounterWithDetails('missing-id')

    expect(result).toEqual({ error: 'Encounter not found' })
  })

  it('surfaces the encounter query error directly and does not fall back to warnings for it', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeFiveResults({ encounter: { data: null, error: { message: 'db down' } } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getEncounterWithDetails('enc-1')

    expect(result).toEqual({ error: 'db down' })
  })

  it('FIXED: a failed diagnoses query no longer looks identical to "no diagnoses" - it is flagged via warnings, and the rest of the encounter still loads', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const observations = [{ id: 'o1', observation_type: 'temperature', value: '101.4' }]
    const { from } = makeFiveResults({
      diagnoses: { data: null, error: { message: 'connection reset' } },
      observations: { data: observations, error: null },
    })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getEncounterWithDetails('enc-1')

    expect(result).toEqual({
      data: {
        ...encounterRow,
        diagnoses: [],
        observations,
        prescriptions: [],
        test_results: [],
      },
      warnings: ['Some diagnoses could not be loaded.'],
    })
    consoleErrorSpy.mockRestore()
  })

  it('FIXED: multiple failed child queries produce multiple distinct warnings', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeFiveResults({
      observations: { data: null, error: { message: 'fail' } },
      testResults: { data: null, error: { message: 'fail' } },
    })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await getEncounterWithDetails('enc-1')

    expect('warnings' in result && result.warnings).toEqual([
      'Some observations could not be loaded.',
      'Some test results could not be loaded.',
    ])
    consoleErrorSpy.mockRestore()
  })

  it('falls back to a generic error if something throws unexpectedly', async () => {
    jest.mocked(getOrCreateProfile).mockRejectedValue(new Error('unexpected'))

    const result = await getEncounterWithDetails('enc-1')

    expect(result).toEqual({ error: 'Failed to load encounter details' })
  })
})

describe('createEncounter', () => {
  const validInput = {
    encounter_date: '2026-07-15',
    chief_complaint: 'Fever and cough',
    diagnoses: [{ condition_name: 'Viral fever', status: 'active' }],
    observations: [{ observation_type: 'temperature', value: '101.4' }],
    prescriptions: [{ medicine_name: 'Paracetamol', status: 'active' }],
  }

  it('returns Unauthorized when there is no profile', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(null)

    const result = await createEncounter('p1', validInput)

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects a staff caller - doctor only', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ role: 'staff' }))

    const result = await createEncounter('p1', validInput)

    expect(result).toEqual({ error: 'Only doctors can create encounters' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects invalid input with the schema error, before touching the database', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())

    const result = await createEncounter('p1', { encounter_date: '' })

    expect(result).toEqual({ error: 'Encounter date is required' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('creates an encounter with no children and no warnings key when nothing to save', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ id: 'doctor-1', clinic_id: 'clinic-a' }))
    const { from, chains } = makeSupabaseClient({ data: { id: 'enc-1' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await createEncounter('p1', { encounter_date: '2026-07-15' })

    expect(result).toEqual({ success: true, encounterId: 'enc-1' })
    expect(chains[0].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: 'clinic-a',
        patient_id: 'p1',
        doctor_id: 'doctor-1',
        encounter_date: '2026-07-15',
        status: 'active',
      }),
    )
  })

  it('creates an encounter with all children saved successfully, no warnings', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null }, // encounter insert
      { data: null, error: null }, // diagnoses insert
      { data: null, error: null }, // observations insert
      { data: null, error: null }, // prescriptions insert
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await createEncounter('p1', validInput)

    expect(result).toEqual({ success: true, encounterId: 'enc-1' })
    expect(chains[1].insert).toHaveBeenCalledWith([
      expect.objectContaining({ condition_name: 'Viral fever', encounter_id: 'enc-1', patient_id: 'p1' }),
    ])
    expect(chains[2].insert).toHaveBeenCalledWith([
      expect.objectContaining({ observation_type: 'temperature', value: '101.4' }),
    ])
    expect(chains[3].insert).toHaveBeenCalledWith([
      expect.objectContaining({ medicine_name: 'Paracetamol' }),
    ])
  })

  it('does not attempt an insert for a child type with an empty array', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient({ data: { id: 'enc-1' }, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await createEncounter('p1', { encounter_date: '2026-07-15' })

    // Only the encounter insert should have happened - from() called once
    expect(from).toHaveBeenCalledTimes(1)
    expect(chains).toHaveLength(1)
  })

  it('FIXED: a failed diagnoses batch is surfaced via warnings, and other children still get attempted', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: null, error: { message: 'constraint violation' } }, // diagnoses fails
      { data: null, error: null }, // observations still attempted, succeeds
      { data: null, error: null }, // prescriptions still attempted, succeeds
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await createEncounter('p1', validInput)

    expect(result).toEqual({
      success: true,
      encounterId: 'enc-1',
      warnings: ['Some diagnoses could not be saved.'],
    })
    // Confirm observations/prescriptions were still attempted despite diagnoses failing
    expect(chains[2].insert).toHaveBeenCalled()
    expect(chains[3].insert).toHaveBeenCalled()
    consoleErrorSpy.mockRestore()
  })

  it('FIXED: multiple failed batches produce multiple warnings', async () => {
    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {})
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: null, error: { message: 'fail' } }, // diagnoses fails
      { data: null, error: { message: 'fail' } }, // observations fails
      { data: null, error: null }, // prescriptions succeeds
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await createEncounter('p1', validInput)

    expect(result).toEqual({
      success: true,
      encounterId: 'enc-1',
      warnings: [
        'Some diagnoses could not be saved.',
        'Some observations could not be saved.',
      ],
    })
    consoleErrorSpy.mockRestore()
  })

  it('returns an error and never attempts children inserts when the encounter insert itself fails', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'insert failed' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await createEncounter('p1', validInput)

    expect(result).toEqual({ error: 'insert failed' })
    expect(from).toHaveBeenCalledTimes(1)
  })

  it('falls back to a generic error if something throws unexpectedly', async () => {
    jest.mocked(getOrCreateProfile).mockRejectedValue(new Error('unexpected'))

    const result = await createEncounter('p1', validInput)

    expect(result).toEqual({ error: 'Failed to create encounter' })
  })
})

describe('addDiagnosis', () => {
  const validInput = { condition_name: 'Hypertension', status: 'active' }

  it('rejects a staff caller - doctor only', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ role: 'staff' }))

    const result = await addDiagnosis('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'Only doctors can add diagnoses' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects invalid input with the schema error, before touching the database', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())

    const result = await addDiagnosis('enc-1', 'p1', { condition_name: '' })

    expect(result).toEqual({ error: 'Condition name is required' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('FIXED: verifies the encounter belongs to the caller\'s clinic before inserting', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const { from, chains } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null }, // ownership check
      { data: { id: 'diag-1', ...validInput }, error: null }, // insert
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    await addDiagnosis('enc-1', 'p1', validInput)

    expect(chains[0].eq).toHaveBeenCalledWith('id', 'enc-1')
    expect(chains[0].eq).toHaveBeenCalledWith('clinic_id', 'clinic-a')
  })

  it('FIXED: rejects with no insert attempted when the encounter is not in this clinic', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addDiagnosis('enc-from-another-clinic', 'p1', validInput)

    expect(result).toEqual({ error: 'Encounter not found' })
    expect(chains[0].insert).not.toHaveBeenCalled()
  })

  it('surfaces an error from the ownership check itself', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient({ data: null, error: { message: 'db down' } })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addDiagnosis('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'db down' })
  })

  it('inserts and returns the created diagnosis on success', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const created = { id: 'diag-1', condition_name: 'Hypertension', status: 'active' }
    const { from, chains } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: created, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addDiagnosis('enc-1', 'p1', validInput)

    expect(result).toEqual({ success: true, data: created })
    expect(chains[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({
        clinic_id: 'clinic-a',
        encounter_id: 'enc-1',
        patient_id: 'p1',
        condition_name: 'Hypertension',
      }),
    )
  })

  it('surfaces the insert error message directly', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: null, error: { message: 'constraint violation' } },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addDiagnosis('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'constraint violation' })
  })

  it('falls back to a generic error if something throws unexpectedly', async () => {
    jest.mocked(getOrCreateProfile).mockRejectedValue(new Error('unexpected'))

    const result = await addDiagnosis('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'Failed to add diagnosis' })
  })
})

describe('addObservation', () => {
  const validInput = { observation_type: 'blood_pressure', value: '120/80' }

  it('rejects a staff caller - doctor only', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ role: 'staff' }))

    const result = await addObservation('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'Only doctors can add observations' })
  })

  it('rejects invalid input with the schema error', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())

    const result = await addObservation('enc-1', 'p1', { observation_type: '', value: '' })

    expect(result).toEqual({ error: 'Observation type is required' })
  })

  it('FIXED: rejects with no insert attempted when the encounter is not in this clinic', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addObservation('enc-from-another-clinic', 'p1', validInput)

    expect(result).toEqual({ error: 'Encounter not found' })
    expect(chains[0].insert).not.toHaveBeenCalled()
  })

  it('inserts and returns the created observation on success', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const created = { id: 'obs-1', ...validInput }
    const { from, chains } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: created, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addObservation('enc-1', 'p1', validInput)

    expect(result).toEqual({ success: true, data: created })
    expect(chains[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({ observation_type: 'blood_pressure', value: '120/80' }),
    )
  })

  it('surfaces the insert error message directly', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: null, error: { message: 'insert failed' } },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addObservation('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'insert failed' })
  })

  it('falls back to a generic error if something throws unexpectedly', async () => {
    jest.mocked(getOrCreateProfile).mockRejectedValue(new Error('unexpected'))

    const result = await addObservation('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'Failed to add observation' })
  })
})

describe('addPrescription', () => {
  const validInput = { medicine_name: 'Amoxicillin' }

  it('rejects a staff caller - doctor only', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ role: 'staff' }))

    const result = await addPrescription('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'Only doctors can add prescriptions' })
  })

  it('rejects invalid input with the schema error', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())

    const result = await addPrescription('enc-1', 'p1', { medicine_name: '' })

    expect(result).toEqual({ error: 'Medicine name is required' })
  })

  it('FIXED: rejects with no insert attempted when the encounter is not in this clinic', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addPrescription('enc-from-another-clinic', 'p1', validInput)

    expect(result).toEqual({ error: 'Encounter not found' })
    expect(chains[0].insert).not.toHaveBeenCalled()
  })

  it('inserts and returns the created prescription on success', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const created = { id: 'rx-1', medicine_name: 'Amoxicillin', status: 'active' }
    const { from, chains } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: created, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addPrescription('enc-1', 'p1', validInput)

    expect(result).toEqual({ success: true, data: created })
    expect(chains[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({ medicine_name: 'Amoxicillin' }),
    )
  })

  it('surfaces the insert error message directly', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: null, error: { message: 'insert failed' } },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addPrescription('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'insert failed' })
  })

  it('falls back to a generic error if something throws unexpectedly', async () => {
    jest.mocked(getOrCreateProfile).mockRejectedValue(new Error('unexpected'))

    const result = await addPrescription('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'Failed to add prescription' })
  })
})

describe('addTestResult', () => {
  const validInput = { test_name: 'CBC' }

  it('allows staff, not just doctor (different from the other three add* functions)', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ role: 'staff', clinic_id: 'clinic-a' }))
    const { from } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: { id: 'tr-1', ...validInput }, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addTestResult('enc-1', 'p1', validInput)

    expect('success' in result && result.success).toBe(true)
  })

  it('rejects a patient caller', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ role: 'patient' }))

    const result = await addTestResult('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'Unauthorized' })
    expect(createServerSupabaseClient).not.toHaveBeenCalled()
  })

  it('rejects invalid input with the schema error', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())

    const result = await addTestResult('enc-1', 'p1', { test_name: '' })

    expect(result).toEqual({ error: 'Test name is required' })
  })

  it('FIXED: rejects with no insert attempted when the encounter is not in this clinic', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from, chains } = makeSupabaseClient({ data: null, error: null })
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addTestResult('enc-from-another-clinic', 'p1', validInput)

    expect(result).toEqual({ error: 'Encounter not found' })
    expect(chains[0].insert).not.toHaveBeenCalled()
  })

  it('inserts and returns the created test result on success', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile({ clinic_id: 'clinic-a' }))
    const created = { id: 'tr-1', test_name: 'CBC', status: 'ordered' }
    const { from, chains } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: created, error: null },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addTestResult('enc-1', 'p1', validInput)

    expect(result).toEqual({ success: true, data: created })
    expect(chains[1].insert).toHaveBeenCalledWith(
      expect.objectContaining({ test_name: 'CBC' }),
    )
  })

  it('surfaces the insert error message directly', async () => {
    jest.mocked(getOrCreateProfile).mockResolvedValue(makeProfile())
    const { from } = makeSupabaseClient(
      { data: { id: 'enc-1' }, error: null },
      { data: null, error: { message: 'insert failed' } },
    )
    jest.mocked(createServerSupabaseClient).mockReturnValue({ from } as any)

    const result = await addTestResult('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'insert failed' })
  })

  it('falls back to a generic error if something throws unexpectedly', async () => {
    jest.mocked(getOrCreateProfile).mockRejectedValue(new Error('unexpected'))

    const result = await addTestResult('enc-1', 'p1', validInput)

    expect(result).toEqual({ error: 'Failed to add test result' })
  })
})