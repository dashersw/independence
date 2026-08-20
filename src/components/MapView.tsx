import React, { useMemo, useState } from 'react'
import Territory from '../game/territory'
import type { Convoy } from '../game/types'
import { getLang } from '../i18n'
import { contiguousFactionComponents, geographicFactionClusters } from './map-geometry'
// Cropped frame: Balkans to the Caucasus, hiding far-off background lands.
// The camera maths live apart from the view so they can be tested directly.
import { ART_H, ART_W, useMapBaking } from './map/hooks/useMapBaking'
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
  activeTarget: string | null
  fortifyTarget: string | null
  /** troops mid-crossing, drawn in open water on their lane */
  convoys: Convoy[]
  round: number
  onTerritoryClick: (slug: string) => void
  onReady?: () => void
}

const MapView = ({
  territories,
  selected,
  targets,
  activeTarget,
  fortifyTarget,
  convoys,
  round,
  onTerritoryClick,
  onReady,
}: MapViewProps) => {
  // hover tracked in state (not CSS :hover) so the badge/label layer above the
  // hit layer also lights up its territory
  const [hovered, setHovered] = useState<string | null>(null)
  const { svgRef, artStackRef, aspectRef, viewRef, viewBox, dotScale } = useMapCamera()
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

  const { deskUrl, artCanvasRef, revealCanvasRef } = useMapBaking({
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
      {/* the baked map bitmap lives on real canvases UNDER the svg — no PNG
        round-trip, and the compositor moves them via one CSS transform that
        useMapCamera keeps in lockstep with the viewBox */}
      {!editMode && (
        <div className="map-underlay">
          <div className="map-art-stack" ref={artStackRef}>
            <canvas ref={artCanvasRef} className="map-art" width={ART_W} height={ART_H} />
            <canvas ref={revealCanvasRef} className="map-reveal" width={0} height={0} />
          </div>
        </div>
      )}
      <svg ref={svgRef} className="map" viewBox={viewBox} preserveAspectRatio="xMidYMid slice">
        <FlagDefs />
        <PaintDefs />
        <clipPath id="map-frame">
          <rect x={30} y={0} width={1500} height={820} />
        </clipPath>
        <clipPath id="desk-hole">
          <path d="M-400 -300 h2360 v1420 h-2360 Z M30 0 h1500 v820 h-1500 Z" clipRule="evenodd" fillRule="evenodd" />
        </clipPath>
        {/* dark parchment-desk surround fills the viewport outside the map
          frame; in play it leaves a hole at the frame so the art canvases
          below show through */}
        {editMode ? (
          <rect x={-4000} y={-4000} width={9500} height={9000} fill="#2e2419" />
        ) : (
          <path d="M-4000 -4000 h9500 v9000 h-9500 Z M30 0 h1500 v820 h-1500 Z" fillRule="evenodd" fill="#2e2419" />
        )}
        {/* pre-textured desk (grain/blotch baked over the flat color) */}
        {!editMode && deskUrl && (
          <image
            x={-400}
            y={-300}
            width={2360}
            height={1420}
            href={deskUrl}
            preserveAspectRatio="none"
            clipPath="url(#desk-hole)"
            pointerEvents="none"
          />
        )}
        <g clipPath="url(#map-frame)">
          {/* edit mode keeps the fully live painted stack inside the svg */}
          {editMode && <MapArt bySlug={bySlug} flagClusters={flagClusters} components={components} decor={false} />}
          <TerritoryHitLayer
            bySlug={bySlug}
            selected={selected}
            targets={targets}
            activeTarget={activeTarget}
            fortifyTarget={fortifyTarget}
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
        <MapTextureLayer editMode={editMode} />
      </svg>
      <LabelEditContainer bySlug={bySlug} editor={editor} />
    </>
  )
}

export default MapView
