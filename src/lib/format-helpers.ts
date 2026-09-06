// src/lib/format-helpers.ts
//
// Item 5 (this chat):
//
// formatDoctorName — fixes the "Dr. Dr Bharat S P" doubled-prefix bug.
// The stored doctor name sometimes already includes a leading "Dr"/"Dr.",
// and several places in the app then prepend another "Dr. " on top of it
// when rendering. This strips any existing leading "Dr"/"Dr." (case-
// insensitive, with or without a period/space) before adding exactly one
// canonical "Dr. " prefix, so it's safe to call regardless of whether the
// stored name already has the prefix or not.
//
// formatPrescriptionDuration — normalizes a prescription's free-text
// duration field for display. A doctor may type a bare number ("3",
// meaning 3 days) or already-formatted text ("7 days", "2 weeks"). Bare
// numeric strings are expanded to "N days"/"1 day"; anything else is left
// untouched, so calling this on already-formatted text (including legacy
// rows saved before this fix) never doubles up into "7 days days".

export function stripDoctorPrefix(rawName: string): string {
  return rawName.trim().replace(/^dr\.?\s*/i, "")
}

export function formatDoctorName(rawName: string): string {
  return `Dr. ${stripDoctorPrefix(rawName)}`
}

export function formatPrescriptionDuration(raw: string | null | undefined): string {
  if (!raw) return ""
  const trimmed = raw.trim()
  if (!trimmed) return ""

  // Bare integer only (e.g. "3", "07") — expand to "N days"/"1 day".
  // Anything else (already has a unit, has spaces, non-numeric) passes
  // through unchanged rather than risk mangling text a doctor typed
  // deliberately (e.g. "7-10 days", "as directed").
  if (!/^\d+$/.test(trimmed)) return trimmed

  const n = parseInt(trimmed, 10)
  return `${n} day${n === 1 ? "" : "s"}`
}