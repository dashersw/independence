import { SEA_LANES } from '../../game/movement'
import Territory from '../../game/territory'
import type { Convoy } from '../../game/types'
import { t as i18nT, tFaction, tTerritory } from '../../i18n'
import { FLAG_STYLES, SHIP } from '../map-flags'

interface ConvoyLayerProps {
  convoys: Convoy[]
  round: number
  dotScale: number
  bySlug: Record<string, Territory>
}

interface ConvoyMarkerProps {
  convoy: Convoy
  berth: number
  round: number
  dotScale: number
  destination: Territory
}

export const ConvoyMarker = ({ convoy, berth, round, dotScale, destination }: ConvoyMarkerProps) => {
  const lane = SEA_LANES.find(
    (candidate) => candidate.ports.includes(convoy.from) && candidate.ports.includes(convoy.to),
  )
  if (!lane) return null
  const [x, y] = [lane.at[0], lane.at[1] + berth * 42]
  const style = FLAG_STYLES[convoy.faction]
  const away = Math.max(0, convoy.arrives - round)

  return (
    <g
      className="convoy"
      transform={`translate(${x} ${y}) scale(${dotScale}) translate(${-x} ${-y})`}
      pointerEvents="none"
    >
      <title>
        {i18nT(away === 1 ? 'tooltip.convoyLast' : 'tooltip.convoy', {
          faction: tFaction(convoy.faction),
          troops: convoy.troops,
          to: tTerritory(convoy.to, destination.name),
          rounds: away,
        })}
      </title>
      <circle cx={x} cy={y} r={13} fill="#fffdf5" stroke={style.stroke} strokeWidth={2.5} />
      <text x={x} y={y + 4} className="troops" textAnchor="middle">
        {convoy.troops}
      </text>
      <path className="convoy-ship" transform={`translate(${x - 21} ${y - 1}) scale(0.6)`} d={SHIP} />
      <text x={x} y={y + 24} className="convoy-eta" textAnchor="middle">
        {'•'.repeat(away)}
      </text>
    </g>
  )
}

export const ConvoyLayer = ({ convoys, round, dotScale, bySlug }: ConvoyLayerProps) => (
  <>
    {convoys.map((convoy, index) => (
      <ConvoyMarker
        key={`convoy-${index}`}
        convoy={convoy}
        berth={
          convoys.slice(0, index).filter((candidate) => candidate.from === convoy.from || candidate.to === convoy.from)
            .length
        }
        round={round}
        dotScale={dotScale}
        destination={bySlug[convoy.to]}
      />
    ))}
  </>
)
