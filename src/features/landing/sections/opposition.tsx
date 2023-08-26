import { FlagIcon } from '../../../components/map-flags'
import { Interlude } from '../../../components/interlude'
import type { LandingCopy } from '../copy'

export const Opposition = ({ copy }: { copy: LandingCopy['factions'] }) => (
  <>
    <Interlude id="factions" kicker={copy.kicker} title={copy.title} />

    <ul className="faction-wall">
      {copy.items.map((faction) => (
        <li key={faction.key} className="reveal">
          <FlagIcon faction={faction.key} className="faction-flag" />
          <div>
            <b>{faction.name}</b>
            <p>{faction.copy}</p>
          </div>
        </li>
      ))}
    </ul>
  </>
)
