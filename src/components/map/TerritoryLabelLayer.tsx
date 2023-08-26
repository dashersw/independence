import mapData from '../../game/map-data.json'
import Territory from '../../game/territory'
import { tTerritory } from '../../i18n'
import { arcFromParams, type DotParams, type LabelParams } from '../LabelEditor'
import type { LabelLayout } from '../labelLayout'
import { TerritoryName } from '../map-art'
import { FLAG_STYLES, unitGlyphs } from '../map-flags'
import type { MapEditSelection, StartMapEditDrag } from './types'

interface TerritoryLabelLayerProps {
  bySlug: Record<string, Territory>
  layouts: Record<string, LabelLayout>
  overrides: Record<string, LabelParams>
  editMode: boolean
  selected: MapEditSelection | null
  dotScale: number
  dotFor: (slug: string) => DotParams
  onTerritoryClick: (slug: string) => void
  onHover: (slug: string | null) => void
  onDragStart: StartMapEditDrag
}

export const TerritoryLabelLayer = ({
  bySlug,
  layouts,
  overrides,
  editMode,
  selected,
  dotScale,
  dotFor,
  onTerritoryClick,
  onHover,
  onDragStart,
}: TerritoryLabelLayerProps) => (
  <>
    {Object.entries(mapData.territories).map(([slug, data]) => {
      const territory = bySlug[slug]
      const [x, y] = data.label
      const style = FLAG_STYLES[territory.faction.name]
      const override = editMode ? overrides[slug] : undefined
      const layout = override ? arcFromParams(override) : layouts[slug]
      const isLabelSelected = editMode && selected?.kind === 'label' && selected.slug === slug
      const dot = dotFor(slug)
      const isDotSelected = editMode && selected?.kind === 'dot' && selected.slug === slug
      return (
        <g
          key={`label-${slug}`}
          className="territory-label"
          style={editMode ? { cursor: 'grab' } : undefined}
          onClick={editMode ? undefined : () => onTerritoryClick(slug)}
          onPointerDown={editMode ? (event) => onDragStart('label', slug, event) : undefined}
          onMouseEnter={() => onHover(slug)}
          onMouseLeave={() => onHover(null)}
        >
          <TerritoryName
            slug={slug}
            text={tTerritory(territory.slug, territory.name)}
            layout={layout}
            at={[x, y]}
            editMode={editMode}
            isEditSel={isLabelSelected}
          />
          <g
            className="army-dot"
            transform={`translate(${dot.x} ${dot.y}) scale(${dotScale}) translate(${-dot.x} ${-dot.y})`}
            onPointerDown={editMode ? (event) => onDragStart('dot', slug, event) : undefined}
          >
            <circle
              cx={dot.x}
              cy={dot.y}
              r={11.5}
              fill="#fffdf5"
              stroke={isDotSelected ? '#ff2fd6' : style.stroke}
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
  </>
)
