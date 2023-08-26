// Playing a turn with a trained model.
//
// The net scores (position, move) pairs; a turn is then just "enumerate what is
// legal, score it, take the best" — with the option to stop, which is itself a
// scored move, so a faction can decide that attacking again is worth less than
// standing where it is. That is how Italy learns to do nothing.
//
// Every move offered here comes from the engine's own legality checks, so a
// model can never produce an order the rules would refuse.

import Game, { AiMove, AiScorer, AiSelector } from '../game/game'
import Faction from '../game/faction'
import Territory from '../game/territory'
import { Move, features, featuresFrom, stateFeatures } from './features'
import { NetJSON, evaluate, evaluateBatch } from './net'

export type Models = Record<string, NetJSON>

const END: Move = { kind: 'end' }
/** Units placed per scoring pass — see aiBeginTurn for why it is not one. */
export const REINFORCE_BATCH = 3

/** Every reinforcement placement worth considering: one per own province. */
export const reinforceMoves = (faction: Faction): Move[] =>
  faction.territories.map(from => ({ kind: 'reinforce' as const, from }))

/** Every attack the engine would accept, plus the option to stop attacking. */
export const attackMoves = (game: Game, faction: Faction): Move[] => {
  const moves: Move[] = [END]
  for (const from of faction.territories) {
    if (from.troops < 2) continue
    for (const slug of game.attackTargets(from.slug)) moves.push({ kind: 'attack', from, to: game.bySlug[slug] })
  }
  return moves
}

/**
 * Every legal troop move along the faction's own lines, plus standing pat — by
 * land, and across whatever sea lanes it has the ports and the fleet for. The
 * crossing is the one move that costs a faction its men for two rounds, which
 * is exactly why it has to be on the same list as marching them next door: the
 * net has to price the two against each other.
 */
export const fortifyMoves = (game: Game, faction: Faction): Move[] => {
  const moves: Move[] = [END]
  for (const from of faction.territories) {
    if (from.troops < 2) continue
    for (const to of from.adjacent) if (to.faction === faction) moves.push({ kind: 'fortify', from, to })
    for (const slug of game.seaTargets(from.slug)) moves.push({ kind: 'sail', from, to: game.bySlug[slug] })
  }
  return moves
}

/**
 * The best of a set of moves according to this faction's model. `explore` is
 * the chance of taking a random one instead, which is how training discovers
 * anything the current weights would never try.
 */
export const chooseMove = (
  game: Game,
  faction: Faction,
  moves: Move[],
  model: NetJSON | undefined,
  explore = 0,
  random: () => number = Math.random
): Move | null => {
  if (!moves.length) return null
  if (!model || (explore > 0 && random() < explore)) return moves[Math.floor(random() * moves.length)]
  // the position is the same for every candidate — read it once
  const before = stateFeatures(game, faction)
  let best = moves[0]
  let bestScore = -Infinity
  for (const move of moves) {
    const score = evaluate(model, featuresFrom(before, game, faction, move))
    if (score > bestScore) {
      bestScore = score
      best = move
    }
  }
  return best
}

/** How much of a garrison this faction is willing to send forward on a fortify. */
const moveAmount = (game: Game, from: Territory) => {
  const spare = from.troops - 1
  return Math.max(1, Math.floor(spare / 2))
}

/**
 * Play one faction's whole turn through the model. Returns how many attacks it
 * chose to make, which the trainer logs and the live game does not care about.
 */
export const playTurn = (
  game: Game,
  model: NetJSON | undefined,
  opts: { explore?: number; random?: () => number; maxAttacks?: number } = {}
): number => {
  const faction = game.currentPlayer.faction
  const explore = opts.explore ?? 0
  const random = opts.random ?? Math.random
  const maxAttacks = opts.maxAttacks ?? 12

  // reinforce in small batches rather than one unit at a time: adding a single
  // unit barely changes the board, and scoring is the expensive part
  let guard = 0
  while (game.phase === 'reinforce' && game.reinforcementsLeft > 0 && guard++ < 500) {
    while (game.findTradeSet(faction.hand)) game.tradeCards(faction)
    const move = chooseMove(game, faction, reinforceMoves(faction), model, explore, random)
    if (!move?.from) break
    for (let i = 0; i < REINFORCE_BATCH && game.reinforcementsLeft > 0; i++)
      game.placeReinforcement(move.from.slug)
  }
  if (game.phase === 'reinforce') game.endPhase()

  let attacks = 0
  while (game.phase === 'attack' && attacks < maxAttacks) {
    const move = model
      ? chooseTwoPly(
          game,
          faction,
          attackMoves(game, faction),
          set => {
            const before = stateFeatures(game, faction)
            return evaluateBatch(
              model,
              set.map(m => featuresFrom(before, game, faction, m))
            )
          },
          m => hypothetically(faction, m)
        )
      : chooseMove(game, faction, attackMoves(game, faction), model, explore, random)
    if (!move || move.kind === 'end' || !move.from || !move.to) break
    if (!game.beginAttack(move.from.slug, move.to.slug)) break
    attacks++
    // press the battle while the engine still rates it worth pressing — the
    // decision to START the fight is the model's, the grind is arithmetic
    let rounds = 0
    while (rounds++ < 60) {
      const step = game.attackRound(move.from.slug, move.to.slug)
      if (!step || !step.pending) break
      if (!game.worthPressing(move.from, move.to)) {
        game.pullBack()
        break
      }
    }
    if (game.pendingAdvance) game.advance(game.pendingAdvance.max)
    if (game.phase === 'gameover') return attacks
  }
  if (game.phase === 'attack') game.endPhase()

  if (game.phase === 'fortify') {
    const move = chooseMove(game, faction, fortifyMoves(game, faction), model, explore, random)
    if (move?.from && move.to) {
      if (move.kind === 'fortify') game.fortify(move.from.slug, move.to.slug, moveAmount(game, move.from))
      else if (move.kind === 'sail') game.embark(move.from.slug, move.to.slug, moveAmount(game, move.from))
    }
    if (game.phase === 'fortify') game.endPhase()
  }
  return attacks
}

/**
 * The scorer the engine asks. Hand it the trained models and every AI faction
 * plays from its own; a faction with no model scores flat, which leaves the
 * engine's own heuristics to break the tie — so a half-trained set still plays.
 */
export const makeScorer = (models: Models): AiScorer => (game, faction, move) => {
  const model = models[faction.name]
  if (!model) return 0
  return evaluate(model, features(game, faction, move as Move))
}

/**
 * Two-ply choice: score every candidate, then look past the best few to see
 * what they would let you do NEXT.
 *
 * One ply answers "is this move good"; two answers "does this move open
 * something". Taking a province to reach the one behind it, or reinforcing the
 * border that makes an attack possible, are turns a one-ply player cannot plan.
 *
 * The full second ply is candidates squared, which is unaffordable — so only
 * the shortlist is expanded, and only against attacks, which are the follow-ups
 * that actually change anything. That keeps it at roughly twice the cost of one
 * ply rather than forty times.
 */
export const chooseTwoPly = (
  game: Game,
  faction: Faction,
  moves: Move[],
  // a whole shortlist at once: both plies score a set of candidates off one
  // reading of the board, which is exactly what batches on the network side —
  // see Net.runBatch. A single-move scorer would defeat that, so the contract
  // is the batch.
  scoreMany: (moves: Move[]) => number[],
  apply: (move: Move) => (() => void) | null,
  opts: { beam?: number; followUps?: number; discount?: number } = {}
): Move | null => {
  if (!moves.length) return null
  const search = SEARCH[faction.name] ?? SEARCH.default
  const beam = opts.beam ?? search.beam
  const cap = opts.followUps ?? search.followUps
  const discount = opts.discount ?? 0.7
  const values = scoreMany(moves)
  const scored = moves.map((move, i) => ({ move, value: values[i] })).sort((a, b) => b.value - a.value)
  if (scored.length <= 1) return scored[0]?.move ?? null

  let best = scored[0].move
  let bestValue = -Infinity
  for (const { move, value } of scored.slice(0, beam)) {
    let ahead = 0
    const undo = apply(move)
    if (undo) {
      const followUps = attackMoves(game, faction).slice(0, cap)
      const aheads = scoreMany(followUps)
      for (const v of aheads) if (v > ahead) ahead = v
      undo()
    }
    const total = value + discount * ahead
    if (total > bestValue) {
      bestValue = total
      best = move
    }
  }
  return best
}

/**
 * How far ahead each faction plans.
 *
 * Not the same for everyone, and deliberately so. Turkey fights this war with
 * sixteen provinces under one command; the six against it are separate powers
 * with a handful each, and three of them lose the right to attack at all
 * partway through by treaty. Two-ply search rewards whoever has the most moves
 * to plan with, which is Turkey, so an identical search made an already uneven
 * board worse — 85% of wars won and the occupiers holding one per cent of their
 * own aims.
 *
 * The answer is not to make Turkey play worse. It is to let the weaker side
 * think longer, the way a handicap in engine play gives the weaker side more
 * search rather than giving the stronger one less.
 */
const SEARCH: Record<string, { beam: number; followUps: number }> = {
  Turkey: { beam: 3, followUps: 10 },
  default: { beam: 5, followUps: 16 }
}

/** Scores a whole set of candidates off one reading of the board. */
export const scoreAll = (model: NetJSON, game: Game, faction: Faction, moves: Move[]): number[] => {
  const before = stateFeatures(game, faction)
  return moves.map(move => evaluate(model, featuresFrom(before, game, faction, move)))
}

export type { AiMove }

/**
 * The selector the engine asks: the same two-ply choice the models were trained
 * with, so what ships plays the way what was trained played.
 */
export const makeSelector = (models: Models): AiSelector => (game, faction, moves) => {
  const model = models[faction.name]
  if (!model) return moves[0] ?? null
  const scoreMany = (set: Move[]) => {
    const before = stateFeatures(game, faction)
    return evaluateBatch(
      model,
      set.map(move => featuresFrom(before, game, faction, move))
    )
  }
  return chooseTwoPly(game, faction, moves as Move[], scoreMany, move => hypothetically(faction, move))
}

/** Play an attack on the board and hand back the undo — for the second ply. */
export const hypothetically = (faction: Faction, move: Move): (() => void) | null => {
  if (move.kind !== 'attack' || !move.from || !move.to) return null
  const { from, to } = move
  const survivors = Math.max(1, Math.round((from.troops - 1) * 0.6))
  if (from.troops <= survivors) return null
  const owner = to.faction
  const fromTroops = from.troops
  const toTroops = to.troops
  const index = owner.territories.indexOf(to)
  if (index >= 0) owner.territories.splice(index, 1)
  faction.territories.push(to)
  to.faction = faction
  to.troops = survivors
  from.troops = fromTroops - survivors
  return () => {
    from.troops = fromTroops
    to.troops = toTroops
    to.faction = owner
    faction.territories.pop()
    if (index >= 0) owner.territories.splice(index, 0, to)
  }
}
