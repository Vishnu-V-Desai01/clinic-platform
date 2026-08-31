// src/lib/sounds.ts
//
// Professional, warm-toned sound effects using Tone.js.
// All sounds are kept brief and pleasant to relieve stress, not add to it.
// Sounds only play on explicit user actions (submit, success, error),
// not on every hover or minor interaction.

import * as Tone from 'tone'

type SoundType = 'success' | 'error' | 'submit' | 'open' | 'close'

// Singleton synth for all sounds — reuse rather than create per-sound
let synth: Tone.Synth | null = null

async function initSynth() {
  if (synth) return
  await Tone.start()
  synth = new Tone.Synth({
    oscillator: { type: 'triangle' },
    envelope: {
      attack: 0.005,
      decay: 0.1,
      sustain: 0,
      release: 0.1,
    },
  }).toDestination()
}

/**
 * Success sound — ascending melody, warm and affirming.
 * Used when patient saved, appointment confirmed, message sent.
 */
async function playSuccess() {
  await initSynth()
  if (!synth) return

  // Ascending three-note melody in warm frequency range
  const now = Tone.now()
  synth.triggerAttackRelease('C4', '0.1', now)
  synth.triggerAttackRelease('E4', '0.1', now + 0.15)
  synth.triggerAttackRelease('G4', '0.15', now + 0.3)
}

/**
 * Error sound — descending warning, but not harsh.
 * Used on form validation failure, API error, permission denied.
 */
async function playError() {
  await initSynth()
  if (!synth) return

  const now = Tone.now()
  synth.triggerAttackRelease('A4', '0.1', now)
  synth.triggerAttackRelease('F4', '0.15', now + 0.12)
}

/**
 * Submit sound — confirmatory beep, clear and brief.
 * Used on form submission, payment confirmation, important action.
 */
async function playSubmit() {
  await initSynth()
  if (!synth) return

  const now = Tone.now()
  synth.triggerAttackRelease('G4', '0.08', now)
  synth.triggerAttackRelease('G4', '0.12', now + 0.1)
}

/**
 * Open sound — gentle rising tone when modals, drawers, or sidebars open.
 */
async function playOpen() {
  await initSynth()
  if (!synth) return

  const now = Tone.now()
  synth.triggerAttackRelease('D4', '0.15', now)
}

/**
 * Close sound — gentle falling tone when modals, drawers, or sidebars close.
 */
async function playClose() {
  await initSynth()
  if (!synth) return

  const now = Tone.now()
  synth.triggerAttackRelease('B3', '0.15', now)
}

/**
 * Play a sound by type. Safe to call even if audio context isn't ready.
 */
export async function playSound(type: SoundType) {
  try {
    switch (type) {
      case 'success':
        await playSuccess()
        break
      case 'error':
        await playError()
        break
      case 'submit':
        await playSubmit()
        break
      case 'open':
        await playOpen()
        break
      case 'close':
        await playClose()
        break
    }
  } catch (err) {
    // Silently fail if audio context can't init (e.g., browser doesn't support it)
    // This is a nice-to-have, not a blocker
    console.debug('[playSound] audio context failed:', err)
  }
}

/**
 * Helper hook for React components to play sounds.
 * Use in onClick handlers or async operations.
 */
export function useSound() {
  return {
    success: () => playSound('success'),
    error: () => playSound('error'),
    submit: () => playSound('submit'),
    open: () => playSound('open'),
    close: () => playSound('close'),
  }
}