import { useEffect, useState } from 'react'

// Brand-anchored categorical palette (ARS site retheme 2026-08-02). Yellow
// (sell) and teal (buy) lead so the palette identity is preserved; the rest
// are the site's ink and muted tones plus complementary shades for wider
// breakdowns. Chart yellow uses the deep tone so bars stay visible on white.
export const GOLD = '#E0BC00' // --p-gold-deep (sell — chart-visible yellow)
export const TEAL = '#2C7A7B' // --p-buy   (buy)

export const SERIES_PALETTE = [
  GOLD,
  TEAL,
  '#232B3A', // ink-mid
  '#7B8390', // site muted
  '#B08D00', // deep brand yellow
  '#4A6B6C', // slate teal
  '#6B7A8F', // steel blue
  '#F3CE00', // bright brand yellow
]

// Chart chrome (concrete hex — SVG tick/grid fills are attribute-applied).
export const AXIS_INK = '#39414F' // --p-body
export const LABEL_INK = '#1A212E' // --p-navy-dark (site ink)
export const GRID_INK = '#E6E8EC'

// Gauge band tones. THIS map is the only place a gauge colour exists: the
// server validates `tone` against the same fixed enum and never accepts a
// colour, so a user string cannot reach CSS. An unknown tone resolves to
// neutral rather than undefined — a chart must never render a blank band.
export const GAUGE_TONE_HEX: Record<string, string> = {
  good: '#2C7A7B',    // teal
  warn: '#F3CE00',    // brand yellow
  bad: '#B4432B',     // the error red already used in report copy
  neutral: '#7B8390', // site muted
  accent: GOLD,
}

export function toneHex(tone: string): string {
  return GAUGE_TONE_HEX[tone] ?? GAUGE_TONE_HEX.neutral
}

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
