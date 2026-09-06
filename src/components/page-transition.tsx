// src/components/page-transition.tsx
//
// Framer Motion wrapper for route transitions.
// Fades pages in/out as users navigate between routes.
// Wraps the main content area in the layout.
//
// mode="wait" (removed) forces the outgoing page's exit animation to
// finish before the incoming page mounts. That collides with Next.js App
// Router's streaming Server Components: the incoming page can be mid-stream
// when animation timing says it's "safe" to mount, producing a hook-count
// mismatch on some navigations. Default mode (both trees present briefly)
// avoids blocking on exit and removes that race.
//
// Clerk's <SignIn/> and <SignUp/> catch-all routes change the URL
// pathname as Clerk moves between its own internal steps (e.g.
// /sign-up -> /sign-up/verify-email-address). Wrapping those routes in
// AnimatePresence with key={pathname} makes every Clerk step transition
// look like a full page navigation, unmounting and remounting the tree
// Clerk imperatively manages (#clerk-components is not a normal React
// subtree) — plausible cause of Clerk's UI failing to reappear after a
// step, even though Clerk's own JS-side state stays correct throughout.
// Skip the animated wrapper on these routes; Clerk handles its own
// internal transition visuals.

'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'

interface PageTransitionProps {
  children: React.ReactNode
}

const NO_TRANSITION_PREFIXES = ['/sign-in', '/sign-up']

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()
  const skipTransition = NO_TRANSITION_PREFIXES.some((prefix) => pathname.startsWith(prefix))

  if (skipTransition) {
    return <>{children}</>
  }

  return (
    <AnimatePresence initial={false}>
      <motion.div
        key={pathname}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        transition={{
          duration: 0.2,
          ease: 'easeInOut',
        }}
      >
        {children}
      </motion.div>
    </AnimatePresence>
  )
}