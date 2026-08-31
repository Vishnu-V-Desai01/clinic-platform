'use client'
import { useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { UserButton } from '@clerk/nextjs'
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuBadge,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarRail,
  useSidebar,
} from '@/components/ui/sidebar'
import { navByRole, adminModeNav, pharmacyNavItem, type NavItem } from '@/lib/nav-config'
import type { Profile } from '@/lib/supabase/profile'
import { ModeToggle } from '@/components/mode-toggle'
import ModeSwitchButton from '@/components/mode-switch-button'

// Inserts item just before the entry titled "Messages" (last item in both
// doctor and staff arrays today); falls back to appending at the end if
// that title ever changes or is removed, so this never silently drops the
// item.
function insertBeforeMessages(base: NavItem[], item: NavItem): NavItem[] {
  const messagesIndex = base.findIndex((navItem) => navItem.title === 'Messages')
  if (messagesIndex === -1) return [...base, item]
  return [...base.slice(0, messagesIndex), item, ...base.slice(messagesIndex)]
}

export function AppSidebar({
  profile,
  pharmacyEnabled,
}: {
  profile: Profile
  pharmacyEnabled: boolean
}) {
  const pathname = usePathname()
  const router = useRouter()

  // Closes the mobile sidebar sheet AFTER navigation actually completes —
  // tied to pathname changing (which only happens once the new route has
  // mounted), not to the click itself. Closing on click fired too early:
  // the sidebar would slide away while the new page was still loading in
  // behind it, which looked like the sidebar closing onto a blank screen.
  // This way the new page is already visible when the sidebar starts
  // sliding shut. Covers both plain nav-link clicks and the mode-switch
  // button below — anything that changes pathname triggers this, so
  // neither needs its own manual close call.
  const { isMobile, setOpenMobile } = useSidebar()
  useEffect(() => {
    if (isMobile) setOpenMobile(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname])

  // Settings lives at /dashboard/settings (shared URL) but belongs
  // to the admin context — keep admin nav active when navigating there.
  const isAdminMode =
    profile.is_clinic_admin &&
    (pathname.startsWith('/dashboard/admin') ||
      pathname === '/dashboard/settings' ||
      pathname.startsWith('/dashboard/settings/'))

  const baseNavItems = isAdminMode ? adminModeNav : navByRole[profile.role]

  // Visibility now depends ONLY on the clinic's module flag, not on this
  // person's individual pharmacy_access — a doctor/staff member without
  // granted access still sees "Pharmacy" in the sidebar, clicks it, and the
  // page itself shows "Pharmacy inventory access not provided." Admin mode
  // stays excluded, same as Payments/Appointments are absent from
  // adminModeNav — it's a deliberately separate, settings-only context.
  const canSeePharmacyNav = !isAdminMode && pharmacyEnabled

  const navItems = canSeePharmacyNav ? insertBeforeMessages(baseNavItems, pharmacyNavItem) : baseNavItems

  function handleModeSwitch(targetMode: 'admin' | 'doctor') {
    router.push(targetMode === 'admin' ? '/dashboard/admin' : '/dashboard/patients')
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3 space-y-3">
        <p className="text-sm font-semibold tracking-tight">CURAKIN HealthTech</p>
        <ModeSwitchButton
          currentMode={isAdminMode ? 'admin' : 'doctor'}
          role={profile.role}
          isClinicAdmin={profile.is_clinic_admin}
          size="nav"
          onSwitch={handleModeSwitch}
        />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupContent>
            <SidebarMenu>
              {navItems.map((item) => {
                const isActive =
                  item.href === '/dashboard'
                    ? pathname === '/dashboard'
                    : pathname === item.href || pathname.startsWith(item.href + '/')
                return (
                  <SidebarMenuItem key={item.href}>
                    <SidebarMenuButton asChild isActive={isActive}>
                      <Link href={item.href}>
                        <item.icon />
                        <span>{item.title}</span>
                      </Link>
                    </SidebarMenuButton>
                    {item.badgeCount ? (
                      <SidebarMenuBadge>{item.badgeCount}</SidebarMenuBadge>
                    ) : null}
                  </SidebarMenuItem>
                )
              })}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter className="border-t p-3">
        <div className="flex items-center justify-between gap-2">
          <div className="flex min-w-0 items-center gap-2">
            <UserButton />
            <div className="min-w-0">
              <p className="truncate text-xs font-medium leading-none">
                {profile.full_name ?? profile.email}
              </p>
              <p className="mt-0.5 text-xs capitalize text-muted-foreground">
                {profile.role}
              </p>
            </div>
          </div>
          <ModeToggle />
        </div>
      </SidebarFooter>
      <SidebarRail />
    </Sidebar>
  )
}
