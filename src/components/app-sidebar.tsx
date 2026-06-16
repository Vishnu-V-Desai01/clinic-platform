'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
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
import { navByRole } from '@/lib/nav-config'
import type { Profile } from '@/lib/supabase/profile'
import { ModeToggle } from '@/components/mode-toggle'

export function AppSidebar({ profile }: { profile: Profile }) {
  const pathname = usePathname()
  const navItems = navByRole[profile.role]

  return (
    <Sidebar>
      <SidebarHeader className="border-b px-4 py-3">
        <p className="text-sm font-semibold tracking-tight">Clinic Platform</p>
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