import React, { useEffect, useMemo, useRef, useState } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import mapData from '../game/map-data.json'
import Territory from '../game/territory'
import { Convoy, SEA_LANES } from '../game/game'
import { labelLayouts, LabelLayout } from './labelLayout'
import {
  LabelEditorPanel,
  labelEditEnabled,
  paramsFromLayout,
  arcFromParams,
  LabelParams,
  DotParams
} from './LabelEditor'
import dotPins from './dotOverrides.json'
import decorPins from './decorOverrides.json'
import ClipperLib from 'clipper-lib'
import { getLang, tFaction, tTerritory, tDecor, t as i18nT } from '../i18n'
// Cropped frame: Balkans to the Caucasus, hiding far-off background lands.
// The camera maths live apart from the view so they can be tested directly.
import {
  VB,
  ZOOM_MAX,
  baseDims,
  clampView,
  minZoomFor,
  dotScaleFor,
  flickVelocity,
  glideStep
} from './viewport'

// screen-pixel height of the HUD chrome hugging the top and bottom edges —
// measured live so desktop cards and the phone bars both work
const hudChromePx = () => {
  let top = 0
  let bottom = 0
  const winH = window.innerHeight
  for (const el of document.querySelectorAll('.hud-brand, .hud-phase, .hud-factions')) {
    const r = el.getBoundingClientRect()
    if (r.top < winH * 0.4) top = Math.max(top, r.bottom)
  }
  for (const el of document.querySelectorAll('.hud-log, .hud-actions')) {
    const r = el.getBoundingClientRect()
    if (r.bottom > winH * 0.6) bottom = Math.max(bottom, winH - r.top)
  }
  return { top, bottom }
}

// the DOM half of minZoomFor: measure the chrome, then ask the pure helper
const minZoomOut = (aspect: number, rect: DOMRect | undefined) => {
  if (typeof window === 'undefined' || !rect || rect.height === 0) return 1
  const chrome = hudChromePx()
  return minZoomFor(aspect, window.innerWidth, rect.height, chrome.top + chrome.bottom)
}

interface FlagStyle {
  fill: string // solid base color painted under the flag art (hides clip seams)
  stroke: string // representative dark color for badges/outlines
  border?: string // faction border band + border shadow, when darker than stroke
  swatch: string // CSS background for HUD swatches
}

export const FLAG_STYLES: Record<string, FlagStyle> = {
  Turkey: {
    fill: '#d8353c',
    stroke: '#8f1d1d',
    border: '#701212',
    swatch: '#d8353c'
  },
  Greece: {
    fill: '#2f74c0',
    stroke: '#0D5EAF',
    swatch: 'repeating-linear-gradient(180deg, #2f74c0 0 4px, #f4f6f8 4px 8px)'
  },
  Bulgaria: {
    fill: '#00966E',
    stroke: '#00966E',
    swatch: 'linear-gradient(180deg, #f4f6f8 0 33%, #00966E 33% 66%, #D62612 66% 100%)'
  },
  Armenia: {
    fill: '#0033A0',
    stroke: '#0033A0',
    swatch: 'linear-gradient(180deg, #D90012 0 33%, #0033A0 33% 66%, #F2A800 66% 100%)'
  },
  Italy: {
    fill: '#ece8dc',
    stroke: '#009246',
    swatch: 'linear-gradient(90deg, #009246 0 33%, #f4f6f8 33% 66%, #CE2B37 66% 100%)'
  },
  Britain: {
    fill: '#1d3f94',
    stroke: '#012169',
    swatch: 'linear-gradient(135deg, #1d3f94 0 55%, #f4f6f8 55% 70%, #C8102E 70% 100%)'
  },
  France: {
    fill: '#ece8dc',
    stroke: '#0055A4',
    swatch: 'linear-gradient(90deg, #0055A4 0 33%, #f4f6f8 33% 66%, #EF4135 66% 100%)'
  },
  // Iraq is out of the war, not in it: no flag art, so it paints as plain
  // unclaimed land like the neutral countries around the edge of the map.
  // The entry itself has to exist — FLAG_STYLES is indexed without a fallback.
  Iraq: {
    fill: '#ded3b6',
    stroke: '#a99a78',
    swatch: 'linear-gradient(135deg, #ded3b6 0 100%)'
  }
}

// Risk-style army denominations: cannonball = 10, cavalry = 5, infantry = 1.
export const unitBreakdown = (troops: number) => ({
  cannonballs: Math.floor(troops / 10),
  cavalry: Math.floor((troops % 10) / 5),
  infantry: troops % 5
})

export const unitGlyphs = (troops: number) => {
  const { cannonballs, cavalry, infantry } = unitBreakdown(troops)
  const balls = cannonballs > 4 ? `●×${cannonballs}` : '●'.repeat(cannonballs)
  return `${balls}${'♞'.repeat(cavalry)}${'♟'.repeat(infantry)}`
}

// A little caravel, drawn rather than typed: the unit counters are chess
// glyphs — ● ♞ ♟ — and an emoji sailboat sits in that company like a sticker
// on an engraving. Hull, mast, mainsail, jib, centred on the origin.
const SHIP =
  'M -9 2 Q 0 10.5 9 2 Z M -0.7 -10.5 L 0.7 -10.5 L 0.7 2 L -0.7 2 Z ' +
  'M 1.6 -9.5 Q 8.5 -3.5 1.6 1 Z M -1.6 -6.5 Q -6.5 -2.5 -1.6 1 Z'

// Static path collections for the decorative (non-interactive) paint layers.
const TERRITORY_PATHS: string[] = Object.values(mapData.territories).flatMap(t => t.paths)
const LAND_PATHS: string[] = [...mapData.background, ...TERRITORY_PATHS]

// National borders are drawn from each faction blob's TRUE outline: the
// member territories' flattened polygons (baked by the generator) are merged
// with a morphological closing — dilate, union, erode — which bridges the
// whiteborder source's inset gaps between adjacent shapes, then the resulting
// outline is stroked and clipped to itself for a constant-width inner band.
// Per-territory strokes can't do this: every same-faction seam sits across a
// few-unit gap that no local mask can bridge cleanly.
const CLIP_SCALE = 100
// bridges inter-shape gaps up to ~2 map units — every land seam on the map
// closes at this delta (measured max seam gap ≈ 1), while narrow bays, coves
// and notches (the Gulf of İzmit, the İzmir/Aydın rias, Aleppo's southern
// folds) stay open so the border band follows the drawn shapes faithfully
const CLOSE_DELTA = 1
// Clipper reads ring winding semantically (reversed ring = hole), so force
// every ring positive no matter which direction the source shape was drawn in.
const orientRing = (ring: { X: number; Y: number }[]) =>
  ClipperLib.Clipper.Area(ring) < 0 ? ring.slice().reverse() : ring
const blobCache = new Map<string, { d: string; closed: { X: number; Y: number }[][] }>()
const blobData = (slugs: string[]): { d: string; closed: { X: number; Y: number }[][] } => {
  const key = slugs.slice().sort().join('|')
  const hit = blobCache.get(key)
  if (hit) return hit
  const paths = slugs.flatMap(s =>
    ((mapData.territories as any)[s].poly as [number, number][][]).map(ring =>
      orientRing(ring.map(([x, y]) => ({ X: Math.round(x * CLIP_SCALE), Y: Math.round(y * CLIP_SCALE) })))
    )
  )
  // miter joins: round joins arc every corner at CLOSE_DELTA radius, which
  // reads as smoothed/melted corners once the band is stroked along the result
  const grow = new ClipperLib.ClipperOffset(2, 0.25 * CLIP_SCALE)
  grow.AddPaths(paths, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon)
  const grown = new ClipperLib.Paths()
  grow.Execute(grown, CLOSE_DELTA * CLIP_SCALE)
  const shrink = new ClipperLib.ClipperOffset(2, 0.25 * CLIP_SCALE)
  shrink.AddPaths(grown, ClipperLib.JoinType.jtMiter, ClipperLib.EndType.etClosedPolygon)
  const closed = new ClipperLib.Paths()
  shrink.Execute(closed, -CLOSE_DELTA * CLIP_SCALE)
  const d = closed
    .map(
      (ring: { X: number; Y: number }[]) =>
      'M' + ring.map(pt => `${pt.X / CLIP_SCALE},${pt.Y / CLIP_SCALE}`).join(' L') + ' Z'
    )
    .join(' ')
  const data = { d, closed }
  blobCache.set(key, data)
  return data
}
const blobOutline = (slugs: string[]): string => blobData(slugs).d

// Faction-border shadow: inset rings of the BLOB outline starting where the
// solid border band ends (6 visible units) and feathering to ~20 units in —
// same distance-field construction as the per-territory shadows, so the
// faction frontier reads with comparable weight to interior seams.
const BAND_W = 6
const FACTION_SHADE_DEPTH = 20
const clipD = (paths: { X: number; Y: number }[][]) =>
  paths.map(ring => 'M' + ring.map(pt => `${pt.X / CLIP_SCALE},${pt.Y / CLIP_SCALE}`).join(' L') + ' Z').join(' ')
const clipInset = (paths: { X: number; Y: number }[][], delta: number) => {
  const off = new ClipperLib.ClipperOffset(2, 0.25 * CLIP_SCALE)
  off.AddPaths(paths, ClipperLib.JoinType.jtRound, ClipperLib.EndType.etClosedPolygon)
  const out = new ClipperLib.Paths()
  off.Execute(out, -delta * CLIP_SCALE)
  return out
}
const blobShadowCache = new Map<string, string[]>()
const blobShadowRings = (slugs: string[]): string[] => {
  const key = slugs.slice().sort().join('|')
  const hit = blobShadowCache.get(key)
  if (hit) return hit
  let prev = clipInset(blobData(slugs).closed, BAND_W)
  const out: string[] = []
  for (let depth = BAND_W; depth < FACTION_SHADE_DEPTH && prev.length; depth += 2) {
    const inner = clipInset(prev, 2)
    out.push(inner.length ? clipD(prev) + ' ' + clipD(inner) : clipD(prev))
    prev = inner
  }
  blobShadowCache.set(key, out)
  return out
}

// Painterly filter/gradient defs — static, defined once.
const PaintDefs = () => (
  <defs>
    {/* painterly flag muting as NATIVE primitives — Safari drops CSS filter
        functions when rasterizing standalone SVG images, which left the bake
        fully saturated there. Equivalent of
        saturate(0.72) sepia(0.14) brightness(1.04) in sRGB. */}
    <filter id="flag-tone" x="-5%" y="-5%" width="110%" height="110%" colorInterpolationFilters="sRGB">
      <feColorMatrix type="saturate" values="0.72" />
      <feColorMatrix
        type="matrix"
        values="0.91502 0.10766 0.02646 0 0  0.04886 0.95604 0.02352 0 0  0.03808 0.07476 0.87834 0 0  0 0 0 1 0"
      />
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.04" />
        <feFuncG type="linear" slope="1.04" />
        <feFuncB type="linear" slope="1.04" />
      </feComponentTransfer>
    </filter>
    {/* soft halo used for the coastal glow + bled ink around the landmass */}
    <filter id="coast-glow" x="-15%" y="-15%" width="130%" height="130%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="7" />
    </filter>
    {/* darker rim just inside the coastline (classic cartographic inner shading) */}
    <filter id="coast-shade" x="-10%" y="-10%" width="120%" height="120%">
      <feMorphology in="SourceAlpha" operator="erode" radius="9" result="eroded" />
      <feGaussianBlur in="eroded" stdDeviation="9" result="soft" />
      <feComposite in="SourceAlpha" in2="soft" operator="out" result="rim" />
      {/* warm mid-tone: the layer multiplies, so this darkens each faction color in its own hue */}
      <feFlood floodColor="#9b8867" floodOpacity="0.85" />
      <feComposite in2="rim" operator="in" />
    </filter>
    {/* per-region inner shadow, flooded with the owning faction's dark tone: the
        multiply pass then darkens each region toward its own color, never gray */}
    {Object.entries(FLAG_STYLES).map(([name, style]) => (
      <filter key={`rs-${name}`} id={`region-shade-${name}`} x="-20%" y="-20%" width="140%" height="140%">
        <feMorphology in="SourceAlpha" operator="erode" radius="4.5" result="eroded" />
        <feGaussianBlur in="eroded" stdDeviation="5" result="soft" />
        <feComposite in="SourceAlpha" in2="soft" operator="out" result="rim" />
        <feFlood floodColor={style.stroke} floodOpacity="0.5" />
        <feComposite in2="rim" operator="in" />
      </filter>
    ))}
    {/* faction-shadow: inner shadow beginning where the border line ends (the
        line itself is exact stroked geometry in the faction-line-layer) */}
    {Object.entries(FLAG_STYLES).map(([name, style]) => (
      <filter key={`fs-${name}`} id={`faction-shadow-${name}`} x="-10%" y="-10%" width="120%" height="120%">
        {/* starts at radius 5 — one unit under the 6-unit line above it, so no
            antialiasing seam can open up between line and shadow */}
        <feMorphology in="SourceAlpha" operator="erode" radius="5" result="inner" />
        <feMorphology in="inner" operator="erode" radius="7" result="core" />
        <feGaussianBlur in="core" stdDeviation="3.5" result="soft" />
        <feComposite in="inner" in2="soft" operator="out" result="band" />
        {/* full-strength at the rim so the shadow reads as a continuation of the
            solid border line, fading inward from there */}
        <feFlood floodColor={style.stroke} floodOpacity="1" />
        <feComposite in2="band" operator="in" />
      </filter>
    ))}
    {/* wide soft haze for the shadow under every border line */}
    <filter id="border-haze" x="-6%" y="-6%" width="112%" height="112%">
      <feGaussianBlur in="SourceGraphic" stdDeviation="11" />
    </filter>
    {/* roughen + soften the decorative territory borders so they read as bled ink */}
    <filter id="border-bleed" x="-4%" y="-4%" width="108%" height="108%">
      <feTurbulence type="fractalNoise" baseFrequency="0.022" numOctaves="2" seed="11" result="noise" />
      <feDisplacementMap in="SourceGraphic" in2="noise" scale="5" result="rough" />
      <feGaussianBlur in="rough" stdDeviation="1.2" />
    </filter>
    {/* fine paper grain */}
    <filter id="paper-grain" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.5" numOctaves="2" seed="7" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncR type="linear" slope="1.7" intercept="-0.35" />
        <feFuncG type="linear" slope="1.7" intercept="-0.35" />
        <feFuncB type="linear" slope="1.7" intercept="-0.35" />
        <feFuncA type="linear" slope="0" intercept="1" />
      </feComponentTransfer>
    </filter>
    {/* broad watercolor mottling */}
    <filter id="wash-blotch" x="0%" y="0%" width="100%" height="100%">
      <feTurbulence type="fractalNoise" baseFrequency="0.008" numOctaves="3" seed="4" stitchTiles="stitch" />
      <feColorMatrix type="saturate" values="0" />
      <feComponentTransfer>
        <feFuncR type="linear" slope="2.2" intercept="-0.6" />
        <feFuncG type="linear" slope="2.2" intercept="-0.6" />
        <feFuncB type="linear" slope="2.2" intercept="-0.6" />
        <feFuncA type="linear" slope="0" intercept="1" />
      </feComponentTransfer>
    </filter>
    <radialGradient id="vignette-grad" cx="50%" cy="50%" r="70%">
      <stop offset="0%" stopColor="#2a2116" stopOpacity="0" />
      <stop offset="58%" stopColor="#2a2116" stopOpacity="0" />
      <stop offset="88%" stopColor="#2a2116" stopOpacity="0.2" />
      <stop offset="100%" stopColor="#2a2116" stopOpacity="0.38" />
    </radialGradient>
    <radialGradient id="sea-depth" cx="50%" cy="46%" r="75%">
      <stop offset="0%" stopColor="#f4efdd" stopOpacity="0.16" />
      <stop offset="55%" stopColor="#f4efdd" stopOpacity="0.05" />
      <stop offset="100%" stopColor="#314352" stopOpacity="0" />
    </radialGradient>
  </defs>
)

// Proper vectorized flag artwork (3:2, drawn in a 36×24 box), shared between
// the map (as symbols stretched over faction blobs) and the HUD (as icons).
export const FLAG_ART: Record<string, React.ReactElement> = {
  Turkey: (
    <>
      <rect width="36" height="24" fill="#E30A17" />
      <circle cx="13.5" cy="12" r="6" fill="#f4f6f8" />
      <circle cx="15" cy="12" r="4.8" fill="#E30A17" />
      <polygon
        fill="#f4f6f8"
        points="24,12 22.31,12.59 22.27,14.38 21.19,12.95 19.48,13.47 20.5,12 19.48,10.53 21.19,11.05 22.27,9.62 22.31,11.41"
      />
    </>
  ),
  Greece: (
    <>
      <rect width="36" height="24" fill="#f4f6f8" />
      {[0, 2, 4, 6, 8].map(i => (
        <rect key={i} y={(i * 24) / 9} width="36" height={24 / 9} fill="#2f74c0" />
      ))}
      <rect width="13.33" height="13.33" fill="#2f74c0" />
      <rect x="5.33" width="2.67" height="13.33" fill="#f4f6f8" />
      <rect y="5.33" width="13.33" height="2.67" fill="#f4f6f8" />
    </>
  ),
  Bulgaria: (
    <>
      <rect width="36" height="8" fill="#f4f6f8" />
      <rect y="8" width="36" height="8" fill="#00966E" />
      <rect y="16" width="36" height="8" fill="#D62612" />
    </>
  ),
  Armenia: (
    <>
      <rect width="36" height="8" fill="#D90012" />
      <rect y="8" width="36" height="8" fill="#0033A0" />
      <rect y="16" width="36" height="8" fill="#F2A800" />
    </>
  ),
  Italy: (
    <>
      <rect width="12" height="24" fill="#009246" />
      <rect x="12" width="12" height="24" fill="#f4f6f8" />
      <rect x="24" width="12" height="24" fill="#CE2B37" />
    </>
  ),
  France: (
    <>
      <rect width="12" height="24" fill="#0055A4" />
      <rect x="12" width="12" height="24" fill="#f4f6f8" />
      <rect x="24" width="12" height="24" fill="#EF4135" />
    </>
  ),
  Britain: (
    <>
      <rect width="36" height="24" fill="#012169" />
      <path d="M0,0 L36,24 M36,0 L0,24" stroke="#f4f6f8" strokeWidth="4.8" />
      <path d="M0,0 L36,24 M36,0 L0,24" stroke="#C8102E" strokeWidth="1.9" />
      <rect x="14" width="8" height="24" fill="#f4f6f8" />
      <rect y="8" width="36" height="8" fill="#f4f6f8" />
      <rect x="15.6" width="4.8" height="24" fill="#C8102E" />
      <rect y="9.6" width="36" height="4.8" fill="#C8102E" />
    </>
  )
}

// Small standalone flag icon for HTML UI (HUD chips, log, cards).
export const FlagIcon = ({ faction, className = 'swatch' }: { faction: string; className?: string }) =>
  FLAG_ART[faction] ? (
    <svg className={className} viewBox="0 0 36 24" preserveAspectRatio="none">
      {FLAG_ART[faction]}
    </svg>
  ) : (
    <span className={`${className} swatch-neutral`} />
  )

const FlagDefs = () => (
  <defs>
    {Object.entries(FLAG_ART).map(([name, art]) => (
      <symbol key={name} id={`flag-def-${name}`} viewBox="0 0 36 24" preserveAspectRatio="none">
        {art}
      </symbol>
    ))}
  </defs>
)

// Static decorative layers, built once so re-renders skip them entirely.
const CoastGlowLayer = (
  <g filter="url(#coast-glow)" opacity="0.65" pointerEvents="none">
    {LAND_PATHS.map((d, i) => (
      <path key={i} d={d} fill="#f0ead8" />
    ))}
  </g>
)

const LandmassInkLayer = (
  <g filter="url(#coast-glow)" opacity="0.4" pointerEvents="none">
    {LAND_PATHS.map((d, i) => (
      <path key={i} d={d} fill="none" stroke="#3b3122" strokeWidth={5} strokeLinejoin="round" />
    ))}
  </g>
)

const TerritoryInkLayer = (
  <>
  {/* wide, faint haze under the region borders — reads as depth, not as a line */}
  <g filter="url(#border-haze)" pointerEvents="none">
    {TERRITORY_PATHS.map((d, i) => (
      <path key={`h${i}`} d={d} fill="none" stroke="#4a3a28" strokeWidth={26} strokeOpacity={0.10} strokeLinejoin="round" />
    ))}
  </g>
  <g filter="url(#border-bleed)" pointerEvents="none">
    {TERRITORY_PATHS.map((d, i) => (
      <path key={`w${i}`} d={d} fill="none" stroke="#4a3a28" strokeWidth={5} strokeOpacity={0.3} strokeLinejoin="round" />
    ))}
    {TERRITORY_PATHS.map((d, i) => (
      <path key={`c${i}`} d={d} fill="none" stroke="#33291b" strokeWidth={1.2} strokeOpacity={0.5} strokeLinejoin="round" />
    ))}
  </g>
  </>
)

// Decorative cartographic labels: seas and neighboring countries. Editable in
// ?labelEdit=1 like territory labels; pins live in decorOverrides.json.
interface DecorDef {
  slug: string
  text: string
  cls: 'sea-label' | 'country-label'
  x: number
  y: number
  size: number
  rotate?: number
}
const DECOR_DEFS: DecorDef[] = [
  { slug: 'black-sea', text: 'Black Sea', cls: 'sea-label', x: 700, y: 86, size: 30 },
  { slug: 'mediterranean-sea', text: 'Mediterranean Sea', cls: 'sea-label', x: 540, y: 742, size: 26 },
  { slug: 'aegean-sea', text: 'Aegean Sea', cls: 'sea-label', x: 300, y: 550, size: 21, rotate: -72 },
  { slug: 'russia', text: 'Russia', cls: 'country-label', x: 1290, y: 40, size: 18 },
  { slug: 'georgia', text: 'Georgia', cls: 'country-label', x: 1245, y: 168, size: 15 },
  { slug: 'iran', text: 'Iran', cls: 'country-label', x: 1468, y: 455, size: 18 },
  { slug: 'serbia', text: 'Serbia', cls: 'country-label', x: 105, y: 130, size: 14 },
  { slug: 'romania', text: 'Romania', cls: 'country-label', x: 285, y: 26, size: 14 },
  { slug: 'cyprus', text: 'Cyprus', cls: 'country-label', x: 742, y: 686, size: 13 },
  { slug: 'crete', text: 'Crete', cls: 'country-label', x: 295, y: 663, size: 14 },
  { slug: 'greece', text: 'Greece', cls: 'country-label', x: 100, y: 395, size: 16 },
  { slug: 'macedonia', text: 'Macedonia', cls: 'country-label', x: 140, y: 195, size: 13 },
  { slug: 'azerbaijan', text: 'Azerbaijan', cls: 'country-label', x: 1440, y: 260, size: 16 }
]
const DECOR_BY_SLUG = Object.fromEntries(DECOR_DEFS.map(d => [d.slug, d]))
// starting arc params for a decor label that has never been edited: same
// anchor, its static rotation as the chord angle, a chord roughly as long as
// the tracked text, no bow
const decorDefaults = (def: DecorDef): LabelParams => ({
  x: def.x,
  y: def.y,
  ang: def.rotate ?? 0,
  len: Math.round(def.text.length * def.size * 1.05),
  size: def.size,
  bow: 0
})

// Set to true to re-enable the inner shadows along national borders.
const SHOW_FACTION_BORDER_SHADOWS = false

// ---- baked static art ----
// WebKit rasterizes SVG filters on the CPU and re-runs the whole chain every
// time the viewBox changes, which made pan/zoom crawl on Safari. The painted
// stack only changes on conquest, so it is rendered ONCE into an offscreen
// bitmap and the live SVG shows a single <image>; the filters never run
// during gestures. Edit mode (?labelEdit) keeps the fully live tree.
const ART_SCALE = 2.5 // bitmap px per map unit for the map art
const OVERLAY_SCALE = 1.5 // grain/blotch overlays — noise needs less
// The baked SVG is a standalone document that cannot see external
// stylesheets — keep these in sync with .map rules in game.css / map.css.
const ART_CSS = `
.bg-land { fill: #e7dcc1; stroke: #bcae8e; stroke-width: 0.7; }
.sea-label { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-style: italic; fill: #4f6b80; letter-spacing: 0.38em; opacity: 0.8; }
.country-label { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; fill: #8a7a5f; letter-spacing: 0.3em; text-transform: uppercase; opacity: 0.85; }
`

// rasterize an SVG document string into a fixed-resolution bitmap object URL
const bakeSvg = (markup: string, width: number, height: number, cb: (url: string) => void) => {
  const blob = new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const img = new Image()
  img.onload = () => {
    URL.revokeObjectURL(url)
    const canvas = document.createElement('canvas')
    canvas.width = Math.round(width)
    canvas.height = Math.round(height)
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
    canvas.toBlob(b => b && cb(URL.createObjectURL(b)))
  }
  img.onerror = () => URL.revokeObjectURL(url)
  img.src = url
}

/**
 * One territory's name, exactly as it is drawn live and exactly as it is baked.
 *
 * Both callers share this so the bitmap can never drift from the live tree —
 * a name that bakes even slightly differently from the one it replaces shows up
 * as a jump the moment the bake lands.
 */
const TerritoryName = ({
  slug,
  text,
  layout,
  at,
  editMode = false,
  isEditSel = false
}: {
  slug: string
  text: string
  layout: LabelLayout
  at: [number, number]
  editMode?: boolean
  isEditSel?: boolean
}) =>
  layout.kind === 'arc' ? (
    <>
      <path
        id={`lp-${slug}`}
        d={layout.d}
        fill="none"
        stroke={isEditSel ? '#ff2fd6' : DEBUG_LABEL_PATHS || editMode ? '#00ff44' : 'none'}
        strokeWidth={isEditSel ? 2.5 : DEBUG_LABEL_PATHS || editMode ? 2 : 0}
      />
      {/* tracking formula must match track() in labelLayout.ts */}
      <text
        className="name"
        fontSize={layout.size}
        letterSpacing={`${Math.min(0.18, 0.08 + Math.max(0, layout.size - 13) * 0.02).toFixed(3)}em`}
        style={
          layout.fill !== undefined || layout.stroke !== undefined || layout.strokeW !== undefined
            ? {
                fill: layout.fill,
                stroke: layout.stroke,
                strokeWidth: layout.strokeW !== undefined ? `${layout.strokeW}em` : undefined
              }
            : undefined
        }
      >
        <textPath href={`#lp-${slug}`} startOffset="50%" textAnchor="middle">
          {text}
        </textPath>
      </text>
    </>
  ) : (
    <text
      x={at[0]}
      y={at[1] - 15}
      className="name"
      textAnchor="middle"
      fontSize={layout.size}
      letterSpacing="0.05em"
      // plain labels have no guide path to grab, so the text itself
      // must take pointer events while editing
      style={editMode ? { fill: isEditSel ? '#ff2fd6' : undefined, pointerEvents: 'all' } : undefined}
    >
      {text}
    </text>
  )

// static decor labels (pins only — no editor state), part of the baked art
const StaticDecor = () => (
  <g className="decor-labels" pointerEvents="none">
    {DECOR_DEFS.map(def => {
      const p = (decorPins as Record<string, LabelParams>)[def.slug]
      if (!p)
        return (
          <text
            key={def.slug}
            x={def.x}
            y={def.y}
            className={def.cls}
            fontSize={def.size}
            textAnchor="middle"
            transform={def.rotate ? `rotate(${def.rotate} ${def.x} ${def.y})` : undefined}
          >
            {tDecor(def.slug, def.text)}
          </text>
        )
      const arc = arcFromParams(p)
      const styled = p.fill !== undefined || p.stroke !== undefined || p.strokeW !== undefined
      return (
        <g key={def.slug}>
          <path id={`dp-${def.slug}`} d={arc.d} fill="none" />
          <text
            className={def.cls}
            fontSize={p.size}
            style={
              styled
                ? {
                    fill: p.fill,
                    stroke: p.stroke,
                    strokeWidth: p.strokeW !== undefined ? `${p.strokeW}em` : undefined,
                    paintOrder: 'stroke'
                  }
                : undefined
            }
          >
            <textPath href={`#dp-${def.slug}`} startOffset="50%" textAnchor="middle">
              {tDecor(def.slug, def.text)}
            </textPath>
          </text>
        </g>
      )
    })}
  </g>
)

// Debug: paint each label's chosen arc path in bright green.
// (?labelEdit=1 shows the guides regardless.)
const DEBUG_LABEL_PATHS = false

interface Component {
  faction: string
  slugs: string[]
}

// ---- painted-stack pieces ----
// Split so conquest re-bakes ONLY what it changes (flags, region shades,
// bands, border shadows — cheap geometry plus one color matrix) while the
// heavyweight blur/turbulence layers bake once at load. Cross-piece blending
// (multiply) happens in CANVAS composite ops during assembly, which is also
// engine-consistent — Safari's SVG-image blend support is unreliable.

const ArtBase = () => (
  <>
    <rect x={30} y={0} width={1500} height={820} fill="#8fa7b4" />
    <rect x={30} y={0} width={1500} height={820} fill="url(#sea-depth)" pointerEvents="none" />
    {CoastGlowLayer}
    {LandmassInkLayer}
    {mapData.background.map((d, i) => (
      <path key={`bg-${i}`} d={d} className="bg-land" />
    ))}
    {/* the passive countries' borders carry the same soft shadow as the
        playable regions — without it they read as flat outlines. Wide and
        faint: it should read as haze around the line, never as a second line. */}
    <g filter="url(#border-haze)" pointerEvents="none">
      {mapData.background.map((d, i) => (
        <path
          key={`bgs-${i}`}
          d={d}
          fill="none"
          stroke="#4a3a28"
          strokeWidth={26}
          strokeOpacity={0.10}
          strokeLinejoin="round"
        />
      ))}
    </g>
  </>
)

const ArtFlags = ({ bySlug, flagClusters }: { bySlug: Record<string, Territory>; flagClusters: Component[] }) => (
  <g className="flag-layer" filter="url(#flag-tone)" pointerEvents="none">
    {/* base coats hide antialiasing seams at the clip edges */}
    {Object.entries(mapData.territories).map(([slug, data]) =>
      data.paths.map((d, i) => (
        <path key={`${slug}-${i}`} d={d} fill={FLAG_STYLES[bySlug[slug].faction.name].fill} />
      ))
    )}
    {/* one glorious flag per geometric blob, cover-scaled and clipped to it */}
    {flagClusters.map((component, index) => {
      const box = component.slugs.reduce(
        (acc, slug) => {
          const b = (mapData.territories as any)[slug].bbox as number[]
          return [Math.min(acc[0], b[0]), Math.min(acc[1], b[1]), Math.max(acc[2], b[2]), Math.max(acc[3], b[3])]
        },
        [Infinity, Infinity, -Infinity, -Infinity]
      )
      const width = box[2] - box[0]
      const height = box[3] - box[1]
      // Cover the blob at the flag's true 3:2 aspect — crop, never squish.
      const scale = Math.max(width / 36, height / 24) * 1.02
      const flagW = 36 * scale
      const flagH = 24 * scale
      const x = (box[0] + box[2]) / 2 - flagW / 2
      const y = (box[1] + box[3]) / 2 - flagH / 2
      return (
        <g key={index} clipPath={`url(#flag-clip-${index})`}>
          <clipPath id={`flag-clip-${index}`}>
            {component.slugs.flatMap(slug =>
              (mapData.territories as any)[slug].paths.map((d: string, i: number) => <path key={`${slug}-${i}`} d={d} />)
            )}
          </clipPath>
          <use href={`#flag-def-${component.faction}`} x={x} y={y} width={flagW} height={flagH} />
        </g>
      )
    })}
  </g>
)

// blend=true renders the multiply inline (live edit mode); the compositor
// bakes with blend=false and multiplies on the canvas instead
const ArtRegionShade = ({ bySlug, blend }: { bySlug: Record<string, Territory>; blend: boolean }) => (
  <g
    className="region-shade-layer"
    style={blend ? { mixBlendMode: 'multiply' } : undefined}
    pointerEvents="none"
  >
    {Object.entries(mapData.territories).map(([slug, data]) =>
      (data as any).paths.map((d: string, i: number) => (
        <path
          key={`${slug}-${i}`}
          d={d}
          fill="#000"
          filter={`url(#region-shade-${bySlug[slug].faction.name})`}
        />
      ))
    )}
  </g>
)

const ArtBands = ({ flagClusters }: { flagClusters: Component[] }) => (
  <g className="faction-line-layer" pointerEvents="none">
    {flagClusters.map(cluster => {
      const d = blobOutline(cluster.slugs)
      const key = cluster.slugs.slice().sort().join('-')
      return (
        <g key={key}>
          <clipPath id={`blob-clip-${key}`} clipRule="nonzero">
            {cluster.slugs.flatMap(slug =>
              ((mapData.territories as any)[slug].paths as string[]).map((pd, i) => (
                <path key={`${slug}-${i}`} d={pd} />
              ))
            )}
          </clipPath>
          <g clipPath={`url(#blob-clip-${key})`}>
            <path
              d={d}
              fill="none"
              stroke={FLAG_STYLES[cluster.faction].border ?? FLAG_STYLES[cluster.faction].stroke}
              strokeWidth={12}
              strokeLinejoin="miter"
              strokeMiterlimit={3}
            />
          </g>
        </g>
      )
    })}
  </g>
)

const ArtBandShadows = ({ flagClusters, blend }: { flagClusters: Component[]; blend: boolean }) => (
  <g pointerEvents="none" style={blend ? { mixBlendMode: 'multiply' } : undefined}>
    {flagClusters.map(cluster => {
      const key = cluster.slugs.slice().sort().join('-')
      return (
        <g key={key}>
          <clipPath id={`blobsh-clip-${key}`} clipRule="nonzero">
            {cluster.slugs.flatMap(slug =>
              ((mapData.territories as any)[slug].paths as string[]).map((pd, i) => (
                <path key={`${slug}-${i}`} d={pd} />
              ))
            )}
          </clipPath>
          <g
            clipPath={`url(#blobsh-clip-${key})`}
            fill={FLAG_STYLES[cluster.faction].border ?? FLAG_STYLES[cluster.faction].stroke}
          >
            {blobShadowRings(cluster.slugs).map((rd, i, arr) => (
              <path key={i} d={rd} fillRule="evenodd" fillOpacity={0.4 * (1 - (i + 0.5) / arr.length)} />
            ))}
          </g>
        </g>
      )
    })}
  </g>
)

const ArtCoastShade = ({ blend }: { blend: boolean }) => (
  <g filter="url(#coast-shade)" style={blend ? { mixBlendMode: 'multiply' } : undefined} pointerEvents="none">
    {LAND_PATHS.map((d, i) => (
      <path key={i} d={d} fill="#000" />
    ))}
  </g>
)

// The full painted stack, assembled live — used in edit mode and as the
// pre-first-bake fallback. In play the compositor assembles the same pieces
// on a canvas instead (see the bake effect).
const MapArt = ({
  bySlug,
  flagClusters,
  components,
  decor
}: {
  bySlug: Record<string, Territory>
  flagClusters: Component[]
  components: Component[]
  decor: boolean
}) => (
  <>
    <ArtBase />
    <ArtFlags bySlug={bySlug} flagClusters={flagClusters} />
    <ArtRegionShade bySlug={bySlug} blend />
    {TerritoryInkLayer}
    {SHOW_FACTION_BORDER_SHADOWS && (
      <g className="faction-shadow-layer" pointerEvents="none">
        {components.map((component, index) => (
          <g key={index} filter={`url(#faction-shadow-${component.faction})`}>
            {component.slugs.flatMap(slug =>
              (mapData.territories as any)[slug].paths.map((d: string, i: number) => (
                <path key={`${slug}-${i}`} d={d} fill="#000" stroke="#000" strokeWidth={3.5} strokeLinejoin="round" />
              ))
            )}
          </g>
        ))}
      </g>
    )}
    <ArtBands flagClusters={flagClusters} />
    <ArtBandShadows flagClusters={flagClusters} blend />
    <ArtCoastShade blend />
    {/* warm parchment tint pulls sea, land and flag fills into one painted palette */}
    <rect
      x={30}
      y={0}
      width={1500}
      height={820}
      fill="#e6d3aa"
      opacity={0.2}
      style={{ mixBlendMode: 'multiply' }}
      pointerEvents="none"
    />
    {/* pale wash veil pastelizes everything into one watercolor sheet */}
    <rect x={30} y={0} width={1500} height={820} fill="#f0e6cd" opacity={0.12} pointerEvents="none" />
    {decor && <StaticDecor />}
  </>
)

// Contiguous same-faction blobs, walked over the adjacency graph.
const contiguousComponents = (territories: Territory[]): Component[] => {
  const components: Component[] = []
  const seen = new Set<string>()
  for (const territory of territories) {
    if (seen.has(territory.slug)) continue
    seen.add(territory.slug)
    const slugs: string[] = []
    const stack = [territory]
    while (stack.length) {
      const current = stack.pop() as Territory
      slugs.push(current.slug)
      current.adjacent.forEach(a => {
        if (!seen.has(a.slug) && a.faction === territory.faction) {
          seen.add(a.slug)
          stack.push(a)
        }
      })
    }
    components.push({ faction: territory.faction.name, slugs })
  }
  return components
}

// Flag-placement grouping: same-faction territories whose shapes actually touch
// (measured geoNeighbors baked into map-data). Game adjacency alone can join
// territories across water or foreign land (Istanbul ↔ the strait zones), which
// would stretch one flag over a far larger area than the shapes actually cover.
const geoClusters = (territories: Territory[]): Component[] => {
  const clusters: Component[] = []
  const seen = new Set<string>()
  const bySlug = new Map(territories.map(t => [t.slug, t]))
  for (const territory of territories) {
    if (seen.has(territory.slug)) continue
    seen.add(territory.slug)
    const slugs: string[] = []
    const stack = [territory]
    while (stack.length) {
      const current = stack.pop() as Territory
      slugs.push(current.slug)
      for (const n of (mapData.territories as any)[current.slug].geoNeighbors as string[]) {
        const other = bySlug.get(n)
        if (other && !seen.has(n) && other.faction === territory.faction) {
          seen.add(n)
          stack.push(other)
        }
      }
    }
    clusters.push({ faction: territory.faction.name, slugs })
  }
  return clusters
}

interface MapViewProps {
  territories: Territory[]
  selected: string | null
  targets: string[]
  /** troops mid-crossing, drawn in open water on their lane */
  convoys: Convoy[]
  round: number
  onTerritoryClick: (slug: string) => void
  onReady?: () => void
}

const MapView = ({ territories, selected, targets, convoys, round, onTerritoryClick, onReady }: MapViewProps) => {
  // hover tracked in state (not CSS :hover) so the badge/label layer above the
  // hit layer also lights up its territory
  const [hovered, setHovered] = useState<string | null>(null)
  // trackpad zoom/pan: pinch (ctrl+wheel) zooms toward the cursor, two-finger
  // scroll pans; the view is a zoom level + center, clamped to the base frame
  const svgRef = useRef<SVGSVGElement | null>(null)
  const readyReported = useRef(false)
  const [view, setView] = useState({ z: 1, cx: VB.x + VB.w / 2, cy: VB.y + VB.h / 2 })
  // viewRef is the live gesture value; state trails it (committed after the
  // gesture settles) so React never re-renders per pointer frame. Synced from
  // state only when state itself changes — a hover re-render mid-gesture must
  // not clobber the ref with a stale committed value.
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])
  const commitTimer = useRef<number | undefined>(undefined)
  // write the viewBox straight to the DOM during gestures; commit to React
  // state (for the dot counter-scaling etc.) once the gesture goes quiet
  const applyView = (v: { z: number; cx: number; cy: number }) => {
    viewRef.current = v
    const svg = svgRef.current
    if (svg) {
      const b = baseDims(aspectRef.current)
      const w = b.w / v.z
      const h = b.h / v.z
      svg.setAttribute('viewBox', `${v.cx - w / 2} ${v.cy - h / 2} ${w} ${h}`)
    }
    window.clearTimeout(commitTimer.current)
    commitTimer.current = window.setTimeout(() => setView(viewRef.current), 150)
  }
  // the screen's aspect ratio drives the base viewBox (cover behavior)
  const [aspect, setAspect] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : 16 / 9
  )
  const aspectRef = useRef(aspect)
  aspectRef.current = aspect
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const r = svg.getBoundingClientRect()
      if (r.height > 0) setAspect(r.width / r.height)
    }
    measure()
    // belt and braces: ResizeObserver catches container resizes, the window
    // listeners cover environments where observer delivery is flaky
    const ro = new ResizeObserver(measure)
    ro.observe(svg)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])
  // Measuring the HUD costs a layout of five elements, and clampChrome runs on
  // every touchmove and every glide frame — on a slow phone that alone is
  // enough to starve the gesture of events. Measure once per gesture instead:
  // the bars do not move while a finger is down.
  const chromeRef = useRef({ top: 0, bottom: 0 })
  const measureChrome = () => {
    chromeRef.current = hudChromePx()
    return chromeRef.current
  }

  // clamp with the HUD chrome pads folded in (converted to map units at the
  // target zoom's scale)
  const clampChrome = (z: number, cx: number, cy: number, a: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return clampView(z, cx, cy, a)
    const scale = rect.height / (baseDims(a).h / z)
    const chrome = chromeRef.current
    return clampView(z, cx, cy, a, chrome.top / scale, chrome.bottom / scale)
  }

  // re-clamp on resize so the map keeps covering the new viewport shape
  useEffect(() => {
    measureChrome()
    setView(v => clampChrome(v.z, v.cx, v.cy, aspect))
  }, [aspect])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    // native listener: React's synthetic wheel handlers are passive, so they
    // cannot preventDefault the page's own pinch/scroll gestures
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopGlide()
      measureChrome()
      const v = viewRef.current
      const a = aspectRef.current
      const rect = svg.getBoundingClientRect()
      const base = baseDims(a)
      const w = base.w / v.z
      const h = base.h / v.z
      const scale = Math.min(rect.width / w, rect.height / h)
      const padX = (rect.width - w * scale) / 2
      const padY = (rect.height - h * scale) / 2
      if (e.ctrlKey || e.metaKey) {
        const nz = Math.min(Math.max(v.z * Math.exp(-e.deltaY * 0.012), minZoomOut(a, rect)), ZOOM_MAX)
        // keep the map point under the cursor fixed while the scale changes
        const mx = v.cx - w / 2 + (e.clientX - rect.left - padX) / scale
        const my = v.cy - h / 2 + (e.clientY - rect.top - padY) / scale
        const nx = mx - (mx - (v.cx - w / 2)) * (v.z / nz)
        const ny = my - (my - (v.cy - h / 2)) * (v.z / nz)
        applyView(clampChrome(nz, nx + base.w / nz / 2, ny + base.h / nz / 2, a))
      } else {
        applyView(clampChrome(v.z, v.cx + e.deltaX / scale, v.cy + e.deltaY / scale, a))
      }
    }
    // touch: one finger pans, two fingers pinch-zoom around their midpoint
    const getPts = (e: TouchEvent) => Array.from(e.touches, t => [t.clientX, t.clientY])
    // screen px per map unit, for turning finger positions into map distances
    const scaleNow = () => {
      const v = viewRef.current
      const base = baseDims(aspectRef.current)
      const rect = svg.getBoundingClientRect()
      return Math.min(rect.width / (base.w / v.z), rect.height / (base.h / v.z))
    }
    let last: number[][] = []
    // Momentum. The pan is transform-driven rather than a scroll container, so
    // iOS gives it no inertia of its own — a flick simply stops dead the moment
    // the finger leaves. Velocity is sampled in MAP units per ms, so a flick
    // carries the same distance across the map at any zoom — see flickVelocity
    // for how the throw is read off the samples.
    let samples: { x: number; y: number; t: number }[] = []
    const WINDOW = 120
    let vx = 0
    let vy = 0
    let glide = 0
    const stopGlide = () => {
      if (glide) cancelAnimationFrame(glide)
      glide = 0
    }
    const FLICK_MIN = 0.012 // map units/ms below which a lift is not a flick
    const GLIDE_MIN = 0.006 // and below which the glide has arrived
    const onTouchStart = (e: TouchEvent) => {
      stopGlide()
      measureChrome()
      vx = 0
      vy = 0
      last = getPts(e)
      // Seed the buffer with where the finger STARTED. A phone under load may
      // deliver a single touchmove for a whole flick, and one sample has no
      // pair to be read against — the throw then reads as nothing at all.
      samples = last.length === 1 ? [{ x: last[0][0] / scaleNow(), y: last[0][1] / scaleNow(), t: performance.now() }] : []
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const now = getPts(e)
      const v = viewRef.current
      const a = aspectRef.current
      const rect = svg.getBoundingClientRect()
      const base = baseDims(a)
      const w = base.w / v.z
      const h = base.h / v.z
      const scale = Math.min(rect.width / w, rect.height / h)
      if (now.length === 1 && last.length >= 1) {
        const dx = (now[0][0] - last[0][0]) / scale
        const dy = (now[0][1] - last[0][1]) / scale
        // performance.now() rather than the event's own stamp: Safari has
        // shipped touch timestamps on more than one clock, and a flick read
        // against the wrong epoch is either zero or nonsense
        samples.push({ x: now[0][0] / scale, y: now[0][1] / scale, t: performance.now() })
        while (samples.length > 4 && samples[samples.length - 1].t - samples[0].t > WINDOW) samples.shift()
        applyView(clampChrome(v.z, v.cx - dx, v.cy - dy, a))
      } else if (now.length >= 2 && last.length >= 2) {
        samples = []
        const dist = (p: number[][]) => Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1])
        const mid = (p: number[][]) => [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]
        const nz = Math.min(Math.max((v.z * dist(now)) / Math.max(1, dist(last)), minZoomOut(a, rect)), ZOOM_MAX)
        const [cxS, cyS] = mid(now)
        const [lxS, lyS] = mid(last)
        // keep the map point under the pinch midpoint fixed, plus midpoint pan
        const mx = v.cx - w / 2 + (cxS - rect.left) / scale
        const my = v.cy - h / 2 + (cyS - rect.top) / scale
        const nx = mx - (mx - (v.cx - w / 2)) * (v.z / nz)
        const ny = my - (my - (v.cy - h / 2)) * (v.z / nz)
        applyView(
          clampChrome(nz, nx + base.w / nz / 2 - (cxS - lxS) / scale, ny + base.h / nz / 2 - (cyS - lyS) / scale, a)
        )
      }
      last = now
    }
    const onTouchEnd = (e: TouchEvent) => {
      const endT = performance.now()
      last = getPts(e)
      // a lift with fingers still down is a pinch ending, not a flick
      if (last.length > 0) {
        samples = []
        return
      }
      const flick = flickVelocity(samples, endT, FLICK_MIN)
      samples = []
      if (!flick) return
      vx = flick.vx
      vy = flick.vy
      let prev = performance.now()
      const step = (t: number) => {
        // a frame is only worth integrating if time has actually passed since
        // the lift — see glideStep, and the first frame after a touchend on iOS
        const dt = Math.min(32, t - prev)
        if (dt > 0) prev = t
        const v = viewRef.current
        const a = aspectRef.current
        const s = glideStep(v, vx, vy, dt, (cx, cy) => clampChrome(v.z, cx, cy, a))
        vx = s.vx
        vy = s.vy
        if (dt > 0) applyView(s.view)
        glide = Math.hypot(vx, vy) > GLIDE_MIN ? requestAnimationFrame(step) : 0
      }
      glide = requestAnimationFrame(step)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    svg.addEventListener('touchstart', onTouchStart, { passive: true })
    svg.addEventListener('touchmove', onTouchMove, { passive: false })
    svg.addEventListener('touchend', onTouchEnd, { passive: true })
    svg.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      stopGlide()
      svg.removeEventListener('wheel', onWheel)
      svg.removeEventListener('touchstart', onTouchStart)
      svg.removeEventListener('touchmove', onTouchMove)
      svg.removeEventListener('touchend', onTouchEnd)
      svg.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  const base = baseDims(aspect)
  // render from the live gesture value so an unrelated re-render mid-gesture
  // never writes a stale viewBox over the direct DOM updates
  const viewNow = viewRef.current
  const vw = base.w / viewNow.z
  const vh = base.h / viewNow.z
  const viewBox = `${viewNow.cx - vw / 2} ${viewNow.cy - vh / 2} ${vw} ${vh}`
  const dotScale = dotScaleFor(viewNow.z)
  const bySlug = Object.fromEntries(territories.map(t => [t.slug, t]))
  // re-read every render — App re-renders the whole tree on a language switch
  const lang = getLang()
  // ownership only changes on conquest — key the cluster computations and the
  // art bake on it instead of recomputing every render
  const ownershipKey = territories.map(t => t.faction.name).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const components = useMemo(() => contiguousComponents(territories), [ownershipKey])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flagClusters = useMemo(() => geoClusters(territories), [ownershipKey])
  const layouts = useMemo(
    () => labelLayouts(Object.fromEntries(territories.map(t => [t.slug, tTerritory(t.slug, t.name)])), lang),
    // territory geometry never changes during a game; only the display
    // language does, which is why `lang` is the only real dependency
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [lang]
  )

  // ?labelEdit=1 — hand-placement mode: drag/tune each label, overrides live
  // in localStorage and export as JSON (see LabelEditor.tsx)
  const editMode = useMemo(labelEditEnabled, [])
  const [overrides, setOverrides] = useState<Record<string, LabelParams>>(() => {
    if (!labelEditEnabled()) return {}
    try {
      return JSON.parse(localStorage.getItem('labelOverrides') || '{}')
    } catch {
      return {}
    }
  })
  const [dotOverrides, setDotOverrides] = useState<Record<string, DotParams>>(() => {
    if (!labelEditEnabled()) return {}
    try {
      return JSON.parse(localStorage.getItem('dotOverrides') || '{}')
    } catch {
      return {}
    }
  })
  const [decorOverrides, setDecorOverrides] = useState<Record<string, LabelParams>>(() => {
    if (!labelEditEnabled()) return {}
    try {
      return JSON.parse(localStorage.getItem('decorOverrides') || '{}')
    } catch {
      return {}
    }
  })
  const [editSel, setEditSel] = useState<{ kind: 'label' | 'dot' | 'decor'; slug: string } | null>(null)
  useEffect(() => {
    if (!editMode) return
    localStorage.setItem('labelOverrides', JSON.stringify(overrides))
    localStorage.setItem('dotOverrides', JSON.stringify(dotOverrides))
    localStorage.setItem('decorOverrides', JSON.stringify(decorOverrides))
  }, [editMode, overrides, dotOverrides, decorOverrides])

  const effParams = (slug: string): LabelParams =>
    overrides[slug] ??
    paramsFromLayout(layouts[slug], bySlug[slug].name, (mapData.territories as any)[slug].label as [number, number])

  // effective army-dot position: live edit > pinned > generated anchor
  const effDot = (slug: string): DotParams => {
    if (editMode && dotOverrides[slug]) return dotOverrides[slug]
    const pin = (dotPins as Record<string, DotParams>)[slug]
    if (pin) return pin
    const [x, y] = (mapData.territories as any)[slug].label as [number, number]
    return { x, y }
  }

  // effective decor (sea/country) params: live edit > pinned > static default
  const effDecor = (slug: string): LabelParams =>
    (editMode ? decorOverrides[slug] : undefined) ??
    (decorPins as Record<string, LabelParams>)[slug] ??
    decorDefaults(DECOR_BY_SLUG[slug])

  const patchLabel = (slug: string, patch: Partial<LabelParams>) =>
    setOverrides(o => ({ ...o, [slug]: { ...(o[slug] ?? effParams(slug)), ...patch } }))
  const patchDot = (slug: string, patch: Partial<DotParams>) =>
    setDotOverrides(o => ({ ...o, [slug]: { ...(o[slug] ?? effDot(slug)), ...patch } }))
  const patchDecor = (slug: string, patch: Partial<LabelParams>) =>
    setDecorOverrides(o => ({ ...o, [slug]: { ...(o[slug] ?? effDecor(slug)), ...patch } }))

  const startEditDrag = (kind: 'label' | 'dot' | 'decor', slug: string, e: React.PointerEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setEditSel({ kind, slug })
    const svg = svgRef.current
    if (!svg) return
    const start = kind === 'label' ? effParams(slug) : kind === 'dot' ? effDot(slug) : effDecor(slug)
    const patch = kind === 'label' ? patchLabel : kind === 'dot' ? patchDot : patchDecor
    const sx = e.clientX
    const sy = e.clientY
    const rect = svg.getBoundingClientRect()
    const v = viewRef.current
    const b = baseDims(aspectRef.current)
    const scale = Math.min(rect.width / (b.w / v.z), rect.height / (b.h / v.z))
    let moved = false
    const move = (ev: PointerEvent) => {
      // a plain click only selects — an override is created once the pointer
      // actually travels
      if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return
      moved = true
      patch(slug, {
        x: Math.round(((ev.clientX - sx) / scale + start.x) * 10) / 10,
        y: Math.round(((ev.clientY - sy) / scale + start.y) * 10) / 10
      })
    }
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  // arrow-key nudging for the selected label or dot (⇧ = ×10)
  useEffect(() => {
    if (!editMode) return
    const onKey = (e: KeyboardEvent) => {
      if (!editSel) return
      const tag = (e.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const d = e.shiftKey ? 10 : 1
      const p =
        editSel.kind === 'label'
          ? effParams(editSel.slug)
          : editSel.kind === 'dot'
            ? effDot(editSel.slug)
            : effDecor(editSel.slug)
      const patch: Partial<DotParams> | null =
        e.key === 'ArrowLeft'
          ? { x: p.x - d }
          : e.key === 'ArrowRight'
            ? { x: p.x + d }
            : e.key === 'ArrowUp'
              ? { y: p.y - d }
              : e.key === 'ArrowDown'
                ? { y: p.y + d }
                : null
      if (patch) {
        e.preventDefault()
        ;(editSel.kind === 'label' ? patchLabel : editSel.kind === 'dot' ? patchDot : patchDecor)(editSel.slug, patch)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  // ---- offscreen bakes ----
  // Static pieces (the expensive blur/turbulence filters) rasterize ONCE to
  // PNG blobs; every conquest re-rasterizes only the cheap dynamic pieces and
  // assembles the final bitmap on a canvas. Canvas composite ops carry the
  // multiply blending, identically in every engine.
  const [artUrl, setArtUrl] = useState<string | null>(null)
  const artUrlRef = useRef<string | null>(null)
  const staticPartsRef = useRef<Promise<Blob[]> | null>(null)
  // the static bucket includes StaticDecor's sea/country labels, which DO
  // depend on language — invalidate and re-bake (once, cheaply) on a switch
  const staticLangRef = useRef<string | null>(null)
  // conquest reveal: when a re-bake lands, the new bitmap washes over the old
  // one in a soft-edged circle growing from the conquered territory
  const [reveal, setReveal] = useState<null | { prevUrl: string; origin: [number, number]; radius: number }>(null)
  const revealCircleRef = useRef<SVGCircleElement | null>(null)
  const bakedOwnersRef = useRef<Record<string, string> | null>(null)

  const wrapSvg = (children: React.ReactNode) =>
    renderToStaticMarkup(
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox={`${VB.x} ${VB.y} ${VB.w} ${VB.h}`}
        width={Math.round(VB.w * ART_SCALE)}
        height={Math.round(VB.h * ART_SCALE)}
      >
        <style>{ART_CSS}</style>
        <FlagDefs />
        <PaintDefs />
        {children}
      </svg>
    )
  const loadImage = (url: string): Promise<HTMLImageElement> =>
    new Promise((resolve, reject) => {
      const img = new Image()
      img.onload = () => resolve(img)
      img.onerror = reject
      img.src = url
    })
  const rasterizeSvg = (markup: string) =>
    loadImage(URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml;charset=utf-8' })))
  const toPng = async (markup: string): Promise<Blob> => {
    const img = await rasterizeSvg(markup)
    const c = document.createElement('canvas')
    c.width = Math.round(VB.w * ART_SCALE)
    c.height = Math.round(VB.h * ART_SCALE)
    c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
    URL.revokeObjectURL(img.src)
    return new Promise((res, rej) => c.toBlob(b => (b ? res(b) : rej(new Error('toBlob failed'))), 'image/png'))
  }

  useEffect(() => {
    if (editMode) return
    // base / territory ink / coast shade never change; decor labels do when
    // the language switches — re-bake the static bucket when that happens
    if (staticLangRef.current !== lang) staticPartsRef.current = null
    staticLangRef.current = lang
    if (!staticPartsRef.current)
      staticPartsRef.current = Promise.all([
        toPng(wrapSvg(<ArtBase />)),
        toPng(wrapSvg(TerritoryInkLayer)),
        toPng(wrapSvg(<ArtCoastShade blend={false} />)),
        toPng(wrapSvg(<StaticDecor />))
      ])
    let cancelled = false
    ;(async () => {
      try {
        const [statics, flagsImg, shadeImg, bandsImg, bandShadowImg] = await Promise.all([
          staticPartsRef.current!.then(blobs => Promise.all(blobs.map(b => loadImage(URL.createObjectURL(b))))),
          rasterizeSvg(wrapSvg(<ArtFlags bySlug={bySlug} flagClusters={flagClusters} />)),
          rasterizeSvg(wrapSvg(<ArtRegionShade bySlug={bySlug} blend={false} />)),
          rasterizeSvg(wrapSvg(<ArtBands flagClusters={flagClusters} />)),
          rasterizeSvg(wrapSvg(<ArtBandShadows flagClusters={flagClusters} blend={false} />))
        ])
        const [baseImg, inkImg, coastImg, decorImg] = statics
        const all = [...statics, flagsImg, shadeImg, bandsImg, bandShadowImg]
        if (cancelled) {
          all.forEach(i => URL.revokeObjectURL(i.src))
          return
        }
        const W = Math.round(VB.w * ART_SCALE)
        const H = Math.round(VB.h * ART_SCALE)
        const canvas = document.createElement('canvas')
        canvas.width = W
        canvas.height = H
        const ctx = canvas.getContext('2d')!
        ctx.drawImage(baseImg, 0, 0, W, H)
        ctx.drawImage(flagsImg, 0, 0, W, H)
        ctx.globalCompositeOperation = 'multiply'
        ctx.drawImage(shadeImg, 0, 0, W, H)
        ctx.globalCompositeOperation = 'source-over'
        ctx.drawImage(inkImg, 0, 0, W, H)
        ctx.drawImage(bandsImg, 0, 0, W, H)
        ctx.globalCompositeOperation = 'multiply'
        ctx.drawImage(bandShadowImg, 0, 0, W, H)
        ctx.drawImage(coastImg, 0, 0, W, H)
        // parchment tint (multiply at 0.2), then the pale veil (normal 0.12)
        ctx.fillStyle = '#e6d3aa'
        ctx.globalAlpha = 0.2
        ctx.fillRect(0, 0, W, H)
        ctx.globalCompositeOperation = 'source-over'
        ctx.globalAlpha = 0.12
        ctx.fillStyle = '#f0e6cd'
        ctx.fillRect(0, 0, W, H)
        ctx.globalAlpha = 1
        ctx.drawImage(decorImg, 0, 0, W, H)
        all.forEach(i => URL.revokeObjectURL(i.src))
        canvas.toBlob(b => {
          if (!b || cancelled) return
          const owners: Record<string, string> = {}
          for (const t of territories) owners[t.slug] = t.faction.name
          const previousOwners = bakedOwnersRef.current
          bakedOwnersRef.current = owners
          const changed = previousOwners
            ? territories.find(t => previousOwners[t.slug] && previousOwners[t.slug] !== t.faction.name)
            : undefined
          const oldUrl = artUrlRef.current
          artUrlRef.current = URL.createObjectURL(b)
          setArtUrl(artUrlRef.current)
          if (oldUrl && changed) {
            const dot = effDot(changed.slug)
            // the wash only needs to cover the region that actually changed —
            // sized to the territory so the edge crosses it slowly enough to see
            const bb = ((mapData.territories as any)[changed.slug].bbox as number[]) ?? [dot.x - 60, dot.y - 60, dot.x + 60, dot.y + 60]
            const radius = (Math.hypot(bb[2] - bb[0], bb[3] - bb[1]) / 2) * 1.4 + 30
            setReveal(prev => {
              if (prev) URL.revokeObjectURL(prev.prevUrl)
              return { prevUrl: oldUrl, origin: [dot.x, dot.y], radius }
            })
          } else if (oldUrl) {
            URL.revokeObjectURL(oldUrl)
          }
        })
      } catch (e) {
        // a failed bake keeps the previous bitmap; log for diagnosis
        console.error('map bake failed', e)
      }
    })()
    return () => {
      cancelled = true
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ownershipKey, editMode, lang])

  // drive the conquest reveal: grow the mask circle until its soft edge has
  // cleared the frame, then drop the old bitmap
  useEffect(() => {
    if (!reveal) return
    const c = revealCircleRef.current
    if (!c) return
    const Rmax = reveal.radius / 0.65 // gradient opaque to 65% — overshoot so the fade clears
    const t0 = performance.now()
    const DUR = 900
    let raf = 0
    const tick = () => {
      const t = Math.min(1, (performance.now() - t0) / DUR)
      c.setAttribute('r', String(Rmax * (1 - Math.pow(1 - t, 3))))
      if (t < 1) raf = requestAnimationFrame(tick)
      else {
        URL.revokeObjectURL(reveal.prevUrl)
        setReveal(null)
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [reveal])

  // the grain and blotch overlays never change — bake each once and keep its
  // element-level blend mode so the math against the map below is unchanged
  // (the vignette stays a live gradient rect: gradients are cheap)
  const [grainUrl, setGrainUrl] = useState<string | null>(null)
  const [blotchUrl, setBlotchUrl] = useState<string | null>(null)
  useEffect(() => {
    const bakeNoise = (filter: string, cb: (url: string) => void) =>
      bakeSvg(
        renderToStaticMarkup(
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="-400 -300 2360 1420"
            width={2360 * OVERLAY_SCALE}
            height={1420 * OVERLAY_SCALE}
          >
            <PaintDefs />
            <rect x={-400} y={-300} width={2360} height={1420} filter={`url(#${filter})`} />
          </svg>
        ),
        2360 * OVERLAY_SCALE,
        1420 * OVERLAY_SCALE,
        cb
      )
    bakeNoise('paper-grain', setGrainUrl)
    bakeNoise('wash-blotch', setBlotchUrl)
  }, [])

  // Do not uncover the game until its final bitmap stack is decoded and has
  // survived a browser paint. The live SVG fallback is useful while baking,
  // but it is not the finished map the intro should transition into.
  useEffect(() => {
    if (readyReported.current) return
    if (!editMode && (!artUrl || !grainUrl || !blotchUrl)) return

    let cancelled = false
    let firstFrame = 0
    let secondFrame = 0
    const urls = editMode ? [] : [artUrl!, grainUrl!, blotchUrl!]
    const decode = (url: string) =>
      new Promise<void>(resolve => {
        const image = new Image()
        image.onload = () => resolve()
        image.onerror = () => resolve()
        image.src = url
        image.decode?.().then(resolve, () => undefined)
      })

    Promise.all(urls.map(decode)).then(() => {
      if (cancelled) return
      firstFrame = requestAnimationFrame(() => {
        secondFrame = requestAnimationFrame(() => {
          if (cancelled || readyReported.current) return
          readyReported.current = true
          onReady?.()
        })
      })
    })

    return () => {
      cancelled = true
      cancelAnimationFrame(firstFrame)
      cancelAnimationFrame(secondFrame)
    }
  }, [artUrl, grainUrl, blotchUrl, editMode, onReady])

  const decorLayer = (
    <g className="decor-labels" pointerEvents={editMode ? undefined : 'none'}>
      {DECOR_DEFS.map(def => {
        const p = effDecor(def.slug)
        // an arc is rendered whenever one EXISTS for this label — a live
        // override or a committed pin. (Checking only the live overrides in
        // edit mode made pinned labels fall back to their raw DECOR_DEFS
        // anchor, so they jumped position the moment ?labelEdit was on.)
        const edited = !!(decorOverrides[def.slug] || (decorPins as Record<string, LabelParams>)[def.slug])
        const isSel = editMode && editSel?.kind === 'decor' && editSel.slug === def.slug
        const grab = editMode ? { cursor: 'grab' as const } : undefined
        // untouched decor labels keep their original static rendering exactly
        if (!edited)
          return (
            <text
              key={def.slug}
              x={def.x}
              y={def.y}
              className={def.cls}
              fontSize={def.size}
              textAnchor="middle"
              transform={def.rotate ? `rotate(${def.rotate} ${def.x} ${def.y})` : undefined}
              style={isSel ? { ...grab, fill: '#ff2fd6' } : grab}
              onPointerDown={editMode ? e => startEditDrag('decor', def.slug, e) : undefined}
            >
              {tDecor(def.slug, def.text)}
            </text>
          )
        const arc = arcFromParams(p)
        return (
          <g key={def.slug} style={grab} onPointerDown={editMode ? e => startEditDrag('decor', def.slug, e) : undefined}>
            <path
              id={`dp-${def.slug}`}
              d={arc.d}
              fill="none"
              stroke={isSel ? '#ff2fd6' : editMode ? '#00ff44' : 'none'}
              strokeWidth={isSel ? 2.5 : editMode ? 2 : 0}
            />
            <text
              className={def.cls}
              fontSize={p.size}
              style={
                p.fill !== undefined || p.stroke !== undefined || p.strokeW !== undefined
                  ? {
                      fill: p.fill,
                      stroke: p.stroke,
                      strokeWidth: p.strokeW !== undefined ? `${p.strokeW}em` : undefined,
                      paintOrder: 'stroke'
                    }
                  : undefined
              }
            >
              <textPath href={`#dp-${def.slug}`} startOffset="50%" textAnchor="middle">
                {tDecor(def.slug, def.text)}
              </textPath>
            </text>
          </g>
        )
      })}
    </g>
  )

  return (
    <>
    <svg ref={svgRef} className="map" viewBox={viewBox} preserveAspectRatio="xMidYMid slice">
      <FlagDefs />
      <PaintDefs />
      <clipPath id="map-frame">
        <rect x={30} y={0} width={1500} height={820} />
      </clipPath>
      {/* conquest reveal: soft-edged growing circle masking the fresh bake */}
      <radialGradient id="reveal-grad">
        <stop offset="65%" stopColor="#fff" />
        <stop offset="100%" stopColor="#fff" stopOpacity="0" />
      </radialGradient>
      <mask id="conquest-reveal" maskUnits="userSpaceOnUse" x={VB.x} y={VB.y} width={VB.w} height={VB.h}>
        {reveal && <circle ref={revealCircleRef} cx={reveal.origin[0]} cy={reveal.origin[1]} r={0} fill="url(#reveal-grad)" />}
      </mask>
      {/* dark parchment-desk surround fills the viewport outside the map frame */}
      <rect x={-4000} y={-4000} width={9500} height={9000} fill="#2e2419" />
      <g clipPath="url(#map-frame)">
        {/* the painted stack: a single pre-baked bitmap in play (SVG filters
            never run during gestures); fully live in edit mode and while the
            first bake is still cooking */}
        {editMode ? (
          <MapArt bySlug={bySlug} flagClusters={flagClusters} components={components} decor={false} />
        ) : artUrl ? (
          <>
            {reveal && (
              <image
                x={VB.x}
                y={VB.y}
                width={VB.w}
                height={VB.h}
                href={reveal.prevUrl}
                preserveAspectRatio="none"
                pointerEvents="none"
              />
            )}
            <g mask={reveal ? 'url(#conquest-reveal)' : undefined}>
              <image
                x={VB.x}
                y={VB.y}
                width={VB.w}
                height={VB.h}
                href={artUrl}
                preserveAspectRatio="none"
                pointerEvents="none"
              />
            </g>
          </>
        ) : null}
        {/* transparent interactive layer above the art: hit-testing + state outlines */}
        <g className="territory-layer">
          {Object.entries(mapData.territories).map(([slug, data]) => {
            const territory = bySlug[slug]
            const isSelected = selected === slug
            const isTarget = targets.includes(slug)
            return (
              <g
                key={slug}
                data-slug={slug}
                className={`territory${isSelected ? ' selected' : ''}${isTarget ? ' target' : ''}${
                  hovered === slug ? ' hover' : ''
                }`}
                onClick={() => onTerritoryClick(slug)}
                onMouseEnter={() => setHovered(slug)}
                onMouseLeave={() => setHovered(null)}
              >
                {data.paths.map((d, i) => (
                  <path key={i} d={d} fill="transparent" />
                ))}
                <title>
                  {i18nT('tooltip.territory', {
                    name: tTerritory(territory.slug, territory.name),
                    faction: tFaction(territory.faction.name),
                    troops: territory.troops
                  })}
                </title>
              </g>
            )
          })}
        </g>
        {/* labels on top so troop counts are never hidden by neighboring shapes */}
        {Object.entries(mapData.territories).map(([slug, data]) => {
          const territory = bySlug[slug]
          const [x, y] = data.label
          const style = FLAG_STYLES[territory.faction.name]
          const ov = editMode ? overrides[slug] : undefined
          const layout = ov ? arcFromParams(ov) : layouts[slug]
          const isEditSel = editMode && editSel?.kind === 'label' && editSel.slug === slug
          const dot = effDot(slug)
          const isDotSel = editMode && editSel?.kind === 'dot' && editSel.slug === slug
          return (
            <g
              key={`label-${slug}`}
              className="territory-label"
              style={editMode ? { cursor: 'grab' } : undefined}
              onClick={editMode ? undefined : () => onTerritoryClick(slug)}
              onPointerDown={editMode ? e => startEditDrag('label', slug, e) : undefined}
              onMouseEnter={() => setHovered(slug)}
              onMouseLeave={() => setHovered(null)}
            >
              <TerritoryName
                slug={slug}
                text={tTerritory(territory.slug, territory.name)}
                layout={layout}
                at={[x, y]}
                editMode={editMode}
                isEditSel={isEditSel}
              />
              {/* counter-scaled so army dots keep roughly constant screen size */}
              <g
                className="army-dot"
                transform={`translate(${dot.x} ${dot.y}) scale(${dotScale}) translate(${-dot.x} ${-dot.y})`}
                onPointerDown={editMode ? e => startEditDrag('dot', slug, e) : undefined}
              >
                <circle
                  cx={dot.x}
                  cy={dot.y}
                  r={11.5}
                  fill="#fffdf5"
                  stroke={isDotSel ? '#ff2fd6' : style.stroke}
                  strokeWidth={2.5}
                />
                <text x={dot.x} y={dot.y + 4} className="troops" textAnchor="middle">
                  {territory.troops}
                </text>
                <text x={dot.x} y={dot.y + 22} className="units" textAnchor="middle">
                  {unitGlyphs(territory.troops)}
                </text>
              </g>
            </g>
          )
        })}
        {/* Convoys crossing the Aegean. Two rounds of a faction's army sitting
            in open water is the most consequential thing on the board that has
            no province to be drawn in, so it gets a marker of its own — the
            player can see the reinforcement coming and how long it has left. */}
        {convoys.map((convoy, i) => {
          const lane = SEA_LANES.find(l => l.ports.includes(convoy.from) && l.ports.includes(convoy.to))
          if (!lane) return null
          // several crossings can be in the water on one lane at once; fan them
          // down the sea rather than stacking them on the same pin
          const berth = convoys.slice(0, i).filter(c => c.from === convoy.from || c.to === convoy.from).length
          const [x, y] = [lane.at[0], lane.at[1] + berth * 42]
          const style = FLAG_STYLES[convoy.faction]
          const away = Math.max(0, convoy.arrives - round)
          return (
            <g
              key={`convoy-${i}`}
              className="convoy"
              transform={`translate(${x} ${y}) scale(${dotScale}) translate(${-x} ${-y})`}
              pointerEvents="none"
            >
              <title>
                {i18nT(away === 1 ? 'tooltip.convoyLast' : 'tooltip.convoy', {
                  faction: tFaction(convoy.faction),
                  troops: convoy.troops,
                  to: tTerritory(convoy.to, bySlug[convoy.to].name),
                  rounds: away
                })}
              </title>
              <circle cx={x} cy={y} r={13} fill="#fffdf5" stroke={style.stroke} strokeWidth={2.5} />
              <text x={x} y={y + 4} className="troops" textAnchor="middle">
                {convoy.troops}
              </text>
              {/* the ship rides alongside the counter, the way the unit glyphs
                  sit under a province's dot — not stacked above it, which
                  collides with the convoy berthed higher up the lane */}
              <path className="convoy-ship" transform={`translate(${x - 21} ${y - 1}) scale(0.6)`} d={SHIP} />
              <text x={x} y={y + 24} className="convoy-eta" textAnchor="middle">
                {'•'.repeat(away)}
              </text>
            </g>
          )
        })}
        {editMode && decorLayer}
      </g>
      {/* paper grain + watercolor mottle + vignette over the whole canvas —
          grain and blotch are pre-baked bitmaps carrying the same element-level
          blend modes, so the compositing math is unchanged */}
      {editMode ? (
        <rect
          x={-400}
          y={-300}
          width={2360}
          height={1420}
          filter="url(#paper-grain)"
          opacity={0.4}
          style={{ mixBlendMode: 'multiply' }}
          pointerEvents="none"
        />
      ) : grainUrl ? (
        <image
          x={-400}
          y={-300}
          width={2360}
          height={1420}
          href={grainUrl}
          preserveAspectRatio="none"
          opacity={0.4}
          style={{ mixBlendMode: 'multiply' }}
          pointerEvents="none"
        />
      ) : null}
      {editMode ? (
        <rect
          x={-400}
          y={-300}
          width={2360}
          height={1420}
          filter="url(#wash-blotch)"
          opacity={0.6}
          style={{ mixBlendMode: 'soft-light' }}
          pointerEvents="none"
        />
      ) : blotchUrl ? (
        <image
          x={-400}
          y={-300}
          width={2360}
          height={1420}
          href={blotchUrl}
          preserveAspectRatio="none"
          opacity={0.6}
          style={{ mixBlendMode: 'soft-light' }}
          pointerEvents="none"
        />
      ) : null}
      <rect x={-400} y={-300} width={2360} height={1420} fill="url(#vignette-grad)" pointerEvents="none" />
    </svg>
    {editMode && (
      <LabelEditorPanel
        slug={editSel?.slug ?? null}
        name={editSel ? (editSel.kind === 'decor' ? DECOR_BY_SLUG[editSel.slug].text : bySlug[editSel.slug].name) : null}
        kind={editSel?.kind ?? null}
        params={
          editSel?.kind === 'label' ? effParams(editSel.slug) : editSel?.kind === 'decor' ? effDecor(editSel.slug) : null
        }
        dot={editSel?.kind === 'dot' ? effDot(editSel.slug) : null}
        computed={
          editSel?.kind === 'label'
            ? paramsFromLayout(
                layouts[editSel.slug],
                bySlug[editSel.slug].name,
                (mapData.territories as any)[editSel.slug].label as [number, number]
              )
            : null
        }
        overridden={
          !!editSel &&
          !!(editSel.kind === 'label'
            ? overrides[editSel.slug]
            : editSel.kind === 'dot'
              ? dotOverrides[editSel.slug]
              : decorOverrides[editSel.slug])
        }
        overrides={overrides}
        dotOverrides={dotOverrides}
        decorOverrides={decorOverrides}
        colorDefaults={
          // mirror the CSS defaults for .name / .sea-label / .country-label
          editSel?.kind === 'decor'
            ? DECOR_BY_SLUG[editSel.slug].cls === 'sea-label'
              ? { fill: '#4f6b80', stroke: '#201a12', strokeW: 0 }
              : { fill: '#8a7a5f', stroke: '#201a12', strokeW: 0 }
            : { fill: '#fffdf5', stroke: '#201a12', strokeW: 0.22 }
        }
        onChange={patch =>
          editSel && (editSel.kind === 'decor' ? patchDecor(editSel.slug, patch) : patchLabel(editSel.slug, patch))
        }
        onChangeDot={patch => editSel && patchDot(editSel.slug, patch)}
        onReset={() => {
          if (!editSel) return
          const drop = (o: any) => {
            const { [editSel.slug]: _, ...rest } = o
            return rest
          }
          if (editSel.kind === 'label') setOverrides(drop)
          else if (editSel.kind === 'dot') setDotOverrides(drop)
          else setDecorOverrides(drop)
        }}
        onClearAll={() => {
          setOverrides({})
          setDotOverrides({})
          setDecorOverrides({})
        }}
        onDeselect={() => setEditSel(null)}
      />
    )}
    </>
  )
}

export default MapView
