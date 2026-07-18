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