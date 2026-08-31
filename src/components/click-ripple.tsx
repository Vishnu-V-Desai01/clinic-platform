// src/components/click-ripple.tsx
//
// Subtle ripple effect on button click — visual feedback without being jarring.
// Used on all buttons and interactive elements.

'use client'

import React, { useState } from 'react'
import { motion } from 'framer-motion'

interface Ripple {
  id: number
  x: number
  y: number
}

export function ClickRipple() {
  const [ripples, setRipples] = useState<Ripple[]>([])

  const handleClick = (e: React.MouseEvent) => {
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
    const x = e.clientX - rect.left
    const y = e.clientY - rect.top
    const id = Date.now()

    setRipples((prev) => [...prev, { id, x, y }])

    // Remove ripple after animation completes
    setTimeout(() => {
      setRipples((prev) => prev.filter((ripple) => ripple.id !== id))
    }, 600)
  }

  return { ripples, handleClick }
}

/**
 * Ripple container — renders animated ripple circles on click.
 * Apply this to button elements via a ref wrapper.
 */
export function RippleContainer({ ripples }: { ripples: Ripple[] }) {
  return (
    <div className="absolute inset-0 overflow-hidden rounded-md pointer-events-none">
      {ripples.map((ripple) => (
        <motion.div
          key={ripple.id}
          className="absolute bg-white/30 rounded-full"
          initial={{
            width: 0,
            height: 0,
            left: ripple.x,
            top: ripple.y,
            opacity: 1,
          }}
          animate={{
            width: 200,
            height: 200,
            left: ripple.x - 100,
            top: ripple.y - 100,
            opacity: 0,
          }}
          transition={{
            duration: 0.6,
            ease: 'easeOut',
          }}
        />
      ))}
    </div>
  )
}