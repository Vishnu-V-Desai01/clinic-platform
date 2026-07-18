'use client'
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
} from '@/components/ui/sidebar'
import { navByRole, adminModeNav } from '@/lib/nav-config'
import type { Profile } from '@/lib/supabase/profile'
import { ModeToggle } from '@/components/mode-toggle'
import ModeSwitchButton from '@/components/mode-switch-button'

export function AppSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const router = useRouter()

  // Settings lives at /dashboard/settings (shared URL) but belongs
  // to the admin context — keep admin nav active when navigating there.
  const isAdminMode =
    profile.is_clinic_admin &&
    (pathname.startsWith('/dashboard/admin') ||
      pathname === '/dashboard/settings' ||
      pathname.startsWith('/dashboard/settings/'))

  const navItems = isAdminMode ? adminModeNav : navByRole[profile.role]

  function handleModeSwitch(targetMode: 'admin' | 'doctor') {
    router.push(targetMode === 'admin' ? '/dashboard/admin' : '/dashboard/patients')
  }

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3 space-y-3">
        <p className="text-sm font-semibold tracking-tight">Clinic Platform</p>
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