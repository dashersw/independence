import ClipperLib from 'clipper-lib'
import mapData from '../game/map-data.json'
import type Territory from '../game/territory'

export interface FactionComponent {
  faction: string
  slugs: string[]
}

const CLIP_SCALE = 100
const CLOSE_DELTA = 1
const BAND_WIDTH = 6
const SHADE_DEPTH = 20
type Ring = Array<{ X: number; Y: number }>

const orientRing = (ring: Ring) => (ClipperLib.Clipper.Area(ring) < 0 ? ring.slice().reverse() : ring)
const blobCache = new Map<string, { d: string; closed: Ring[] }>()

const blobData = (slugs: string[]): { d: string; closed: Ring[] } => {
  const key = slugs.slice().sort().join('|')
  const cached = blobCache.get(key)
  if (cached) return cached
  const paths = slugs.flatMap((slug) =>
    mapData.territories[slug as keyof typeof mapData.territories].poly.map((ring) =>
      orientRing(ring.map(([x, y]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(y * CLIP_SCALE) }))),
    ),
  )
  const grow = new ClipperLib.ClipperOffset(2, 0.25 * CLIP_SCALE)
  grow.AddPaths(paths, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon)
  const grown: ClipperLib.Paths = []
  grow.Execute(grown, CLOSE_DELTA * CLIP_SCALE)
  const shrink = new ClipperLib.ClipperOffset(2, 0.25 * CLIP_SCALE)
  shrink.AddPaths(grown, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon)
  const closed: ClipperLib.Paths = []
  shrink.Execute(closed, -CLOSE_DELTA * CLIP_SCALE)
  const d = closed
    .map((ring: Ring) => `M${ring.map((point) => `${point.X / CLIP_SCALE},${point.Y / CLIP_SCALE}`).join(' L')} Z`)
    .join(' ')
  const data = { d, closed }
  blobCache.set(key, data)
  return data
}

export const factionBlobOutline = (slugs: string[]) => blobData(slugs).d

const clipPath = (paths: Ring[]) =>
  paths
    .map((ring) => `M${ring.map((point) => `${point.X / CLIP_SCALE},${point.Y / CLIP_SCALE}`).join(' L')} Z`)
    .join(' ')

const inset = (paths: Ring[], delta: number) => {
  const offset = new ClipperLib.ClipperOffset(2, 0.25 * CLIP_SCALE)
  offset.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const result: ClipperLib.Paths = []
  offset.Execute(result, -delta * CLIP_SCALE)
  return result
}

const shadowCache = new Map<string, string[]>()
export const factionBlobShadowRings = (slugs: string[]) => {
  const key = slugs.slice().sort().join('|')
  const cached = shadowCache.get(key)
  if (cached) return cached
  let previous = inset(blobData(slugs).closed, BAND_WIDTH)
  const rings: string[] = []
  for (let depth = BAND_WIDTH; depth < SHADE_DEPTH && previous.length; depth += 2) {
    const inner = inset(previous, 2)
    rings.push(inner.length ? `${clipPath(previous)} ${clipPath(inner)}` : clipPath(previous))
    previous = inner
  }
  shadowCache.set(key, rings)
  return rings
}

export const contiguousFactionComponents = (territories: Territory[]): FactionComponent[] => {
  const components: FactionComponent[] = []
  const seen = new Set<string>()
  for (const territory of territories) {
    if (seen.has(territory.slug)) continue
    seen.add(territory.slug)
    const slugs: string[] = []
    const stack = [territory]
    while (stack.length) {
      const current = stack.pop()!
      slugs.push(current.slug)
      for (const adjacent of current.adjacent) {
        if (seen.has(adjacent.slug) || adjacent.faction !== territory.faction) continue
        seen.add(adjacent.slug)
        stack.push(adjacent)
      }
    }
    components.push({ faction: territory.faction.name, slugs })
  }
  return components
}

export const geographicFactionClusters = (territories: Territory[]): FactionComponent[] => {
  const clusters: FactionComponent[] = []
  const seen = new Set<string>()
  const bySlug = new Map(territories.map((territory) => [territory.slug, territory]))
  for (const territory of territories) {
    if (seen.has(territory.slug)) continue
    seen.add(territory.slug)
    const slugs: string[] = []
    const stack = [territory]
    while (stack.length) {
      const current = stack.pop()!
      slugs.push(current.slug)
      const geometry = mapData.territories[current.slug as keyof typeof mapData.territories]
      for (const slug of geometry.geoNeighbors) {
        const adjacent = bySlug.get(slug)
        if (!adjacent || seen.has(slug) || adjacent.faction !== territory.faction) continue
        seen.add(slug)
        stack.push(adjacent)
      }
    }
    clusters.push({ faction: territory.faction.name, slugs })
  }
  return clusters
}
