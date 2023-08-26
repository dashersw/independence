import React from 'react'
import { FLAG_STYLES } from './map-flags'
import mapData from '../game/map-data.json'
import Territory from '../game/territory'
import type { LabelLayout } from './labelLayout'
import { arcFromParams, type LabelParams } from './LabelEditor'
import decorPins from './decorOverrides.json'
import { tDecor } from '../i18n'
import { factionBlobOutline, factionBlobShadowRings, type FactionComponent } from './map-geometry'

// Static path collections for the decorative (non-interactive) paint layers.
const TERRITORY_PATHS: string[] = Object.values(mapData.territories).flatMap((t) => t.paths)
const LAND_PATHS: string[] = [...mapData.background, ...TERRITORY_PATHS]

// National borders are drawn from each faction blob's TRUE outline: the
// member territories' flattened polygons (baked by the generator) are merged
// with a morphological closing — dilate, union, erode — which bridges the
// whiteborder source's inset gaps between adjacent shapes, then the resulting
// outline is stroked and clipped to itself for a constant-width inner band.
// Per-territory strokes can't do this: every same-faction seam sits across a
// few-unit gap that no local mask can bridge cleanly.

// Painterly filter/gradient defs — static, defined once.
export const PaintDefs = () => (
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

export const TerritoryInkLayer = (
  <>
    {/* wide, faint haze under the region borders — reads as depth, not as a line */}
    <g filter="url(#border-haze)" pointerEvents="none">
      {TERRITORY_PATHS.map((d, i) => (
        <path
          key={`h${i}`}
          d={d}
          fill="none"
          stroke="#4a3a28"
          strokeWidth={26}
          strokeOpacity={0.1}
          strokeLinejoin="round"
        />
      ))}
    </g>
    <g filter="url(#border-bleed)" pointerEvents="none">
      {TERRITORY_PATHS.map((d, i) => (
        <path
          key={`w${i}`}
          d={d}
          fill="none"
          stroke="#4a3a28"
          strokeWidth={5}
          strokeOpacity={0.3}
          strokeLinejoin="round"
        />
      ))}
      {TERRITORY_PATHS.map((d, i) => (
        <path
          key={`c${i}`}
          d={d}
          fill="none"
          stroke="#33291b"
          strokeWidth={1.2}
          strokeOpacity={0.5}
          strokeLinejoin="round"
        />
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
export const DECOR_DEFS: DecorDef[] = [
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
  { slug: 'azerbaijan', text: 'Azerbaijan', cls: 'country-label', x: 1440, y: 260, size: 16 },
]
export const DECOR_BY_SLUG = Object.fromEntries(DECOR_DEFS.map((d) => [d.slug, d]))
// starting arc params for a decor label that has never been edited: same
// anchor, its static rotation as the chord angle, a chord roughly as long as
// the tracked text, no bow
export const decorDefaults = (def: DecorDef): LabelParams => ({
  x: def.x,
  y: def.y,
  ang: def.rotate ?? 0,
  len: Math.round(def.text.length * def.size * 1.05),
  size: def.size,
  bow: 0,
})

// Set to true to re-enable the inner shadows along national borders.
const SHOW_FACTION_BORDER_SHADOWS = false

// ---- baked static art ----
// WebKit rasterizes SVG filters on the CPU and re-runs the whole chain every
// time the viewBox changes, which made pan/zoom crawl on Safari. The painted
// stack only changes on conquest, so it is rendered ONCE into an offscreen
// bitmap and the live SVG shows a single <image>; the filters never run
// during gestures. Edit mode (?labelEdit) keeps the fully live tree.
export const ART_SCALE = 2.5 // bitmap px per map unit for the map art
export const OVERLAY_SCALE = 1.5 // grain/blotch overlays — noise needs less
// The baked SVG is a standalone document that cannot see external
// stylesheets — keep these in sync with .map rules in game.css / map.css.
export const ART_CSS = `
.bg-land { fill: #e7dcc1; stroke: #bcae8e; stroke-width: 0.7; }
.sea-label { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; font-style: italic; fill: #4f6b80; letter-spacing: 0.38em; opacity: 0.8; }
.country-label { font-family: 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif; fill: #8a7a5f; letter-spacing: 0.3em; text-transform: uppercase; opacity: 0.85; }
`

// rasterize an SVG document string into a fixed-resolution bitmap object URL
export const bakeSvg = (markup: string, width: number, height: number, cb: (url: string) => void) => {
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
    canvas.toBlob((b) => b && cb(URL.createObjectURL(b)))
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
export const TerritoryName = ({
  slug,
  text,
  layout,
  at,
  editMode = false,
  isEditSel = false,
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
                strokeWidth: layout.strokeW !== undefined ? `${layout.strokeW}em` : undefined,
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
export const StaticDecor = () => (
  <g className="decor-labels" pointerEvents="none">
    {DECOR_DEFS.map((def) => {
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
                    paintOrder: 'stroke',
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

// ---- painted-stack pieces ----
// Split so conquest re-bakes ONLY what it changes (flags, region shades,
// bands, border shadows — cheap geometry plus one color matrix) while the
// heavyweight blur/turbulence layers bake once at load. Cross-piece blending
// (multiply) happens in CANVAS composite ops during assembly, which is also
// engine-consistent — Safari's SVG-image blend support is unreliable.

export const ArtBase = () => (
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
          strokeOpacity={0.1}
          strokeLinejoin="round"
        />
      ))}
    </g>
  </>
)

export const ArtFlags = ({
  bySlug,
  flagClusters,
}: {
  bySlug: Record<string, Territory>
  flagClusters: FactionComponent[]
}) => (
  <g className="flag-layer" filter="url(#flag-tone)" pointerEvents="none">
    {/* base coats hide antialiasing seams at the clip edges */}
    {Object.entries(mapData.territories).map(([slug, data]) =>
      data.paths.map((d, i) => <path key={`${slug}-${i}`} d={d} fill={FLAG_STYLES[bySlug[slug].faction.name].fill} />),
    )}
    {/* one glorious flag per geometric blob, cover-scaled and clipped to it */}
    {flagClusters.map((component, index) => {
      const box = component.slugs.reduce(
        (acc, slug) => {
          const b = (mapData.territories as any)[slug].bbox as number[]
          return [Math.min(acc[0], b[0]), Math.min(acc[1], b[1]), Math.max(acc[2], b[2]), Math.max(acc[3], b[3])]
        },
        [Infinity, Infinity, -Infinity, -Infinity],
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
            {component.slugs.flatMap((slug) =>
              (mapData.territories as any)[slug].paths.map((d: string, i: number) => (
                <path key={`${slug}-${i}`} d={d} />
              )),
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
export const ArtRegionShade = ({ bySlug, blend }: { bySlug: Record<string, Territory>; blend: boolean }) => (
  <g className="region-shade-layer" style={blend ? { mixBlendMode: 'multiply' } : undefined} pointerEvents="none">
    {Object.entries(mapData.territories).map(([slug, data]) =>
      (data as any).paths.map((d: string, i: number) => (
        <path key={`${slug}-${i}`} d={d} fill="#000" filter={`url(#region-shade-${bySlug[slug].faction.name})`} />
      )),
    )}
  </g>
)

export const ArtBands = ({ flagClusters }: { flagClusters: FactionComponent[] }) => (
  <g className="faction-line-layer" pointerEvents="none">
    {flagClusters.map((cluster) => {
      const d = factionBlobOutline(cluster.slugs)
      const key = cluster.slugs.slice().sort().join('-')
      return (
        <g key={key}>
          <clipPath id={`blob-clip-${key}`} clipRule="nonzero">
            {cluster.slugs.flatMap((slug) =>
              ((mapData.territories as any)[slug].paths as string[]).map((pd, i) => (
                <path key={`${slug}-${i}`} d={pd} />
              )),
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

export const ArtBandShadows = ({ flagClusters, blend }: { flagClusters: FactionComponent[]; blend: boolean }) => (
  <g pointerEvents="none" style={blend ? { mixBlendMode: 'multiply' } : undefined}>
    {flagClusters.map((cluster) => {
      const key = cluster.slugs.slice().sort().join('-')
      return (
        <g key={key}>
          <clipPath id={`blobsh-clip-${key}`} clipRule="nonzero">
            {cluster.slugs.flatMap((slug) =>
              ((mapData.territories as any)[slug].paths as string[]).map((pd, i) => (
                <path key={`${slug}-${i}`} d={pd} />
              )),
            )}
          </clipPath>
          <g
            clipPath={`url(#blobsh-clip-${key})`}
            fill={FLAG_STYLES[cluster.faction].border ?? FLAG_STYLES[cluster.faction].stroke}
          >
            {factionBlobShadowRings(cluster.slugs).map((rd, i, arr) => (
              <path key={i} d={rd} fillRule="evenodd" fillOpacity={0.4 * (1 - (i + 0.5) / arr.length)} />
            ))}
          </g>
        </g>
      )
    })}
  </g>
)

export const ArtCoastShade = ({ blend }: { blend: boolean }) => (
  <g filter="url(#coast-shade)" style={blend ? { mixBlendMode: 'multiply' } : undefined} pointerEvents="none">
    {LAND_PATHS.map((d, i) => (
      <path key={i} d={d} fill="#000" />
    ))}
  </g>
)

// The full painted stack, assembled live — used in edit mode and as the
// pre-first-bake fallback. In play the compositor assembles the same pieces
// on a canvas instead (see the bake effect).
export const MapArt = ({
  bySlug,
  flagClusters,
  components,
  decor,
}: {
  bySlug: Record<string, Territory>
  flagClusters: FactionComponent[]
  components: FactionComponent[]
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
            {component.slugs.flatMap((slug) =>
              (mapData.territories as any)[slug].paths.map((d: string, i: number) => (
                <path key={`${slug}-${i}`} d={d} fill="#000" stroke="#000" strokeWidth={3.5} strokeLinejoin="round" />
              )),
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
