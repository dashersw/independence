import React, { useMemo, useState } from 'react'
import Territory from '../game/territory'
import type { Convoy } from '../game/types'
import { getLang } from '../i18n'
import { contiguousFactionComponents, geographicFactionClusters } from './map-geometry'
// Cropped frame: Balkans to the Caucasus, hiding far-off background lands.
// The camera maths live apart from the view so they can be tested directly.
import { VB } from './viewport'
import { useMapBaking } from './map/hooks/useMapBaking'
import { useMapCamera } from './map/hooks/useMapCamera'
import { useMapLabelEditor } from './map/hooks/useMapLabelEditor'
import { MapArt, PaintDefs } from './map-art'
import { FlagDefs } from './map-flags'
import { ConvoyLayer } from './map/ConvoyLayer'
import { DecorLayer } from './map/DecorLayer'
import { LabelEditContainer } from './map/LabelEditContainer'
import { MapTextureLayer } from './map/MapTextureLayer'
import { TerritoryHitLayer } from './map/TerritoryHitLayer'
import { TerritoryLabelLayer } from './map/TerritoryLabelLayer'

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
  const { svgRef, aspectRef, viewRef, viewBox, dotScale } = useMapCamera()
  const bySlug = Object.fromEntries(territories.map((t) => [t.slug, t]))
  // re-read every render — App re-renders the whole tree on a language switch
  const lang = getLang()
  // ownership only changes on conquest — key the cluster computations and the
  // art bake on it instead of recomputing every render
  const ownershipKey = territories.map((t) => t.faction.name).join('|')
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const components = useMemo(() => contiguousFactionComponents(territories), [ownershipKey])
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const flagClusters = useMemo(() => geographicFactionClusters(territories), [ownershipKey])
  const editor = useMapLabelEditor({ territories, lang, bySlug, svgRef, viewRef, aspectRef })
  const { layouts, editMode, overrides, decorOverrides, selected: editSelection, dotFor, decorFor, startDrag } = editor

  const { artUrl, reveal, revealCircleRef, grainUrl, blotchUrl } = useMapBaking({
    territories,
    bySlug,
    flagClusters,
    ownershipKey,
    editMode,
    lang,
    dotFor,
    onReady,
  })

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
          {reveal && (
            <circle ref={revealCircleRef} cx={reveal.origin[0]} cy={reveal.origin[1]} r={0} fill="url(#reveal-grad)" />
          )}
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
          <TerritoryHitLayer
            bySlug={bySlug}
            selected={selected}
            targets={targets}
            hovered={hovered}
            onTerritoryClick={onTerritoryClick}
            onHover={setHovered}
          />
          <TerritoryLabelLayer
            bySlug={bySlug}
            layouts={layouts}
            overrides={overrides}
            editMode={editMode}
            selected={editSelection}
            dotScale={dotScale}
            dotFor={dotFor}
            onTerritoryClick={onTerritoryClick}
            onHover={setHovered}
            onDragStart={startDrag}
          />
          <ConvoyLayer convoys={convoys} round={round} dotScale={dotScale} bySlug={bySlug} />
          {editMode && (
            <DecorLayer
              editMode={editMode}
              overrides={decorOverrides}
              selected={editSelection}
              paramsFor={decorFor}
              onDragStart={startDrag}
            />
          )}
        </g>
        <MapTextureLayer editMode={editMode} grainUrl={grainUrl} blotchUrl={blotchUrl} />
      </svg>
      <LabelEditContainer bySlug={bySlug} editor={editor} />
    </>
  )
}

export default MapView
