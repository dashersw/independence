import { Interlude } from '../../components/interlude'
import { LanguageToggle } from '../../components/language-toggle'
import { PlayerBar, ScoreFolio, useSoundtrackPlayer } from '../soundtrack'
import { useDocumentMeta, useLandingBodyClass, useLandingCopy, useScrollStage } from './hooks'
import { Board } from './sections/board'
import { Finale } from './sections/finale'
import { FloorNav } from './sections/floor-nav'
import { Hero } from './sections/hero'
import { Opposition } from './sections/opposition'
import { Prologue } from './sections/prologue'
import '../../styles/theme.css'
import './style.css'

export const LandingPage = () => {
  const copy = useLandingCopy()
  const player = useSoundtrackPlayer()
  const { activeStop, pastHero } = useScrollStage()

  useDocumentMeta(copy.document)
  useLandingBodyClass()

  return (
    <main className="landing-page">
      <div className="scroll-pact" aria-hidden="true">
        <i />
      </div>

      <LanguageToggle />

      <Hero copy={copy.hero} />
      <Prologue copy={copy} />
      <Board copy={copy} />
      <Interlude id="history" kicker={copy.rules.kicker} title={copy.rules.title} copy={copy.rules.copy} />
      <Interlude id="cards" kicker={copy.cards.kicker} title={copy.cards.title} copy={copy.cards.copy} />
      <Opposition copy={copy.factions} />

      <Interlude id="soundtrack" kicker={copy.score.kicker} title={copy.score.title} copy={copy.score.copy} />

      <div className="case-shell">
        <ScoreFolio player={player} />
      </div>

      <Finale copy={copy} />

      <FloorNav stops={copy.stops} label={copy.nav.label} activeStop={activeStop} />
      <PlayerBar player={player} visible={player.playing || pastHero} />
      <audio {...player.audioProps} />
    </main>
  )
}
