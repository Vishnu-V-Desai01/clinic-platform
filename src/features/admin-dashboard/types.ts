export type AdminDashboardKpis = {
  totalRevenuePaise: number
  totalPatients: number
  appointmentsToday: number
  activeStaff: number
}

export type ActivityPoint = {
  date: string
  appointments: number
}

// Objective 9 — discounted medicine bills, surfaced on the admin dashboard.
export type DiscountedMedicineBill = {
  id: string
  patientName: string
  doctorName: string
  dispensedByName: string
  originalAmountPaise: number
  finalAmountPaise: number
  discountAmountPaise: number
  createdAt: string
}