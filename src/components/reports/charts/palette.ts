import { createContext, useContext, useEffect, useState } from 'react'
import type { ChartThemeId } from '../../../lib/api'

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

// ── Selectable chart colour schemes (CHART_THEMES, 2026-08-03) ─────────────
// Six prebuilt schemes, chosen per dashboard in Edit mode. The SERVER stores
// only the id and validates it against this same closed set; every hex lives
// here and only here, which is what makes it impossible for a stored string to
// reach a CSS fill.
//
// WHAT DOES NOT THEME. Semantic colour carries meaning, and a meaning that
// changes with a picker is not a meaning. So the funnel's sell-gold/buy-teal,
// GAUGE_TONE_HEX's good/warn/bad, the delta chips and the KPI/goal widgets all
// keep their brand tokens no matter which scheme is active. Only the SERIES
// charts — pie/donut, bar, line, scatter, combo — read this.
//
// Each scheme is 8 colours, which is what seriesColors cycles; all are picked
// to hold contrast against the white panel background, and none are neon.
export interface ChartScheme {
  id: ChartThemeId
  name: string
  colors: string[]
}

export const CHART_SCHEMES: ChartScheme[] = [
  // 'brand' IS SERIES_PALETTE, by reference and not by copy — a scheme list
  // that drifted from the palette it claims to mirror would recolour every
  // dashboard that never picked anything.
  { id: 'brand', name: 'Asset Gold', colors: SERIES_PALETTE },
  { id: 'ocean', name: 'Ocean',
    colors: ['#2C7A7B', '#1F5F8B', '#4FA3A5', '#6B8FB3',
             '#123B52', '#8FB8C9', '#35586E', '#A7D0D2'] },
  { id: 'sunset', name: 'Sunset',
    colors: ['#E0BC00', '#D97B29', '#B4432B', '#8C5A2B',
             '#F3CE00', '#C97F5A', '#6E3B23', '#E8A87C'] },
  { id: 'forest', name: 'Forest',
    colors: ['#2F6B3C', '#5A8F5E', '#1E4D2B', '#86AE8A',
             '#3E7C4F', '#A9C5A0', '#57744F', '#12331C'] },
  { id: 'slate', name: 'Slate',
    colors: ['#1A212E', '#39414F', '#5A6472', '#7B8390',
             '#9AA1AC', '#B8BEC6', '#4A5260', '#2A3240'] },
  { id: 'vivid', name: 'Vivid',
    colors: ['#2C7A7B', '#E0BC00', '#B4432B', '#1F5F8B',
             '#D97B29', '#2F6B3C', '#6D4A9E', '#C25583'] },
]

export const DEFAULT_CHART_THEME: ChartThemeId = 'brand'

const BRAND_SCHEME = CHART_SCHEMES[0]

/** The scheme for an id. Anything unrecognised — an older payload, a scheme
 *  added to the server before this bundle shipped — resolves to brand rather
 *  than to undefined: a chart must never render colourless. */
export function schemeOf(id: string | null | undefined): ChartScheme {
  return CHART_SCHEMES.find((s) => s.id === id) ?? BRAND_SCHEME
}

// The active scheme, supplied by whatever surface knows which dashboard is on
// screen. The DEFAULT IS BRAND, which is what keeps every chart rendered
// OUTSIDE a dashboard — standalone report pages, the report builder's live
// preview — on the brand palette without those call sites doing anything.
export const ChartThemeContext = createContext<ChartScheme>(BRAND_SCHEME)

export function useChartScheme(): ChartScheme {
  return useContext(ChartThemeContext)
}

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

// On BRAND, the accent always colours the first series so a single-series
// chart matches the rest of the app; remaining series cycle the palette. That
// is the pre-existing behaviour and it is preserved exactly.
//
// On any OTHER scheme the accent is deliberately ignored and the scheme draws
// in its own order. Leading every ocean chart with the brand gold would put a
// colour the user did not pick at the front of every chart, and the scheme
// would not read as chosen. The accent still drives the funnel, which does not
// theme at all — so sell/buy stays legible where it carries meaning.
export function seriesColors(accent: string, n: number,
                             scheme: ChartScheme = BRAND_SCHEME): string[] {
  const ordered = scheme.id === 'brand'
    ? (() => {
        const lead = accentHex(accent)
        const rest = scheme.colors.filter((c) => c.toLowerCase() !== lead.toLowerCase())
        return [lead, ...rest]
      })()
    : scheme.colors
  return Array.from({ length: n }, (_, i) => ordered[i % ordered.length])
}

// ── Colouring the MARKS of a single-series chart (MYDAY_POLISH, 2026-08-04) ──
//
// THE BUG THIS FIXES. Every chart already read the active scheme; picking one
// still only visibly repainted the pie. The reason is what each chart asked
// for: a pie asks for one colour per ROW, so it draws the whole palette, while
// a bar/line/scatter asks for one colour per SERIES — and a dashboard panel is
// almost always ONE series. So those charts drew entirely in scheme.colors[0],
// which is a single hue and no scheme at all. Worse, Sunset's first colour IS
// the brand gold and Ocean and Vivid share a first teal, so three of the six
// schemes were indistinguishable from something else on a single-series chart.
//
// So a single-series CATEGORICAL chart now colours per category, exactly as
// the pie does. It is also the right chart, independent of theming: one bar
// per rep in one colour is a bar chart that has thrown its own legend away.
//
// TIME BUCKETS ARE EXCLUDED. "Calls by week" is a sequence, not a set of
// categories: a rainbow across consecutive weeks reads as eight unrelated
// things rather than one trend. Detected by the registry's own dimension keys,
// because a week bucket's `type` is 'text' like any other label. `year` is
// deliberately NOT here — on the units source it is the equipment's model
// year, which is a category.
const TIME_DIMENSIONS = new Set(['week', 'month', 'quarter', 'date', 'day'])

export function isTimeDimension(key: string): boolean {
  return TIME_DIMENSIONS.has(key)
}

/** One colour per MARK for a single-series chart, or null when the marks
 *  should share the series colour (multi-series, or a time sequence). */
export function markColors(accent: string, dimensionKey: string,
                           seriesCount: number, markCount: number,
                           scheme: ChartScheme): string[] | null {
  if (seriesCount !== 1) return null
  if (isTimeDimension(dimensionKey)) return null
  return seriesColors(accent, markCount, scheme)
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
