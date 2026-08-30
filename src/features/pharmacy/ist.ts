// src/features/pharmacy/ist.ts
//
// Shared IST time helpers. Pulled out of actions.ts because "use server"
// files may only export async server actions — these are plain sync helpers
// used by both server actions (actions.ts) and client-side display mapping
// (mappers.ts), and must stay identical between the two so a drug never
// shows as "expired" in one place and "OK" in another.

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;

export function todayIsoDateIst(): string {
  const istNow = new Date(Date.now() + IST_OFFSET_MS);
  return istNow.toISOString().slice(0, 10); // YYYY-MM-DD
}