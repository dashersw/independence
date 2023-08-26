import type Game from '../game/game'
import type Faction from '../game/faction'
import type Territory from '../game/territory'
import { ASSEMBLY_SEATS } from '../game/campaign-data'
import type { AiMove, AiScorer, AiSelector } from './types'
import { type ScoreMany, type PlanBudget, chooseTurnPlan, pickAttack } from './policy'

const AGGRESSION: Record<string, { minEdge: number }> = {
  Greece: { minEdge: 3 },
  Armenia: { minEdge: 2 },
  France: { minEdge: 3 },
  Bulgaria: { minEdge: 3 },
  Britain: { minEdge: 5 },
  Italy: { minEdge: 6 },
  Turkey: { minEdge: 2 },
}

const RETALIATION_MIN_EDGE = 2
const SEAT_PRIORITY = 8
const REINFORCE_BATCH = 3
const ATTACK_SAFETY_GUARD = 200

export interface AiTurnOptions {
  scorer?: AiScorer | null
  selector?: AiSelector | null
  /** Turn-level plan search: a per-faction board scorer. When set it drives the whole turn. */
  planScore?: ((game: Game, faction: Faction) => ScoreMany) | null
  planBudget?: PlanBudget
}

/** Drives AI turns exclusively through the same legal commands used by humans. */
export class AiTurnController {
  scorer: AiScorer | null
  selector: AiSelector | null
  planScore: ((game: Game, faction: Faction) => ScoreMany) | null
  planBudget: PlanBudget
  private attacking = false
  private attackSteps = 0
  private attemptedAttacks = new Set<string>()
  // set for the current turn when plan search is driving it
  private score: ScoreMany | null = null
  private axis: Faction | null = null

  constructor(
    readonly game: Game,
    options: AiTurnOptions = {},
  ) {
    this.scorer = options.scorer ?? null
    this.selector = options.selector ?? null
    this.planScore = options.planScore ?? null
    this.planBudget = options.planBudget ?? {}
  }

  private bestMove(faction: Faction, moves: AiMove[]): AiMove | null {
    if (!moves.length) return null
    if (this.selector) return this.selector(this.game, faction, moves)
    if (!this.scorer) return null
    let best = moves[0]
    let bestScore = -Infinity
    for (const move of moves) {
      const score = this.scorer(this.game, faction, move)
      if (score > bestScore) {
        bestScore = score
        best = move
      }
    }
    return best
  }

  beginTurn() {
    const game = this.game
    if (game.turn.phase === 'gameover' || game.turn.currentPlayer.isHuman) return
    const faction = game.turn.currentPlayer.faction
    while (game.findTradeSet(faction.hand)) game.tradeCards(faction)
    this.score = null
    this.axis = null
    if (this.planScore) {
      // choose the whole turn's plan, then spend the levy on it; the axis it
      // committed to steers attackStep below
      this.score = this.planScore(game, faction)
      const { plan, axis } = chooseTurnPlan(game, faction, this.score, this.planBudget)
      this.axis = axis
      for (const slug of plan) {
        if (game.turn.phase !== 'reinforce' || game.turn.reinforcementsLeft <= 0) break
        game.turn.placeReinforcements(slug)
      }
    } else if (this.scorer) {
      let guard = 0
      while (game.turn.phase === 'reinforce' && game.turn.reinforcementsLeft > 0 && guard++ < 400) {
        const move = this.bestMove(
          faction,
          faction.territories.map((from) => ({ kind: 'reinforce' as const, from })),
        )
        if (!move?.from) break
        for (let i = 0; i < REINFORCE_BATCH && game.turn.reinforcementsLeft > 0; i++)
          game.turn.placeReinforcements(move.from.slug)
      }
    }
    game.reinforcements.autoPlace()
    this.attackSteps = 0
    this.attemptedAttacks.clear()
    this.attacking = !game.campaign.frozen(faction) && (!game.campaign.isPassive(faction) || faction.grudges.size > 0)
  }

  private attackOptions(faction: Faction): AiMove[] {
    const moves: AiMove[] = [{ kind: 'end' }]
    for (const from of faction.territories) {
      if (from.troops < 2) continue
      for (const slug of this.game.combat.targets(from.slug))
        if (!this.attemptedAttacks.has(`${from.slug}>${slug}`))
          moves.push({ kind: 'attack', from, to: this.game.bySlug[slug] })
    }
    return moves
  }

  attackStep(): boolean {
    const game = this.game
    if (
      game.turn.phase !== 'attack' ||
      game.turn.currentPlayer.isHuman ||
      !this.attacking ||
      this.attackSteps++ >= ATTACK_SAFETY_GUARD
    )
      return false
    const faction = game.turn.currentPlayer.faction
    if (this.score) {
      const move = pickAttack(game, faction, this.attemptedAttacks, this.score, this.axis)
      if (!move) {
        this.attacking = false
        return false
      }
      this.attemptedAttacks.add(`${move.from.slug}>${move.to.slug}`)
      if (!game.combat.begin(move.from.slug, move.to.slug)) {
        this.attacking = false
        return false
      }
      let step = game.combat.step(move.from.slug, move.to.slug)
      while (step && step.pending) {
        if (!game.combat.worthPressing(move.from, move.to)) {
          game.combat.pullBack()
          break
        }
        step = game.combat.step(move.from.slug, move.to.slug)
      }
      if (game.combat.pendingAdvance) game.combat.advance(game.combat.pendingAdvance.max)
      return true
    }
    if (this.scorer) {
      const move = this.bestMove(faction, this.attackOptions(faction))
      if (!move || move.kind === 'end' || !move.from || !move.to) {
        this.attacking = false
        return false
      }
      if (!game.combat.begin(move.from.slug, move.to.slug)) {
        this.attacking = false
        return false
      }
      this.attemptedAttacks.add(`${move.from.slug}>${move.to.slug}`)
      let step = game.combat.step(move.from.slug, move.to.slug)
      while (step && step.pending) {
        if (!game.combat.worthPressing(move.from, move.to)) {
          game.combat.pullBack()
          break
        }
        step = game.combat.step(move.from.slug, move.to.slug)
      }
      if (game.combat.pendingAdvance) game.combat.advance(game.combat.pendingAdvance.max)
      return true
    }

    const aggression = AGGRESSION[faction.name] ?? { minEdge: 3 }
    const options: { from: Territory; to: Territory; score: number }[] = []
    faction.territories.forEach((from) => {
      if (from.troops < 3) return
      const legalTargets = new Set(game.combat.targets(from.slug))
      from.adjacent.forEach((to) => {
        if (!legalTargets.has(to.slug)) return
        if (this.attemptedAttacks.has(`${from.slug}>${to.slug}`)) return
        const avenging = faction.grudges.has(to.faction.name)
        const minEdge = avenging ? Math.min(aggression.minEdge, RETALIATION_MIN_EDGE) : aggression.minEdge
        const seat = to.faction.alliance === 'turkey' && ASSEMBLY_SEATS.includes(to.slug) ? SEAT_PRIORITY : 0
        const edge = from.troops - to.troops
        if (edge >= minEdge) options.push({ from, to, score: (avenging ? edge + 100 : edge) + seat })
      })
    })
    if (!options.length) {
      this.attacking = false
      return false
    }
    options.sort((left, right) => right.score - left.score)
    const { from, to } = options[0]
    this.attemptedAttacks.add(`${from.slug}>${to.slug}`)
    let step = game.combat.step(from.slug, to.slug)
    while (step && step.pending) {
      if (!game.combat.worthPressing(from, to)) {
        game.combat.pullBack()
        break
      }
      step = game.combat.step(from.slug, to.slug)
    }
    return true
  }

  finishTurn() {
    const game = this.game
    if (game.turn.phase === 'gameover' || game.turn.currentPlayer.isHuman) return
    const faction = game.turn.currentPlayer.faction
    if (game.turn.phase === 'attack') game.turn.advancePhase()
    if (this.score) {
      const moves: AiMove[] = [{ kind: 'end' }]
      for (const from of faction.territories) {
        if (from.troops < 2) continue
        for (const to of from.adjacent) if (to.faction === faction) moves.push({ kind: 'fortify', from, to })
        for (const slug of game.movement.seaTargets(from.slug))
          moves.push({ kind: 'sail', from, to: game.bySlug[slug] })
      }
      const values = this.score(moves as never[])
      let best = 0
      for (let i = 1; i < moves.length; i++) if (values[i] > values[best]) best = i
      const move = moves[best]
      if (move?.from && move.to) {
        if (move.kind === 'fortify')
          game.movement.fortify(move.from.slug, move.to.slug, game.movement.movable(move.from))
        else if (move.kind === 'sail')
          game.movement.embark(move.from.slug, move.to.slug, game.movement.movable(move.from))
      }
      this.score = null
      this.axis = null
      game.turn.finish()
      return
    }
    if (this.scorer) {
      const moves: AiMove[] = [{ kind: 'end' }]
      for (const from of faction.territories) {
        if (from.troops < 2) continue
        for (const to of from.adjacent) if (to.faction === faction) moves.push({ kind: 'fortify', from, to })
        for (const slug of game.movement.seaTargets(from.slug))
          moves.push({ kind: 'sail', from, to: game.bySlug[slug] })
      }
      const move = this.bestMove(faction, moves)
      if (move?.from && move.to) {
        if (move.kind === 'fortify')
          game.movement.fortify(move.from.slug, move.to.slug, game.movement.movable(move.from))
        else if (move.kind === 'sail')
          game.movement.embark(move.from.slug, move.to.slug, game.movement.movable(move.from))
      }
      game.turn.finish()
      return
    }
    if (!this.shipReinforcements(faction)) {
      const interior = faction.territories
        .filter(
          (territory) => territory.troops > 1 && territory.adjacent.every((adjacent) => adjacent.faction === faction),
        )
        .sort((left, right) => right.troops - left.troops)[0]
      if (interior) {
        const border = interior.adjacent
          .filter((territory) => territory.faction === faction)
          .sort((left, right) => game.threatOf(right) - game.threatOf(left))[0]
        if (border && game.threatOf(border) > -Infinity)
          game.movement.fortify(interior.slug, border.slug, game.movement.movable(interior))
      }
    }
    game.turn.finish()
  }

  private shipReinforcements(faction: Faction) {
    const game = this.game
    for (const from of faction.territories) {
      if (game.movement.shippable(from) <= 0) continue
      for (const slug of game.movement.seaTargets(from.slug)) {
        const to = game.bySlug[slug]
        if (game.threatOf(to) <= game.threatOf(from) || to.troops >= from.troops) continue
        if (game.movement.embark(from.slug, slug, game.movement.shippable(from))) return true
      }
    }
    return false
  }

  playTurn() {
    this.beginTurn()
    while (this.attackStep()) {
      // Resolve every attack before advancing to the end-of-turn phase.
    }
    this.finishTurn()
  }
}

/** Convenience for simulations that do not need UI-paced attack steps. */
export const playAiTurn = (game: Game, options: AiTurnOptions = {}) => new AiTurnController(game, options).playTurn()
