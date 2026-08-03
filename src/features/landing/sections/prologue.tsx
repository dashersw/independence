import { Interlude } from '../../../components/interlude'
import { Scene, SceneLabel } from '../../../components/scene'
import type { LandingCopy } from '../copy'

const bosphorusImage = new URL('../../../assets/landing-bosphorus.jpg', import.meta.url).href
const deckImage = new URL('../../../assets/landing-deck.jpg', import.meta.url).href

const Route = ({ copy }: { copy: LandingCopy['route'] }) => (
  <ol className="route reveal" aria-label={copy.label}>
    {copy.stops.map((stop) => (
      <li key={stop.place}>
        <span>{stop.date}</span>
        <b>{stop.place}</b>
        <small>{stop.note}</small>
      </li>
    ))}
  </ol>
)

export const Prologue = ({ copy }: { copy: LandingCopy }) => (
  <>
    <Interlude id="story" kicker={copy.story.kicker} title={copy.story.title} copy={copy.story.copy} />

    <Scene variant="scene-sea" label={copy.bosphorus.label} image={bosphorusImage} alt={copy.bosphorus.alt}>
      <SceneLabel dateline={copy.bosphorus.dateline} heading={copy.bosphorus.heading} copy={copy.bosphorus.copy} />
    </Scene>

    <Interlude kicker={copy.duty.kicker} title={copy.duty.title} copy={copy.duty.copy} />

    <Scene variant="scene-right scene-sea" label={copy.deck.label} image={deckImage} alt={copy.deck.alt}>
      <SceneLabel dateline={copy.deck.dateline} heading={copy.deck.heading} copy={copy.deck.copy} />
    </Scene>

    <Route copy={copy.route} />
  </>
)
