'use server'

import { requireRole } from '@/lib/supabase/profile'
import { createServerSupabaseClient } from '@/lib/supabase/server'
import type { AdminDashboardKpis, ActivityPoint } from './types'

type ActionResult<T> =
  | { success: true; data: T }
  | { success: false; error: string }

export async function getAdminDashboardKpis(): Promise<ActionResult<AdminDashboardKpis>> {
  const profile = await requireRole('doctor', 'staff')
  if (!profile.is_clinic_admin) {
    return { success: false, error: 'Only clinic admins can view dashboard KPIs' }
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('get_admin_dashboard_kpis').maybeSingle()

  if (error || !data) {
    return { success: false, error: error?.message ?? 'Failed to load dashboard KPIs' }
  }

  const row = data as {
    total_revenue_paise: number
    total_patients: number
    appointments_today: number
    active_staff: number
  }

  return {
    success: true,
    data: {
      totalRevenuePaise: row.total_revenue_paise,
      totalPatients: row.total_patients,
      appointmentsToday: row.appointments_today,
      activeStaff: row.active_staff,
    },
  }
}

export async function getClinicActivity(): Promise<ActionResult<ActivityPoint[]>> {
  const profile = await requireRole('doctor', 'staff')
  if (!profile.is_clinic_admin) {
    return { success: false, error: 'Only clinic admins can view clinic activity' }
  }

  const supabase = createServerSupabaseClient()
  const { data, error } = await supabase.rpc('get_clinic_activity_last_30_days')

  if (error) {
    return { success: false, error: error.message }
  }

  const rows = (data ?? []) as { activity_date: string; appointment_count: number }[]

  return {
    success: true,
    data: rows.map((r) => ({ date: r.activity_date, appointments: r.appointment_count })),
  }
}

// ---------------------------------------------------------------------------
// Objective 9 (Chat C follow-up) — discounted medicine bills, admin-only.
// Thin pass-through to the pharmacy feature, same pattern as
// listRecentMedicineSales in staff-dashboard/actions.ts. Fails soft: an
// error or an un-enabled pharmacy module should hide the card, not break
// the rest of the admin dashboard.
// ---------------------------------------------------------------------------

export type DiscountedMedicineBillView = {
  id: string
  patientName: string
  doctorName: string
  dispensedByName: string
  originalAmountPaise: number
  finalAmountPaise: number
  discountAmountPaise: number
  createdAt: string
}

export async function getDiscountedMedicineBills(): Promise<ActionResult<DiscountedMedicineBillView[]>> {
  const profile = await requireRole('doctor', 'staff')
  if (!profile.is_clinic_admin) {
    return { success: false, error: 'Only clinic admins can view discounted bills' }
  }

  const { getDiscountedMedicineBills: getBills } = await import('@/features/pharmacy/actions')
  const result = await getBills(10)

  if (!result.ok) {
    return { success: true, data: [] } // fail soft — see comment above
  }

  return {
    success: true,
    data: result.data.map((row) => ({
      id: row.id,
      patientName: row.patient_name,
      doctorName: row.doctor_name,
      dispensedByName: row.dispensed_by_name,
      originalAmountPaise: row.original_amount_paise,
      finalAmountPaise: row.final_amount_paise,
      discountAmountPaise: row.discount_amount_paise,
      createdAt: row.created_at,
    })),
  }
}