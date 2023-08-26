import type Game from './game'
import { NATIONAL_PACT } from './campaign-data'
import { tDateLoc, tList, tTerritory } from '../i18n'

export interface GameOutcome {
  titleKey: string
  bodyKey: string
  vars: Record<string, string | number>
}

/** Builds localized ending presentation from the final domain state. */
export const gameOutcome = (game: Game): GameOutcome | null => {
  if (game.turn.phase !== 'gameover') return null
  const turkey = game.humanPlayer.faction
  const date = tDateLoc(game.dateAt(game.endedRound || game.turn.round))
  if (game.winner && game.totalConquest)
    return { titleKey: 'overlay.total.title', bodyKey: 'overlay.total.body', vars: { date } }
  if (game.winner) {
    const beyond = turkey.territories.filter((territory) => !NATIONAL_PACT.includes(territory.slug))
    if (beyond.length)
      return {
        titleKey: 'overlay.beyond.title',
        bodyKey: 'overlay.beyond.body',
        vars: { date, named: tList(beyond.map((territory) => tTerritory(territory.slug, territory.name))) },
      }
    return { titleKey: 'overlay.victory.title', bodyKey: 'overlay.victory.body', vars: { date } }
  }
  if (turkey.eliminated) return { titleKey: 'overlay.defeat.title', bodyKey: 'overlay.defeat.body', vars: { date } }
  const held = game.pactProgress
  const missing = NATIONAL_PACT.filter((slug) => game.bySlug[slug].faction !== turkey)
  const named = missing
    .slice(0, 3)
    .map((slug) => tTerritory(slug, game.bySlug[slug].name))
    .join(', ')
  const tier = held >= NATIONAL_PACT.length - 3 ? 'near' : held >= NATIONAL_PACT.length / 2 ? 'partial' : 'poor'
  return {
    titleKey: `overlay.lausanne.${tier}.title`,
    bodyKey: `overlay.lausanne.${tier}.body`,
    vars: { date, held, total: NATIONAL_PACT.length, missing: missing.length, named },
  }
}
