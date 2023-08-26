import type Faction from './faction'
import type { Card } from './faction'
import type Territory from './territory'
import type Player from './player'
import { t, getLang } from '../i18n'
import { dateForRound } from '../events/event-map'
import { CAMPAIGN_EVENT_MAP } from './campaign-events'
import { NATIONAL_PACT } from './campaign-data'
import type { LogEntry, LogValue } from './types'
import { CombatSystem } from './combat'
import { MovementSystem } from './movement'
import { CampaignRuntime } from './campaign-runtime'
import { createGameSetup } from './setup'
import { TurnController } from './turn-controller'
import { SCENARIO } from './scenario'
import { BoardSystem } from './board'
import { ReinforcementSystem } from './reinforcements'
import { SystemRandom, type RandomSource } from './random'
import { logDate, logFaction } from './log'

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
]
const MONTHS_TR = [
  'Ocak',
  'Şubat',
  'Mart',
  'Nisan',
  'Mayıs',
  'Haziran',
  'Temmuz',
  'Ağustos',
  'Eylül',
  'Ekim',
  'Kasım',
  'Aralık',
]

// A specific month rendered in the active language, for events that want to
// quote their real historical date rather than the round they landed on.
const formatMonth = (month: number, year: number, day?: number) =>
  `${day ? `${day} ` : ''}${(getLang() === 'tr' ? MONTHS_TR : MONTHS)[month]} ${year}`

// Escalating Risk-style card trade bonuses.
export const tradeBonusAt = (n: number) =>
  n < SCENARIO.economy.tradeBonuses.length
    ? SCENARIO.economy.tradeBonuses[n]
    : SCENARIO.economy.tradeBonuses[SCENARIO.economy.tradeBonuses.length - 1] +
      SCENARIO.economy.tradeIncrement * (n - SCENARIO.economy.tradeBonuses.length + 1)

const CARD_TYPES: Card[] = SCENARIO.economy.cardTypes

export default class Game {
  factions: Faction[]
  players: Player[]
  territories: Territory[]
  bySlug: Record<string, Territory>
  tradeCount: number
  log: LogEntry[]
  winner: Faction | null
  humanDefeated: boolean
  readonly combat: CombatSystem
  readonly movement: MovementSystem
  readonly campaign: CampaignRuntime
  readonly turn: TurnController
  readonly board: BoardSystem
  readonly reinforcements: ReinforcementSystem
  readonly random: RandomSource
  // the round the war ended on. Stored as a NUMBER, not a formatted date: the
  // ending copy is re-rendered on a language switch, and a baked "Şubat 1922"
  // would survive into the English text.
  endedRound = 0

  constructor(options: { random?: RandomSource } = {}) {
    const setup = createGameSetup()
    this.factions = setup.factions
    this.players = setup.players
    this.territories = setup.territories
    this.bySlug = setup.bySlug

    this.tradeCount = 0
    this.log = []
    this.winner = null
    this.humanDefeated = false
    this.random = options.random ?? new SystemRandom()
    this.board = new BoardSystem(this)
    this.combat = new CombatSystem(this)
    this.movement = new MovementSystem(this)
    this.campaign = new CampaignRuntime(this)
    this.turn = new TurnController(this)
    this.reinforcements = new ReinforcementSystem(this)
    this.turn.start()
    this.record(null, 'log.gameStart')
  }

  get humanPlayer() {
    return this.players.find((p) => p.isHuman) as Player
  }

  // Calendar cadence belongs to the event engine; the game only localizes it.
  dateAt(round: number) {
    const calendar = CAMPAIGN_EVENT_MAP.calendar
    if (!calendar) return `Round ${round}`
    const at = dateForRound(calendar, round)
    return formatMonth(at.month - 1, at.year)
  }

  get date() {
    return this.dateAt(this.turn.round)
  }

  get pactProgress() {
    const turkey = this.humanPlayer.faction
    return NATIONAL_PACT.filter((slug) => this.bySlug[slug].faction === turkey).length
  }

  // Won the war and then some: not a single province anywhere on the map is
  // still in foreign hands, well past what Misak-ı Millî ever claimed.
  get totalConquest() {
    const turkey = this.humanPlayer.faction
    return this.territories.every((t) => t.faction === turkey)
  }

  record(faction: Faction | null, key: string, vars: Record<string, LogValue> = {}, event = false) {
    this.log.push({
      round: this.turn.round,
      faction: faction?.name ?? '',
      color: faction?.name ?? '',
      key,
      vars,
      event,
    })
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200)
  }

  traitSummary(faction: Faction): string {
    return t(`trait.${faction.name}`)
  }

  // ---- cards ----

  drawCard(faction: Faction) {
    faction.hand.push(CARD_TYPES[Math.floor(this.random.next() * CARD_TYPES.length)])
  }

  // Returns the indexes of a tradable set (3 alike or one of each), preferring the cheapest cards.
  findTradeSet(hand: Card[]): number[] | null {
    for (const type of CARD_TYPES) {
      const idx = hand.map((c, i) => (c === type ? i : -1)).filter((i) => i >= 0)
      if (idx.length >= 3) return idx.slice(0, 3)
    }
    const one: number[] = []
    for (const type of CARD_TYPES) {
      const i = hand.findIndex((c, j) => c === type && !one.includes(j))
      if (i === -1) return null
      one.push(i)
    }
    return one
  }

  get pendingTradeBonus() {
    return tradeBonusAt(this.tradeCount)
  }

  tradeCards(faction: Faction): number {
    const set = this.findTradeSet(faction.hand)
    if (!set) return 0
    const bonus = tradeBonusAt(this.tradeCount)
    this.tradeCount++
    faction.hand = faction.hand.filter((_, i) => !set.includes(i))
    if (faction === this.turn.currentPlayer.faction) this.turn.addReinforcements(bonus)
    this.record(faction, 'log.tradeCards', { faction: logFaction(faction.name), bonus })
    return bonus
  }

  threatOf(territory: Territory) {
    // Only borders where war is actually possible count — allies don't threaten each other.
    const enemies = territory.adjacent.filter(
      (a) =>
        a.faction !== territory.faction &&
        (this.campaign.mayAttack(a.faction, territory.faction) ||
          this.campaign.mayAttack(territory.faction, a.faction)),
    )
    if (enemies.length === 0) return -Infinity
    return enemies.reduce((sum, e) => sum + e.troops, 0) - territory.troops
  }

  checkGameEnd() {
    const turkey = this.humanPlayer.faction
    if (turkey.eliminated) {
      this.humanDefeated = true
      this.turn.endGame()
      this.endedRound = this.turn.round
      this.record(null, 'log.turkeyFallen')
      return
    }
    // Completing the Pact no longer ends the war by itself — it has to be HELD,
    // and the peace is signed through the conference lifecycle. But a
    // map with no enemy left on it has nothing further to decide.
    if (this.totalConquest) {
      this.winner = turkey
      this.turn.endGame()
      this.endedRound = this.turn.round
      this.record(turkey, 'log.victory', { date: logDate(this.date) })
    }
  }
}
