import { tDecor } from '../../i18n'
import decorPins from '../decorOverrides.json'
import { arcFromParams, type LabelParams } from '../LabelEditor'
import { DECOR_DEFS } from '../map-art'
import type { MapEditSelection, StartMapEditDrag } from './types'

interface DecorLayerProps {
  editMode: boolean
  overrides: Record<string, LabelParams>
  selected: MapEditSelection | null
  paramsFor: (slug: string) => LabelParams
  onDragStart: StartMapEditDrag
}

export const DecorLayer = ({ editMode, overrides, selected, paramsFor, onDragStart }: DecorLayerProps) => (
  <g className="decor-labels" pointerEvents={editMode ? undefined : 'none'}>
    {DECOR_DEFS.map((def) => {
      const params = paramsFor(def.slug)
      // An arc is rendered whenever one exists for this label — either a live
      // override or a committed pin.
      const edited = !!(overrides[def.slug] || (decorPins as Record<string, LabelParams>)[def.slug])
      const isSelected = editMode && selected?.kind === 'decor' && selected.slug === def.slug
      const grab = editMode ? { cursor: 'grab' as const } : undefined
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
            style={isSelected ? { ...grab, fill: '#ff2fd6' } : grab}
            onPointerDown={editMode ? (event) => onDragStart('decor', def.slug, event) : undefined}
          >
            {tDecor(def.slug, def.text)}
          </text>
        )

      const arc = arcFromParams(params)
      return (
        <g
          key={def.slug}
          style={grab}
          onPointerDown={editMode ? (event) => onDragStart('decor', def.slug, event) : undefined}
        >
          <path
            id={`dp-${def.slug}`}
            d={arc.d}
            fill="none"
            stroke={isSelected ? '#ff2fd6' : editMode ? '#00ff44' : 'none'}
            strokeWidth={isSelected ? 2.5 : editMode ? 2 : 0}
          />
          <text
            className={def.cls}
            fontSize={params.size}
            style={
              params.fill !== undefined || params.stroke !== undefined || params.strokeW !== undefined
                ? {
                    fill: params.fill,
                    stroke: params.stroke,
                    strokeWidth: params.strokeW !== undefined ? `${params.strokeW}em` : undefined,
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
