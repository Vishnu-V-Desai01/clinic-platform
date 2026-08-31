// src/components/app-sidebar.tsx
'use client'

import Link from 'next/link'
import {
  Activity,
  BarChart3,
  CalendarClock,
  Clock,
  FileText,
  MessageSquare,
  Pill,
  Settings,
  Shield,
  Users,
} from 'lucide-react'

import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from '@/components/ui/sidebar'
import { CurakiLogoBrand } from '@/components/curakin-logo'
import type { Profile } from '@/lib/supabase/profile'

interface AppSidebarProps {
  profile: Profile
  pharmacyEnabled: boolean
}

export function AppSidebar({ profile, pharmacyEnabled }: AppSidebarProps) {
  const { open } = useSidebar()

  // Role-based menu items
  const doctorMenuItems = [
    {
      title: 'Dashboard',
      url: '/dashboard',
      icon: BarChart3,
      description: 'Analytics and overview',
    },
    {
      title: 'Patients',
      url: '/dashboard/patients',
      icon: Users,
      description: 'Manage patient records',
    },
    {
      title: 'Appointments',
      url: '/dashboard/appointments',
      icon: CalendarClock,
      description: 'Schedule and track appointments',
    },
    {
      title: 'Medical Records',
      url: '/dashboard/medical-records',
      icon: FileText,
      description: 'Clinical notes and history',
    },
    {
      title: 'Messages',
      url: '/dashboard/messages',
      icon: MessageSquare,
      description: 'WhatsApp reminders and communications',
    },
    ...(pharmacyEnabled
      ? [
          {
            title: 'Pharmacy',
            url: '/dashboard/pharmacy',
            icon: Pill,
            description: 'Manage pharmacy and prescriptions',
          },
        ]
      : []),
    {
      title: 'Payments',
      url: '/dashboard/payments',
      icon: Activity,
      description: 'Billing and payment tracking',
    },
    {
      title: 'Settings',
      url: '/dashboard/settings',
      icon: Settings,
      description: 'Profile and clinic settings',
    },
  ]

  const staffMenuItems = [
    {
      title: 'Dashboard',
      url: '/dashboard/overview',
      icon: BarChart3,
      description: 'Clinic overview and quick actions',
    },
    {
      title: 'Patients',
      url: '/dashboard/patients',
      icon: Users,
      description: 'Manage patient records',
    },
    {
      title: 'Appointments',
      url: '/dashboard/appointments',
      icon: CalendarClock,
      description: 'Schedule and manage appointments',
    },
    {
      title: 'Medical Records',
      url: '/dashboard/medical-records',
      icon: FileText,
      description: 'View clinical records',
    },
    {
      title: 'Messages',
      url: '/dashboard/messages',
      icon: MessageSquare,
      description: 'WhatsApp communications',
    },
    ...(pharmacyEnabled
      ? [
          {
            title: 'Pharmacy',
            url: '/dashboard/pharmacy',
            icon: Pill,
            description: 'Pharmacy management',
          },
        ]
      : []),
    {
      title: 'Payments',
      url: '/dashboard/payments',
      icon: Activity,
      description: 'Payment records',
    },
    {
      title: 'Settings',
      url: '/dashboard/settings',
      icon: Settings,
      description: 'Profile settings',
    },
  ]

  const adminMenuItems = [
    {
      title: 'Admin Dashboard',
      url: '/dashboard/admin',
      icon: Shield,
      description: 'Clinic management and billing',
    },
    {
      title: 'Team Members',
      url: '/dashboard/clinic-users',
      icon: Users,
      description: 'Manage staff and doctors',
    },
    {
      title: 'Settings',
      url: '/dashboard/settings',
      icon: Settings,
      description: 'Clinic configuration',
    },
  ]

  let menuItems = doctorMenuItems
  if (profile.role === 'staff') {
    menuItems = staffMenuItems
  } else if (profile.is_clinic_admin) {
    menuItems = adminMenuItems
  }

  return (
    <Sidebar>
      {/* Sidebar header with CURAKIN logo */}
      <SidebarHeader className="border-b bg-background transition-all duration-300">
        <Link href="/dashboard" className="flex items-center gap-2 transition-opacity hover:opacity-80">
          <CurakiLogoBrand expanded={open} />
        </Link>
      </SidebarHeader>

      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {menuItems.map((item) => {
                const Icon = item.icon
                return (
                  <SidebarMenuItem key={item.url}>
                    <SidebarMenuButton
                      asChild
                      tooltip={!open ? item.description : undefined}
                      className="transition-all duration-200 hover:bg-muted/50"
                    >
                      <Link href={item.url} className="flex items-center gap-2">
                        <Icon className="size-4 shrink-0" aria-hidden="true" />
                        <span className="transition-opacity duration-200">{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>

      {/* Footer with clinic info or profile */}
      <SidebarFooter className="border-t bg-background/50 transition-all duration-300">
        <div className="flex items-center gap-2 px-2 py-2 text-sm">
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate text-foreground">{profile.full_name}</p>
            <p className="text-xs text-muted-foreground capitalize truncate">
              {profile.role}
              {profile.is_clinic_admin && ' (Admin)'}
            </p>
          </div>
        </div>
      </SidebarFooter>
    </Sidebar>
  )
}