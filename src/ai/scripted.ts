// A hand-written, aggressive player — no network, no search.
//
// It exists for two jobs. In eval-ai it plays Turkey as a competent-human proxy,
// so the scorecard measures the trained occupiers against real play rather than
// against the passive value net. In training it is a fixed STRONG opponent on
// either side of the war: self-play alone co-adapts the seven nets against their
// own weak selves and the whole set drifts to a passive equilibrium a human
// walks through — anchoring some games to a scripted aggressor is what makes the
// learning nets face good play, from both sides, and stops that collapse.
//
// The heuristics are faction-agnostic: hold the most-outgunned border first,
// then mass; attack every engagement you outnumber, the provinces of your own
// war AIM first; march the rear guard forward. For Turkey the aim is the whole
// Misak-ı Millî; for an occupier it is the ground it was sent to take.

import Game from '../game/game'
import Faction from '../game/faction'
import Territory from '../game/territory'
import { attackMoves, fortifyMoves, REINFORCE_BATCH } from './policy'
import { AIMS } from './rewards'
import type { Move } from './features'

const isFortify = (m: Move): m is Move & { from: Territory; to: Territory } =>
  m.kind === 'fortify' && !!m.from && !!m.to
const isAttack = (m: Move): m is Move & { from: Territory; to: Territory } => m.kind === 'attack' && !!m.from && !!m.to
const enemyNeighbours = (faction: Faction, t: Territory) => t.adjacent.filter((to) => to.faction !== faction)
const enemyEdge = (faction: Faction, t: Territory) => enemyNeighbours(faction, t).length > 0
const threat = (faction: Faction, t: Territory) =>
  enemyNeighbours(faction, t).reduce((max, to) => Math.max(max, to.troops), 0)

/**
 * Hold the line, then mass for the push. Each batch shores up the border most
 * outgunned by its neighbours (threat − own troops); once nothing is
 * outnumbered, the surplus stacks on a front that borders un-taken AIM ground,
 * so defence comes first and offence is paid for out of what is left.
 */
const scriptedReinforce = (game: Game, faction: Faction, aim: Set<string>) => {
  const bordersAim = (t: Territory) => enemyNeighbours(faction, t).some((to) => aim.has(to.slug))
  let guard = 0
  while (game.turn.phase === 'reinforce' && game.turn.reinforcementsLeft > 0 && guard++ < 500) {
    while (game.findTradeSet(faction.hand)) game.tradeCards(faction)
    const front = faction.territories.filter((t) => enemyEdge(faction, t))
    const pool = (front.length ? front : faction.territories).slice()
    if (!pool.length) break
    const deficit = (t: Territory) => threat(faction, t) + 1 - t.troops
    const underDefended = pool.filter((t) => deficit(t) > 0)
    const target = underDefended.length
      ? underDefended.sort((a, b) => deficit(b) - deficit(a))[0]
      : pool.sort((a, b) => Number(bordersAim(b)) - Number(bordersAim(a)) || b.troops - a.troops)[0]
    for (let i = 0; i < REINFORCE_BATCH && game.turn.reinforcementsLeft > 0; i++)
      game.turn.placeReinforcements(target.slug)
  }
  if (game.turn.phase === 'reinforce') game.turn.advancePhase()
}

/** Attack every engagement it outnumbers, AIM provinces first, biggest margin first — pressing as the UI does. */
const scriptedAttack = (game: Game, faction: Faction, aim: Set<string>) => {
  const attempted = new Set<string>()
  let guard = 0
  while (game.turn.phase === 'attack' && guard++ < 200) {
    const move = attackMoves(game, faction, attempted)
      .filter(isAttack)
      .filter((m) => m.from.troops > m.to.troops)
      .sort(
        (a, b) =>
          Number(aim.has(b.to.slug)) - Number(aim.has(a.to.slug)) ||
          b.from.troops - b.to.troops - (a.from.troops - a.to.troops),
      )[0]
    if (!move) break
    attempted.add(`${move.from.slug}>${move.to.slug}`)
    if (!game.combat.begin(move.from.slug, move.to.slug)) continue
    let rounds = 0
    while (rounds++ < 60) {
      const step = game.combat.step(move.from.slug, move.to.slug)
      if (!step || !step.pending) break
      if (!game.combat.worthPressing(move.from, move.to)) {
        game.combat.pullBack()
        break
      }
    }
    if (game.combat.pendingAdvance) game.combat.advance(game.combat.pendingAdvance.max)
    if (game.turn.isGameOver) return
  }
  if (game.turn.phase === 'attack') game.turn.advancePhase()
}

/** March the rear guard up: from a province with no enemy border into one that has, most men first. */
const scriptedFortify = (game: Game, faction: Faction) => {
  if (game.turn.phase !== 'fortify') return
  const forward = fortifyMoves(game, faction)
    .filter(isFortify)
    .filter((m) => !enemyEdge(faction, m.from) && enemyEdge(faction, m.to))
    .sort((a, b) => b.from.troops - a.from.troops)[0]
  if (forward) game.movement.fortify(forward.from.slug, forward.to.slug, Math.max(1, forward.from.troops - 1))
  if (game.turn.phase === 'fortify') game.turn.advancePhase()
}

/** Play the current faction's whole turn by the scripted heuristics. */
export const scriptedTurn = (game: Game, faction: Faction = game.turn.currentPlayer.faction) => {
  const aim = new Set(AIMS[faction.name] ?? [])
  scriptedReinforce(game, faction, aim)
  scriptedAttack(game, faction, aim)
  scriptedFortify(game, faction)
}

/**
 * The scripted answer to a campaign decision. Turkey mobilises (requisition) and,
 * by default, secures the Pact and SIGNS at Lausanne — "fight on" (reject) invites
 * the coalition's amphibious landings every round and buries it. `fightOn` picks
 * the other line. Returns undefined when it has no opinion, so the caller falls
 * back to the net.
 */
export const scriptedDecisionKey = (keys: string[], fightOn = false): string | undefined => {
  if (keys.includes('requisition')) return 'requisition'
  if (keys.includes('accept') || keys.includes('reject')) return fightOn ? 'reject' : 'accept'
  return undefined
}
