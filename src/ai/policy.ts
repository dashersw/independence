// Playing a turn with a trained model.
//
// The net scores (position, move) pairs; a turn is then just "enumerate what is
// legal, score it, take the best" — with the option to stop, which is itself a
// scored move, so a faction can decide that attacking again is worth less than
// standing where it is. That is how Italy learns to do nothing.
//
// Every move offered here comes from the engine's own legality checks, so a
// model can never produce an order the rules would refuse.

import Game from '../game/game'
import Faction from '../game/faction'
import Territory from '../game/territory'
import { NATIONAL_PACT } from '../game/campaign-data'
import type { AiMove, AiScorer, AiSelector } from './types'
import type { HistoricalEvent } from '../game/campaign-runtime'
import { Move, features, featuresFrom, stateFeatures, attackOdds } from './features'
import { NetJSON, evaluate, evaluateBatch } from './net'

const PACT = new Set(NATIONAL_PACT)

export type Models = Record<string, NetJSON>

const END: Move = { kind: 'end' }
const EXPLORATION_END_CHANCE = 0.15
/** Units placed per scoring pass — see aiBeginTurn for why it is not one. */
export const REINFORCE_BATCH = 3

/** Every reinforcement placement worth considering: one per own province. */
export const reinforceMoves = (faction: Faction): Move[] =>
  faction.territories.map((from) => ({ kind: 'reinforce' as const, from }))

/** Every answer to a campaign decision, encoded by position rather than by event-specific names. */
export const decisionMoves = (event: HistoricalEvent): Move[] => {
  const choices = event.choices ?? []
  return choices.map((choice, choiceIndex) => ({
    kind: 'decision',
    choiceKey: choice.key,
    choiceIndex,
    choiceCount: choices.length,
  }))
}

const attackKey = (from: Territory, to: Territory) => `${from.slug}>${to.slug}`

/** Every attack the engine would accept and has not already been tried this turn, plus the option to stop. */
export const attackMoves = (game: Game, faction: Faction, attempted: ReadonlySet<string> = new Set()): Move[] => {
  const moves: Move[] = [END]
  for (const from of faction.territories) {
    if (from.troops < 2) continue
    for (const slug of game.combat.targets(from.slug)) {
      const to = game.bySlug[slug]
      if (!attempted.has(attackKey(from, to))) moves.push({ kind: 'attack', from, to })
    }
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
    for (const slug of game.movement.seaTargets(from.slug)) moves.push({ kind: 'sail', from, to: game.bySlug[slug] })
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
  random: () => number = Math.random,
): Move | null => {
  if (!moves.length) return null
  if (!model || (explore > 0 && random() < explore)) {
    const end = moves.find((move) => move.kind === 'end')
    if (end && random() < EXPLORATION_END_CHANCE) return end
    const active = end ? moves.filter((move) => move !== end) : moves
    return active[Math.floor(random() * active.length)] ?? end ?? null
  }
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
  opts: { explore?: number; random?: () => number; plan?: boolean } = {},
): number => {
  const faction = game.turn.currentPlayer.faction
  const explore = opts.explore ?? 0
  const random = opts.random ?? Math.random

  // plan search plays the whole turn as one searched unit
  if (opts.plan && model && explore === 0) {
    planTurn(game, faction, scoreManyFor(model)(game, faction))
    return 0
  }

  // reinforce in small batches rather than one unit at a time: adding a single
  // unit barely changes the board, and scoring is the expensive part
  let guard = 0
  while (game.turn.phase === 'reinforce' && game.turn.reinforcementsLeft > 0 && guard++ < 500) {
    while (game.findTradeSet(faction.hand)) game.tradeCards(faction)
    const move = chooseMove(game, faction, reinforceMoves(faction), model, explore, random)
    if (!move?.from) break
    for (let i = 0; i < REINFORCE_BATCH && game.turn.reinforcementsLeft > 0; i++)
      game.turn.placeReinforcements(move.from.slug)
  }
  if (game.turn.phase === 'reinforce') game.turn.advancePhase()

  let attacks = 0
  let attackGuard = 0
  const attempted = new Set<string>()
  while (game.turn.phase === 'attack' && attackGuard++ < 200) {
    const move = model
      ? chooseTwoPly(
          game,
          faction,
          attackMoves(game, faction, attempted),
          (set) => {
            const before = stateFeatures(game, faction)
            return evaluateBatch(
              model,
              set.map((m) => featuresFrom(before, game, faction, m)),
            )
          },
          (move) => hypothetically(game, faction, move),
        )
      : chooseMove(game, faction, attackMoves(game, faction, attempted), model, explore, random)
    if (!move || move.kind === 'end' || !move.from || !move.to) break
    if (!game.combat.begin(move.from.slug, move.to.slug)) break
    attempted.add(attackKey(move.from, move.to))
    attacks++
    // press the battle while the engine still rates it worth pressing — the
    // decision to START the fight is the model's, the grind is arithmetic
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
    if (game.turn.isGameOver) return attacks
  }
  if (game.turn.phase === 'attack') game.turn.advancePhase()

  if (game.turn.phase === 'fortify') {
    const move = chooseMove(game, faction, fortifyMoves(game, faction), model, explore, random)
    if (move?.from && move.to) {
      if (move.kind === 'fortify') game.movement.fortify(move.from.slug, move.to.slug, moveAmount(game, move.from))
      else if (move.kind === 'sail') game.movement.embark(move.from.slug, move.to.slug, moveAmount(game, move.from))
    }
    if (game.turn.phase === 'fortify') game.turn.advancePhase()
  }
  return attacks
}

/**
 * The scorer the engine asks. Hand it the trained models and every AI faction
 * plays from its own; a faction with no model scores flat, which leaves the
 * engine's own heuristics to break the tie — so a half-trained set still plays.
 */
export const makeScorer =
  (models: Models): AiScorer =>
  (game, faction, move) => {
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
  opts: { beam?: number; followUps?: number; discount?: number } = {},
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
  default: { beam: 5, followUps: 16 },
}

/** Scores a whole set of candidates off one reading of the board. */
export const scoreAll = (model: NetJSON, game: Game, faction: Faction, moves: Move[]): number[] => {
  const before = stateFeatures(game, faction)
  return moves.map((move) => evaluate(model, featuresFrom(before, game, faction, move)))
}

export type { AiMove }

/**
 * The selector the engine asks: the same two-ply choice the models were trained
 * with, so what ships plays the way what was trained played.
 */
export const makeSelector =
  (models: Models): AiSelector =>
  (game, faction, moves) => {
    const model = models[faction.name]
    if (!model) return moves[0] ?? null
    const scoreMany = (set: Move[]) => {
      const before = stateFeatures(game, faction)
      return evaluateBatch(
        model,
        set.map((move) => featuresFrom(before, game, faction, move)),
      )
    }
    return chooseTwoPly(game, faction, moves as Move[], scoreMany, (move) => hypothetically(game, faction, move))
  }

/** Play an attack on the board and hand back the undo — for the second ply. */
export const hypothetically = (game: Game, faction: Faction, move: Move): (() => void) | null => {
  if (move.kind !== 'attack' || !move.from || !move.to) return null
  const { from, to } = move
  const survivors = Math.max(1, Math.round((from.troops - 1) * 0.6))
  if (from.troops <= survivors) return null
  const boardSnapshot = game.board.snapshot()
  const turnSnapshot = game.turn.snapshot()
  if (!game.turn.useAttack(from.slug, to.slug)) return null
  game.turn.recordConquest(from.slug, to.slug)
  game.board.changeControl(to, faction, game.turn.round)
  to.troops = survivors
  from.troops -= survivors
  return () => {
    game.board.restore(boardSnapshot)
    game.turn.configure({
      attacks: turnSnapshot.attacks,
      conqueredTerritory: turnSnapshot.conqueredTerritory,
    })
  }
}

// ── Turn-level plan search ───────────────────────────────────────────────────
//
// The player above chooses each reinforcement, each attack and each fortify on
// its own. It cannot reason "stack this province for the sake of the attack the
// stack makes possible, and throw the whole turn's assault at one front to break
// it" — which is most of what a human does. The scripted experiment showed
// reinforcement allocation alone swings Turkey from a fifth of the Pact to two
// thirds; concentration of the attack is the other half.
//
// So the turn is searched as a unit. Each candidate is a way to spend the levy
// (a reinforcement PLAN) paired with a front to commit the attack to (an AXIS).
// The men are dropped on a throwaway copy of the board, the attack phase rolled
// forward deterministically along that axis, and the position the turn would
// leave is read through the net's own value of standing pat there. The turn is
// then played the way that leaves the best position. Threat already lives in the
// state vector (atRisk, enemyBorder), so a plan that leaves the line exposed
// marks itself down: defence, concentration and offence fall out of one number.
//
// It is written against a SCORE closure — a batch scorer over the current board —
// rather than a concrete net, so the shipped models (evaluateBatch over JSON) and
// the live training nets (Net.runBatch) drive exactly the same search.

/** A batch scorer over the CURRENT board, from one faction's side. */
export type ScoreMany = (moves: Move[]) => number[]

/** Build a board-reading batch scorer from a shipped model. */
export const scoreManyFor =
  (model: NetJSON) =>
  (game: Game, faction: Faction): ScoreMany =>
  (moves: Move[]) => {
    const before = stateFeatures(game, faction)
    return evaluateBatch(
      model,
      moves.map((m) => featuresFrom(before, game, faction, m)),
    )
  }

export interface PlanBudget {
  /** how many concentration targets to try, on top of the defensive and greedy plans */
  mass?: number
  /** how many enemy fronts to try committing the attack to, on top of "no axis" */
  axes?: number
  /** deepest the deterministic attack roll-out goes */
  rolloutCap?: number
}
const DEFAULT_BUDGET: Required<PlanBudget> = { mass: 4, axes: 3, rolloutCap: 14 }

/** The net's read of standing pat — V(s), the value of the position itself. */
const positionValue = (score: ScoreMany): number => score([END])[0]

const borderProvinces = (faction: Faction) =>
  faction.territories.filter((t) => t.adjacent.some((n) => n.faction !== faction))

/** The enemy powers this faction actually borders, most-contested first. */
const enemyAxes = (faction: Faction, cap: number): Faction[] => {
  const pressure = new Map<string, { faction: Faction; troops: number }>()
  for (const t of faction.territories)
    for (const n of t.adjacent)
      if (n.faction !== faction && !n.faction.eliminated) {
        const seen = pressure.get(n.faction.name)
        if (seen) seen.troops += n.troops
        else pressure.set(n.faction.name, { faction: n.faction, troops: n.troops })
      }
  return [...pressure.values()]
    .sort((a, b) => b.troops - a.troops)
    .slice(0, cap)
    .map((p) => p.faction)
}

/**
 * The next attack to make: the best the net rates among favourable ones, keeping
 * to the chosen axis enemy while it offers a favourable target and falling back
 * to the whole board once it does not. Shared by the roll-out and the live turn.
 */
export const pickAttack = (
  game: Game,
  faction: Faction,
  attempted: Set<string>,
  score: ScoreMany,
  axis: Faction | null,
): (Move & { from: Territory; to: Territory }) | null => {
  const moves = attackMoves(game, faction, attempted).filter(
    (m): m is Move & { from: Territory; to: Territory } =>
      m.kind === 'attack' && !!m.from && !!m.to && attackOdds(m.from.troops, m.to.troops) > 0.5,
  )
  if (!moves.length) return null
  const scores = score(moves)
  const onAxis = axis ? moves.map((_, i) => i).filter((i) => moves[i].to.faction === axis) : []
  const pool = onAxis.length ? onAxis : moves.map((_, i) => i)
  let best = pool[0]
  for (const i of pool) if (scores[i] > scores[best]) best = i
  return moves[best]
}

/** Roll the attack phase forward on the LIVE board (caller snapshots/restores). */
const rolloutAttacks = (game: Game, faction: Faction, score: ScoreMany, axis: Faction | null, cap: number): void => {
  const attempted = new Set<string>()
  for (let step = 0; step < cap; step++) {
    const move = pickAttack(game, faction, attempted, score, axis)
    if (!move) break
    const { from, to } = move
    attempted.add(`${from.slug}>${to.slug}`)
    if (!game.turn.useAttack(from.slug, to.slug)) continue
    const survivors = Math.max(1, Math.round((from.troops - 1) * 0.6))
    game.turn.recordConquest(from.slug, to.slug)
    game.board.changeControl(to, faction, game.turn.round)
    to.troops = survivors
    from.troops -= survivors
  }
}

/** The candidate ways to spend the levy, each a sequence of one-unit drops. */
const allocationPlans = (game: Game, faction: Faction, score: ScoreMany, levy: number, mass: number): string[][] => {
  const pool = borderProvinces(faction)
  const targets = pool.length ? pool : faction.territories
  if (!targets.length) return [[]]
  const plans: string[][] = []
  const threatOn = (t: Territory) => t.adjacent.reduce((m, n) => (n.faction !== faction ? Math.max(m, n.troops) : m), 0)
  const facesLostPact = (t: Territory) => t.adjacent.some((n) => n.faction !== faction && PACT.has(n.slug))

  // defensive fill: each unit shores up the border with the largest deficit
  const extra: Record<string, number> = {}
  const defensive: string[] = []
  for (let i = 0; i < levy; i++) {
    const pick = targets
      .slice()
      .sort(
        (a, b) =>
          threatOn(b) + 1 - b.troops - (extra[b.slug] ?? 0) - (threatOn(a) + 1 - a.troops - (extra[a.slug] ?? 0)),
      )[0]
    extra[pick.slug] = (extra[pick.slug] ?? 0) + 1
    defensive.push(pick.slug)
  }
  plans.push(defensive)

  // concentration: all of it on one province, for the few most worth massing on
  const massTargets = targets
    .slice()
    .sort((a, b) => Number(facesLostPact(b)) - Number(facesLostPact(a)) || b.troops - a.troops)
    .slice(0, mass)
  for (const p of massTargets) plans.push(Array<string>(levy).fill(p.slug))

  // net-greedy: today's behaviour, so the search can never do worse than it
  const boardSnap = game.board.snapshot()
  const turnSnap = game.turn.snapshot()
  const greedy: string[] = []
  let left = levy
  let guard = 0
  while (left > 0 && guard++ < 500) {
    const moves = reinforceMoves(faction)
    if (!moves.length) break
    const s = score(moves)
    let bi = 0
    for (let i = 1; i < moves.length; i++) if (s[i] > s[bi]) bi = i
    const slug = moves[bi].from!.slug
    for (let i = 0; i < REINFORCE_BATCH && left > 0; i++, left--) {
      greedy.push(slug)
      game.bySlug[slug].troops++
    }
  }
  while (left-- > 0) greedy.push(targets[0].slug)
  game.board.restore(boardSnap)
  game.turn.restore(turnSnap)
  plans.push(greedy)

  return plans
}

export interface TurnPlan {
  plan: string[]
  axis: Faction | null
}

/**
 * Choose the levy allocation AND the front to commit the attack to, by rolling
 * each (allocation × axis) pair forward and keeping the one that leaves the best
 * position. Decides only — the caller executes it for real.
 */
export const chooseTurnPlan = (game: Game, faction: Faction, score: ScoreMany, budget: PlanBudget = {}): TurnPlan => {
  const { mass, axes, rolloutCap } = { ...DEFAULT_BUDGET, ...budget }
  const levy = game.turn.reinforcementsLeft
  const plans = allocationPlans(game, faction, score, Math.max(0, levy), mass)
  const fronts: (Faction | null)[] = [null, ...enemyAxes(faction, axes)]

  const boardSnap = game.board.snapshot()
  const turnSnap = game.turn.snapshot()
  let best: TurnPlan = { plan: plans[0], axis: null }
  let bestValue = -Infinity
  for (const plan of plans)
    for (const axis of fronts) {
      for (const slug of plan) game.bySlug[slug].troops++
      game.turn.configure({ phase: 'attack' })
      rolloutAttacks(game, faction, score, axis, rolloutCap)
      const value = positionValue(score)
      game.board.restore(boardSnap)
      game.turn.restore(turnSnap)
      if (value > bestValue) {
        bestValue = value
        best = { plan, axis }
      }
    }
  return best
}

/**
 * Play a whole turn by plan search: choose the allocation and axis, then execute
 * them for real — reinforce, drive the attack along the axis with live combat,
 * fortify. `record` lets the trainer log every move the plan actually made.
 */
export const planTurn = (
  game: Game,
  faction: Faction,
  score: ScoreMany,
  opts: { budget?: PlanBudget; record?: (move: Move) => void } = {},
): void => {
  const record = opts.record
  while (game.findTradeSet(faction.hand)) game.tradeCards(faction)
  const { plan, axis } = chooseTurnPlan(game, faction, score, opts.budget)

  const recordedReinforce = new Set<string>()
  for (const slug of plan) {
    if (game.turn.phase !== 'reinforce' || game.turn.reinforcementsLeft <= 0) break
    // one training sample per distinct target, not one per unit — a levy of
    // twelve on one province is a single decision, not twelve
    if (record && !recordedReinforce.has(slug)) {
      recordedReinforce.add(slug)
      record({ kind: 'reinforce', from: game.bySlug[slug] })
    }
    game.turn.placeReinforcements(slug)
  }
  if (game.turn.phase === 'reinforce') game.turn.advancePhase()

  const attempted = new Set<string>()
  let guard = 0
  while (game.turn.phase === 'attack' && guard++ < 200) {
    const move = pickAttack(game, faction, attempted, score, axis)
    if (!move) break
    if (record) record(move)
    attempted.add(`${move.from.slug}>${move.to.slug}`)
    if (!game.combat.begin(move.from.slug, move.to.slug)) break
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

  if (game.turn.phase === 'fortify') {
    const moves = fortifyMoves(game, faction)
    const s = score(moves)
    let bi = 0
    for (let i = 1; i < moves.length; i++) if (s[i] > s[bi]) bi = i
    const move = moves[bi]
    if (record) record(move)
    if (move?.from && move.to) {
      if (move.kind === 'fortify') game.movement.fortify(move.from.slug, move.to.slug, moveAmount(game, move.from))
      else if (move.kind === 'sail') game.movement.embark(move.from.slug, move.to.slug, moveAmount(game, move.from))
    }
    if (game.turn.phase === 'fortify') game.turn.advancePhase()
  }
}

/** A per-faction score builder bound to a model set, for the plan-search hooks. */
export const makePlanScore =
  (models: Models) =>
  (game: Game, faction: Faction): ScoreMany =>
    scoreManyFor(models[faction.name])(game, faction)
