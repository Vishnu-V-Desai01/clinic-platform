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

'use client'

import React from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { usePathname } from 'next/navigation'

interface PageTransitionProps {
  children: React.ReactNode
}

export function PageTransition({ children }: PageTransitionProps) {
  const pathname = usePathname()

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