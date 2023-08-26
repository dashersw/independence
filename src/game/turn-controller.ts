import type Game from './game'
import type Player from './player'
import type { Phase } from './types'

export interface TurnState {
  /** Changes whenever a new faction turn begins. */
  id: number
  round: number
  playerIndex: number
  phase: Phase
  reinforcements: {
    granted: number
    remaining: number
  }
  attacks: {
    used: number
    advanceDepth: Record<string, number>
  }
  fortifiesUsed: number
  conqueredTerritory: boolean
  liberatedHomeland: boolean
  /**
   * True between `start` and `openTurn` while a human weighs a storm-or-turn-back
   * landing: the turn's seat is set but its draft and events are not yet drawn.
   */
  awaitingLanding: boolean
}

export type ReadonlyTurnState = Readonly<Omit<TurnState, 'reinforcements' | 'attacks'>> & {
  readonly reinforcements: Readonly<TurnState['reinforcements']>
  readonly attacks: Readonly<{
    used: number
    advanceDepth: Readonly<Record<string, number>>
  }>
}

export type RestoredTurnState = Omit<TurnState, 'id' | 'reinforcements' | 'attacks' | 'awaitingLanding'> & {
  id?: number
  reinforcements: { granted?: number; remaining: number }
  attacks?: {
    used?: number
    advanceDepth?: Readonly<Record<string, number>>
  }
  awaitingLanding?: boolean
}

const initialState = (): TurnState => ({
  id: 0,
  round: 1,
  playerIndex: 0,
  phase: 'reinforce',
  reinforcements: { granted: 0, remaining: 0 },
  attacks: { used: 0, advanceDepth: {} },
  fortifiesUsed: 0,
  conqueredTerritory: false,
  liberatedHomeland: false,
  awaitingLanding: false,
})

/** Owns the active seat, phase machine, and every value whose lifetime is one turn. */
export class TurnController {
  readonly game: Game
  #state: TurnState = initialState()

  constructor(game: Game) {
    this.game = game
  }

  get state(): ReadonlyTurnState {
    const state = this.#state
    return {
      ...state,
      reinforcements: { ...state.reinforcements },
      attacks: {
        used: state.attacks.used,
        advanceDepth: { ...state.attacks.advanceDepth },
      },
    }
  }

  get id() {
    return this.#state.id
  }
  get round() {
    return this.#state.round
  }
  get playerIndex() {
    return this.#state.playerIndex
  }
  get phase() {
    return this.#state.phase
  }
  get isGameOver() {
    return this.#state.phase === 'gameover'
  }
  get reinforcementsGranted() {
    return this.#state.reinforcements.granted
  }
  get reinforcementsLeft() {
    return this.#state.reinforcements.remaining
  }
  get attacksUsed() {
    return this.#state.attacks.used
  }
  get attackLimit() {
    return this.game.campaign.attackLimit
  }
  get attacksLeft() {
    return Math.max(0, this.attackLimit - this.attacksUsed)
  }
  get fortifiesUsed() {
    return this.#state.fortifiesUsed
  }
  get conqueredTerritory() {
    return this.#state.conqueredTerritory
  }
  get liberatedHomeland() {
    return this.#state.liberatedHomeland
  }
  /** The seat is taken but the turn is paused on a human landing decision. */
  get awaitingLanding() {
    return this.#state.awaitingLanding
  }

  get currentPlayer(): Player {
    return this.game.players[this.#state.playerIndex]
  }

  isCurrent(id: number) {
    return this.#state.id === id
  }

  snapshot(): TurnState {
    return {
      ...this.#state,
      reinforcements: { ...this.#state.reinforcements },
      attacks: {
        used: this.#state.attacks.used,
        advanceDepth: { ...this.#state.attacks.advanceDepth },
      },
    }
  }

  /** Restores one atomic, validated turn state from persistence or scenario tooling. */
  restore(state: RestoredTurnState) {
    const playerIndex = Math.trunc(state.playerIndex)
    if (playerIndex < 0 || playerIndex >= this.game.players.length) throw new Error('invalid turn player')
    if (!['reinforce', 'attack', 'fortify', 'gameover'].includes(state.phase)) throw new Error('invalid turn phase')
    const round = Math.max(1, Math.trunc(state.round))
    const remaining = Math.max(0, Math.trunc(state.reinforcements.remaining))
    const granted = Math.max(remaining, Math.trunc(state.reinforcements.granted ?? remaining))
    const advanceDepth: Record<string, number> = {}
    for (const [slug, rawDepth] of Object.entries(state.attacks?.advanceDepth ?? {})) {
      if (!this.game.bySlug[slug]) throw new Error(`invalid advance-depth territory ${slug}`)
      if (typeof rawDepth !== 'number' || !Number.isFinite(rawDepth))
        throw new Error(`invalid advance depth for ${slug}`)
      const depth = Math.trunc(rawDepth)
      if (depth < 0) throw new Error(`invalid advance depth for ${slug}`)
      if (depth > 0) advanceDepth[slug] = depth
    }
    const attacksUsed = state.attacks?.used ?? 0
    if (typeof attacksUsed !== 'number' || !Number.isFinite(attacksUsed) || attacksUsed < 0)
      throw new Error('invalid attacks used')
    this.#state = {
      id: Math.max(this.#state.id + 1, Math.trunc(state.id ?? 0)),
      round,
      playerIndex,
      phase: state.phase,
      reinforcements: { granted, remaining },
      attacks: {
        used: Math.trunc(attacksUsed),
        advanceDepth,
      },
      fortifiesUsed: Math.max(0, Math.trunc(state.fortifiesUsed)),
      conqueredTerritory: Boolean(state.conqueredTerritory),
      liberatedHomeland: Boolean(state.liberatedHomeland),
      awaitingLanding: Boolean(state.awaitingLanding),
    }
  }

  /** Controlled partial state replacement for simulations and declarative effects. */
  configure(patch: {
    round?: number
    playerIndex?: number
    phase?: Phase
    reinforcementsLeft?: number
    attacks?: {
      used?: number
      advanceDepth?: Readonly<Record<string, number>>
    }
    fortifiesUsed?: number
    conqueredTerritory?: boolean
    liberatedHomeland?: boolean
  }) {
    const state = this.#state
    const id = state.id
    this.restore({
      ...state,
      id: state.id,
      round: patch.round ?? state.round,
      playerIndex: patch.playerIndex ?? state.playerIndex,
      phase: patch.phase ?? state.phase,
      reinforcements: {
        granted:
          patch.reinforcementsLeft == null
            ? state.reinforcements.granted
            : Math.max(state.reinforcements.granted, patch.reinforcementsLeft),
        remaining: patch.reinforcementsLeft ?? state.reinforcements.remaining,
      },
      attacks: {
        used: patch.attacks?.used ?? state.attacks.used,
        advanceDepth: patch.attacks?.advanceDepth ?? state.attacks.advanceDepth,
      },
      fortifiesUsed: patch.fortifiesUsed ?? state.fortifiesUsed,
      conqueredTerritory: patch.conqueredTerritory ?? state.conqueredTerritory,
      liberatedHomeland: patch.liberatedHomeland ?? state.liberatedHomeland,
    })
    this.#state.id = id
  }

  start() {
    const game = this.game
    game.movement.landConvoys()
    if (this.phase === 'gameover') return

    // Seat the new turn, but leave the draft empty for now: a human still owes a
    // storm-or-turn-back call on a landing, and its outcome changes the board the
    // draft is counted from. openTurn finishes the job once that is settled.
    const awaitingLanding = this.currentPlayer.isHuman && game.movement.pendingLandings.length > 0
    this.#state = {
      id: this.#state.id + 1,
      round: this.round,
      playerIndex: this.playerIndex,
      phase: 'reinforce',
      reinforcements: { granted: 0, remaining: 0 },
      attacks: {
        used: 0,
        advanceDepth: {},
      },
      fortifiesUsed: 0,
      conqueredTerritory: false,
      liberatedHomeland: false,
      awaitingLanding,
    }

    if (awaitingLanding) return
    this.openTurn()
  }

  /**
   * Finish starting the turn: draw the reinforcement draft from the current board,
   * fire turn-start events, and auto-trade a forced hand. Runs immediately for a
   * normal turn, or once `resolveLanding` clears a human's pending landings.
   */
  openTurn() {
    const game = this.game
    const faction = this.currentPlayer.faction
    this.#state.awaitingLanding = false
    const granted = game.campaign.reinforcementsFor(faction)
    this.#state.reinforcements = { granted, remaining: granted }

    game.campaign.turnStarted(faction)
    game.campaign.dispatch()

    while (faction.hand.length >= 5 && game.findTradeSet(faction.hand)) game.tradeCards(faction)
  }

  addReinforcements(count: number) {
    if (this.phase !== 'reinforce' || count <= 0) return
    this.#state.reinforcements.granted += count
    this.#state.reinforcements.remaining += count
  }

  setReinforcements(count: number) {
    const remaining = Math.max(0, Math.trunc(count))
    this.#state.reinforcements.remaining = remaining
    this.#state.reinforcements.granted = Math.max(this.#state.reinforcements.granted, remaining)
  }

  setPhase(phase: Phase) {
    this.configure({ phase })
  }

  placeReinforcements(slug: string, count = 1) {
    if (this.phase !== 'reinforce') return
    const territory = this.game.bySlug[slug]
    if (!territory || territory.faction !== this.currentPlayer.faction) return
    const placed = Math.min(Math.max(0, Math.trunc(count)), this.reinforcementsLeft)
    territory.troops += placed
    this.#state.reinforcements.remaining -= placed
    if (this.reinforcementsLeft === 0) this.#state.phase = 'attack'
  }

  finishReinforcementPhase() {
    if (this.phase !== 'reinforce') return
    this.#state.reinforcements.remaining = 0
    this.#state.phase = 'attack'
  }

  advanceDepth(slug: string) {
    return this.#state.attacks.advanceDepth[slug] ?? 0
  }

  maximumAdvanceDepth(targetSlug: string) {
    return this.game.campaign.maximumAdvanceDepth(targetSlug)
  }

  canStartAttack(fromSlug: string, targetSlug: string) {
    return (
      this.phase === 'attack' &&
      this.attacksLeft > 0 &&
      this.advanceDepth(fromSlug) < this.maximumAdvanceDepth(targetSlug)
    )
  }

  useAttack(fromSlug: string, targetSlug: string) {
    if (!this.canStartAttack(fromSlug, targetSlug)) return false
    this.#state.attacks.used++
    return true
  }

  recordConquest(fromSlug: string, toSlug: string) {
    this.#state.conqueredTerritory = true
    this.#state.attacks.advanceDepth[toSlug] = this.advanceDepth(fromSlug) + 1
  }

  recordLiberation() {
    this.#state.liberatedHomeland = true
  }

  useFortify() {
    this.#state.fortifiesUsed++
  }

  advancePhase() {
    if (this.game.combat.pendingAdvance) this.game.combat.advance(0)
    this.game.combat.pullBack()
    if (this.phase === 'reinforce' && this.reinforcementsLeft === 0) this.#state.phase = 'attack'
    else if (this.phase === 'attack') this.#state.phase = 'fortify'
    else if (this.phase === 'fortify') this.finish()
  }

  finish() {
    if (this.phase === 'gameover') return
    if (this.conqueredTerritory) this.game.drawCard(this.currentPlayer.faction)
    const total = this.game.players.length
    for (let step = 1; step <= total; step++) {
      const nextIndex = (this.playerIndex + step) % total
      if (!this.game.players[nextIndex].faction.eliminated) {
        if (nextIndex <= this.playerIndex) {
          this.#state.round++
          this.game.campaign.roundUpkeep()
        }
        this.#state.playerIndex = nextIndex
        this.start()
        return
      }
    }
  }

  endGame() {
    this.#state.phase = 'gameover'
  }
}
