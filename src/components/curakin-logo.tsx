// src/components/curakin-logo.tsx
//
// CURAKIN HealthTech™ logo and wordmark components.
// Hand-coded SVG based on brand guidelines: teal primary (#0E9384),
// warm peachy accent (#D4956A), and integrating heart + ECG line + hand.

import React from 'react'

/**
 * Icon-only version — 48×48 default, scales with size prop.
 * Used in sidebar collapsed state, app switcher, favicon.
 */
export function CurakiIconOnly({ size = 48, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Heart outline — teal */}
      <path
        d="M24 42c0 0-16-10-16-19.5C8 14.7 14.7 8 20 8c3.3 0 6.5 1.5 8.5 4 2-2.5 5.2-4 8.5-4 5.3 0 12 6.7 12 14.5 0 9.5-16 19.5-16 19.5z"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        className="text-[#0E9384]"
      />

      {/* Heartbeat ECG line — teal, running left-to-right through heart */}
      <path
        d="M8 24h4l2-6 4 10 2-5 3 0"
        stroke="currentColor"
        strokeWidth="1.5"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-[#0E9384]"
      />

      {/* Hand shape (bottom left of heart) — warm peachy accent */}
      <g className="text-[#D4956A]">
        <path
          d="M12 28c-1 0-2 1-2 2v6c0 1 1 2 2 2h3c1 0 2-1 2-2v-8"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <circle cx="13" cy="26" r="1" fill="currentColor" />
      </g>

      {/* Warm peachy highlight on heart (right side accent) */}
      <ellipse
        cx="32"
        cy="20"
        rx="3.5"
        ry="5"
        fill="currentColor"
        className="text-[#D4956A] opacity-70"
      />
    </svg>
  )
}

/**
 * Full wordmark — "CURAKIN HealthTech™" with icon.
 * Used in sidebar expanded state, page headers, marketing.
 */
export function CurakiWordmark({ variant = 'full', className = '' }: { variant?: 'full' | 'compact'; className?: string }) {
  return (
    <svg
      viewBox="0 0 400 80"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      {/* Icon (scaled down) */}
      <g transform="translate(10, 12) scale(0.5)">
        <path
          d="M24 42c0 0-16-10-16-19.5C8 14.7 14.7 8 20 8c3.3 0 6.5 1.5 8.5 4 2-2.5 5.2-4 8.5-4 5.3 0 12 6.7 12 14.5 0 9.5-16 19.5-16 19.5z"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          className="text-[#0E9384]"
        />
        <path
          d="M8 24h4l2-6 4 10 2-5 3 0"
          stroke="currentColor"
          strokeWidth="1.5"
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-[#0E9384]"
        />
        <g className="text-[#D4956A]">
          <path
            d="M12 28c-1 0-2 1-2 2v6c0 1 1 2 2 2h3c1 0 2-1 2-2v-8"
            stroke="currentColor"
            strokeWidth="1.5"
            fill="none"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle cx="13" cy="26" r="1" fill="currentColor" />
        </g>
        <ellipse
          cx="32"
          cy="20"
          rx="3.5"
          ry="5"
          fill="currentColor"
          className="text-[#D4956A] opacity-70"
        />
      </g>

      {/* CURAKIN text */}
      <text
        x="60"
        y="55"
        fontSize="36"
        fontWeight="700"
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="currentColor"
        className="text-[#0E9384]"
        letterSpacing="-0.5"
      >
        CURAKIN
      </text>

      {/* HealthTech™ text (smaller, secondary) */}
      <text
        x="60"
        y="72"
        fontSize="14"
        fontWeight="500"
        fontFamily="system-ui, -apple-system, sans-serif"
        fill="currentColor"
        className="text-foreground opacity-70"
      >
        HealthTech
        <tspan baselineShift="super" fontSize="10">
          ™
        </tspan>
      </text>
    </svg>
  )
}

/**
 * Text-only fallback — for light text on dark backgrounds or when icon can't render.
 */
export function CurakiTextOnly({ className = '' }: { className?: string }) {
  return (
    <div className={`text-lg font-bold tracking-tight ${className}`}>
      <span className="text-[#0E9384]">CURAKIN</span>
      <span className="ml-1 text-sm font-medium text-foreground opacity-70">
        HealthTech™
      </span>
    </div>
  )
}

/**
 * Link wrapper — logo that navigates to dashboard home.
 * Used in sidebar header.
 */
export function CurakiLogoBrand({ expanded = true }: { expanded?: boolean }) {
  return expanded ? (
    <CurakiWordmark className="h-8 w-auto" />
  ) : (
    <CurakiIconOnly size={32} />
  )
}