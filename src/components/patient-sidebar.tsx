'use client'

import { useState } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useClerk } from '@clerk/nextjs'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from '@/components/ui/sidebar'
import {
  Stethoscope,
  FileTextIcon,
  CalendarIcon,
  Clipboard,
  Check,
  LogOut,
} from 'lucide-react'

interface PatientSidebarProps {
  familyCode: string
}

export function PatientSidebar({ familyCode }: PatientSidebarProps) {
  const pathname = usePathname()
  const router = useRouter()
  const { signOut } = useClerk()
  const [copied, setCopied] = useState(false)

  const navItems = [
    {
      label: 'My Clinics',
      href: '/portal',
      icon: Stethoscope,
      isActive: pathname === '/portal',
    },
    {
      label: 'Request Appointment',
      href: '/portal/request',
      icon: CalendarIcon,
      isActive: pathname.startsWith('/portal/request'),
    },
    {
      label: 'My Consents',
      href: '/portal/consents',
      icon: FileTextIcon,
      isActive: pathname.startsWith('/portal/consents'),
    },
  ]

  const handleCopy = async () => {
    if (!familyCode) return
    try {
      await navigator.clipboard.writeText(familyCode)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch (error) {
      console.error('Failed to copy family code:', error)
    }
  }

  const handleSignOut = async () => {
    await signOut({ redirectUrl: '/sign-in' })
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b">
        <div className="flex items-center gap-2 px-4 py-4">
          <div className="flex h-8 w-8 items-center justify-center rounded bg-primary">
            <span className="text-xs font-bold text-primary-foreground">C</span>
          </div>
          <span className="text-sm font-semibold tracking-wide">CURAKIN</span>
        </div>

        {familyCode && (
          <button
            onClick={handleCopy}
            className="mx-3 mb-3 flex items-center justify-between gap-2 rounded-lg border border-primary/20 bg-primary/10 px-3 py-2 text-left transition-colors hover:bg-primary/15"
            aria-label={copied ? 'Family ID copied' : 'Copy your Unique Family ID'}
          >
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
                Family ID
              </p>
              <p className="truncate font-mono text-sm font-semibold text-foreground">
                {familyCode}
              </p>
            </div>
            {copied ? (
              <Check className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
            ) : (
              <Clipboard className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
            )}
          </button>
        )}
      </SidebarHeader>

      <SidebarContent>
        <SidebarMenu>
          {navItems.map((item) => {
            const Icon = item.icon
            return (
              <SidebarMenuItem key={item.href}>
                <SidebarMenuButton asChild isActive={item.isActive}>
                  <Link href={item.href}>
                    <Icon className="h-4 w-4" />
                    <span>{item.label}</span>
                  </Link>
                </SidebarMenuButton>
              </SidebarMenuItem>
            )
          })}
        </SidebarMenu>
      </SidebarContent>

      <SidebarFooter className="border-t">
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton onClick={handleSignOut}>
              <LogOut className="h-4 w-4" />
              <span>Sign Out</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
      </SidebarFooter>
    </Sidebar>
  )
}