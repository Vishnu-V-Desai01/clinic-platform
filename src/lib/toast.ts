import { toast } from "sonner"

/**
 * Matches every server-action result shape used across features:
 *  - { success: boolean; error?: string; data?: T }   (most features)
 *  - { ok: boolean; error?: string; code?: string; data?: T }  (pharmacy/actions.ts only)
 */
type ResultLike = { success: boolean; error?: string } | { ok: boolean; error?: string; code?: string }

function isOk(result: ResultLike): boolean {
  return "success" in result ? result.success : result.ok
}

/**
 * Shared feedback helper for server-action results.
 *
 * - On failure: always shows a toast.error with the action's error message.
 * - On success: shows a toast.success ONLY if successMessage is provided.
 *   Pass no successMessage when the UI already gives feedback another way
 *   (e.g. a dialog opening) to avoid double-signalling.
 *
 * Returns the same boolean the caller would have branched on, so existing
 * `if (result.success)` control flow can be replaced with
 * `if (notifyResult(result, "...")) { ... }` without changing behavior.
 */
export function notifyResult(result: ResultLike, successMessage?: string): boolean {
  const ok = isOk(result)

  if (!ok) {
    toast.error(result.error ?? "Something went wrong")
    return false
  }

  if (successMessage) {
    toast.success(successMessage)
  }

  return true
}