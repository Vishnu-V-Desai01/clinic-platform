// src/lib/nav-config.ts
import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  Calendar,
  Receipt,
  MessageSquare,
  ClipboardCheck,
  Settings,
  BarChart3,
} from 'lucide-react'
import type { Role } from '@/lib/supabase/profile'

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  badgeCount?: number
}

export const navByRole: Record<Role, NavItem[]> = {
  doctor: [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { title: 'Analytics', href: '/dashboard/analytics', icon: BarChart3 },
    { title: 'Patients', href: '/dashboard/patients', icon: Users },
    { title: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
    { title: 'Payments', href: '/dashboard/payments', icon: Receipt },
    { title: 'Charge Approvals', href: '/dashboard/payments/approvals', icon: ClipboardCheck },
    { title: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
    // Settings moved to admin nav — clinic configuration is an admin responsibility
  ],
  staff: [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { title: 'Patients', href: '/dashboard/patients', icon: Users },
    { title: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
    { title: 'Payments', href: '/dashboard/payments', icon: Receipt },
    { title: 'Charge Approvals', href: '/dashboard/payments/approvals', icon: ClipboardCheck },
    { title: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  ],
  patient: [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { title: 'My Appointments', href: '/dashboard/appointments', icon: Calendar },
    { title: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  ],
}

// Shown when a doctor+admin user is inside /dashboard/admin/* or /dashboard/settings
export const adminModeNav: NavItem[] = [
  { title: 'Dashboard', href: '/dashboard/admin', icon: LayoutDashboard },
  { title: 'Team Members', href: '/dashboard/admin/users', icon: Users },
  { title: 'Settings', href: '/dashboard/settings', icon: Settings },
]