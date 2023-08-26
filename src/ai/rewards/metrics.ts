import type Game from '../../game/game'
import type Faction from '../../game/faction'
import { NATIONAL_PACT } from '../../game/campaign-data'
import { AIMS, HOME, ULTIMATE } from './objectives'

export interface Snapshot {
  territories: number
  troops: number
  pactHeld: number
  // what ANKARA holds — the coalition is paid for ground prised off Turkey,
  // and Turkey is not the only faction sitting on Pact provinces
  turkeyPact: number
  holds: Record<string, boolean>
  round: number
}

const PACT = new Set(NATIONAL_PACT)

/** Everything a reward function needs to compare one turn against the next. */
export const snapshot = (game: Game, faction: Faction): Snapshot => {
  const holds: Record<string, boolean> = {}
  for (const t of faction.territories) holds[t.slug] = true
  return {
    territories: faction.territories.length,
    // men aboard ship count: a crossing is not a casualty, and a shaper that
    // reads it as one fines a faction for using its own navy
    troops: faction.troopTotal + game.movement.troopsAtSea(faction),
    pactHeld: faction.territories.filter((t) => PACT.has(t.slug)).length,
    turkeyPact: game.pactProgress,
    holds,
    round: game.turn.round,
  }
}

export const heldDelta = (before: Snapshot, after: Snapshot, slugs: string[]) =>
  slugs.reduce((n, slug) => n + ((after.holds[slug] ? 1 : 0) - (before.holds[slug] ? 1 : 0)), 0)

/** How much of its stretch goal a faction holds now, as a fraction. */
export const ultimateHeld = (game: Game, faction: Faction): number => {
  if (faction.name === 'Turkey') return faction.territories.length / game.territories.length
  const goal = ULTIMATE[faction.name] ?? []
  if (!goal.length) return 0
  return goal.filter((slug) => game.bySlug[slug]?.faction === faction).length / goal.length
}

/**
 * What the occupiers share.
 *
 * They are allies, and none of them has to be the one who wins: every province
 * Ankara does not end the war holding is worth something to all of them. Without
 * this only Greece was paid for taking Turkish ground at all — the others were
 * indifferent to it and Bulgaria was actively discouraged — so Turkey could walk
 * over them one at a time while each minded its own corner.
 */
export const coalitionShare = (game: Game) => 1 - game.pactProgress / NATIONAL_PACT.length

/** How much of its own country a faction still holds. */
export const homeHeld = (game: Game, faction: Faction): number => {
  const home = HOME[faction.name] ?? []
  if (!home.length) return 0
  return home.filter((slug) => game.bySlug[slug]?.faction === faction).length / home.length
}

/** How much of its war aim a faction holds right now, as a fraction. */
export const aimHeld = (game: Game, faction: Faction): number => {
  const aim = AIMS[faction.name] ?? []
  if (!aim.length) return 0
  return aim.filter((slug) => game.bySlug[slug]?.faction === faction).length / aim.length
}
