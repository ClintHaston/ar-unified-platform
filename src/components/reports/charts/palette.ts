import { useEffect, useState } from 'react'

// Brand-anchored categorical palette. Gold (sell) and teal (buy) lead so the
// existing palette identity is preserved; the rest are the platform's own navy
// and steel tones plus two complementary shades for wider breakdowns.
export const GOLD = '#C8922A' // --p-gold  (sell)
export const TEAL = '#2C7A7B' // --p-buy   (buy)

export const SERIES_PALETTE = [
  GOLD,
  TEAL,
  '#2C3E50', // navy-mid
  '#A8BDD4', // muted blue
  '#8A6D3B', // deep tan
  '#4A6B6C', // slate teal
  '#6B7A8F', // steel blue
  '#D4A94E', // light gold
]

// Chart chrome (concrete hex — SVG tick/grid fills are attribute-applied).
export const AXIS_INK = '#555555' // --p-body
export const LABEL_INK = '#1A2B47' // --p-navy-dark
export const GRID_INK = '#E6EAF0'

// ResultView passes accent as a CSS var string; resolve it to a concrete hex so
// recharts and the palette-exclusion below can use it.
export function accentHex(accent: string): string {
  return accent.includes('buy') ? TEAL : GOLD
}

// The accent always colours the first series so a single-series chart matches
// the rest of the app; remaining series cycle the palette.
export function seriesColors(accent: string, n: number): string[] {
  const lead = accentHex(accent)
  const rest = SERIES_PALETTE.filter((c) => c.toLowerCase() !== lead.toLowerCase())
  const ordered = [lead, ...rest]
  return Array.from({ length: n }, (_, i) => ordered[i % ordered.length])
}

// Live reduced-motion preference; drives recharts isAnimationActive.
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(
    () => typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches,
  )
  useEffect(() => {
    const mq = window.matchMedia('(prefers-reduced-motion: reduce)')
    const on = () => setReduced(mq.matches)
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [])
  return reduced
}
