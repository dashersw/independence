import type { LandingCopy } from '../copy'

type FloorNavProperties = {
  stops: LandingCopy['stops']
  label: string
  activeStop: string
}

export const FloorNav = ({ stops, label, activeStop }: FloorNavProperties) => (
  <nav className="floor-nav" aria-label={label}>
    {stops.map((stop) => (
      <a
        key={stop.id}
        href={`#${stop.id}`}
        data-label={stop.label}
        aria-label={stop.label}
        className={activeStop === stop.id ? 'active' : ''}
      />
    ))}
  </nav>
)
