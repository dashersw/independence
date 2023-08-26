import mapData from '../../game/map-data.json'
import Territory from '../../game/territory'
import { t as i18nT, tFaction, tTerritory } from '../../i18n'

interface TerritoryHitLayerProps {
  bySlug: Record<string, Territory>
  selected: string | null
  targets: string[]
  hovered: string | null
  onTerritoryClick: (slug: string) => void
  onHover: (slug: string | null) => void
}

export const TerritoryHitLayer = ({
  bySlug,
  selected,
  targets,
  hovered,
  onTerritoryClick,
  onHover,
}: TerritoryHitLayerProps) => (
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
          onMouseEnter={() => onHover(slug)}
          onMouseLeave={() => onHover(null)}
        >
          {data.paths.map((path, index) => (
            <path key={index} d={path} fill="transparent" />
          ))}
          <title>
            {i18nT('tooltip.territory', {
              name: tTerritory(territory.slug, territory.name),
              faction: tFaction(territory.faction.name),
              troops: territory.troops,
            })}
          </title>
        </g>
      )
    })}
  </g>
)
