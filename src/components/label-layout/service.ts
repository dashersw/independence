import mapData from '../../game/map-data.json'
import pinnedLabels from '../labelOverrides.json'
import { computeLayout, PARAMS } from './engine'
import { arcFromParams, type LabelLayout, type LabelParams, type TerritoryShape } from './types'

const cacheByKey = new Map<string, Record<string, LabelLayout>>()

export function labelLayouts(names: Record<string, string>, cacheKey = 'default'): Record<string, LabelLayout> {
  const hit = cacheByKey.get(cacheKey)
  if (hit) return hit
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 1
  const ctx = canvas.getContext('2d')
  const layouts: Record<string, LabelLayout> = {}

  for (const [slug, data] of Object.entries(mapData.territories as Record<string, TerritoryShape>)) {
    const name = names[slug] ?? slug
    // hand-pinned placements win outright; the engine covers the rest
    const pin = (pinnedLabels as Record<string, LabelParams>)[slug]
    layouts[slug] = pin ? arcFromParams(pin) : ctx ? computeLayout(ctx, data, name) : { kind: 'plain', size: 9 }
  }
  cacheByKey.set(cacheKey, layouts)
  return layouts
}

// dev-only: recompute all layouts under trial PARAMS without reloading, so
// scoring constants can be grid-searched in the browser console
if (typeof window !== 'undefined') {
  ;(window as any).__labelSweep = (trial: Partial<typeof PARAMS>, names: Record<string, string>) => {
    const saved = { ...PARAMS }
    Object.assign(PARAMS, trial)
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = 1
    const ctx = canvas.getContext('2d')!
    const out: Record<string, unknown> = {}
    for (const [slug, data] of Object.entries(mapData.territories as Record<string, TerritoryShape>)) {
      const l = computeLayout(ctx, data, names[slug] ?? slug)
      if (l.kind === 'arc') {
        const m = l.d.match(/M ([\d.-]+),([\d.-]+) Q [\d.-]+,[\d.-]+ ([\d.-]+),([\d.-]+)/)!
        const [ax, ay, bx, by] = m.slice(1).map(Number)
        out[slug] = {
          size: l.size,
          ang: Math.round((Math.atan2(by - ay, bx - ax) * 1800) / Math.PI) / 10,
          midX: Math.round((ax + bx) / 2),
          midY: Math.round((ay + by) / 2),
        }
      } else out[slug] = { size: l.size, plain: true }
    }
    Object.assign(PARAMS, saved)
    return out
  }
}
