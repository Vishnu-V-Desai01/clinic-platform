import type { LucideIcon } from 'lucide-react'
import {
  LayoutDashboard,
  Users,
  Calendar,
  ClipboardList,
  Receipt,
  MessageSquare,
} from 'lucide-react'
import type { Role } from '@/lib/supabase/profile'

export type NavItem = {
  title: string
  href: string
  icon: LucideIcon
  // Populated by the future messaging chat. Leave undefined for now.
  badgeCount?: number
}

export const navByRole: Record<Role, NavItem[]> = {
  doctor: [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { title: 'Patients', href: '/dashboard/patients', icon: Users },
    { title: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
    { title: 'Care plans', href: '/dashboard/care-plans', icon: ClipboardList },
    { title: 'Payments', href: '/dashboard/payments', icon: Receipt },
    { title: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  ],
  staff: [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { title: 'Patients', href: '/dashboard/patients', icon: Users },
    { title: 'Appointments', href: '/dashboard/appointments', icon: Calendar },
    { title: 'Care plans', href: '/dashboard/care-plans', icon: ClipboardList },
    { title: 'Payments', href: '/dashboard/payments', icon: Receipt },
    { title: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  ],
  patient: [
    { title: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { title: 'My appointments', href: '/dashboard/appointments', icon: Calendar },
    { title: 'My care plan', href: '/dashboard/care-plans', icon: ClipboardList },
    { title: 'My payments', href: '/dashboard/payments', icon: Receipt },
    { title: 'Messages', href: '/dashboard/messages', icon: MessageSquare },
  ],
}