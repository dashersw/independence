import type Game from './game'
import type { BoardSnapshot } from './board'
import type { Card } from './faction'
import type { TurnState } from './turn-controller'
import type { Convoy, LogEntry, Phase } from './types'

export const SAVE_VERSION = 3

interface FactionSnapshot {
  hand: Card[]
  grudges: string[]
  peaceBroken: boolean
}

export interface GameSnapshot {
  v: 3
  core: {
    tradeCount: number
    humanDefeated: boolean
    winner: string | null
    endedRound: number
    log: LogEntry[]
  }
  turn: TurnState
  board: BoardSnapshot
  factions: Record<string, FactionSnapshot>
  campaign: ReturnType<Game['campaign']['snapshot']>
  movement: ReturnType<Game['movement']['snapshot']>
  combat: ReturnType<Game['combat']['snapshot']>
  random?: unknown
}

/** Shape written before subsystems owned their persistence. Kept only as an input migration. */
interface LegacyGameSnapshot {
  v: 2
  round: number
  phase: Phase
  currentPlayerIndex: number
  reinforcementsLeft: number
  fortifiesUsed: number
  conqueredThisTurn: boolean
  liberatedThisTurn?: boolean
  tradeCount: number
  humanDefeated: boolean
  winner: string | null
  announcedEvents: string[]
  pendingCards?: string[]
  pendingDecision?: string | null
  pendingAdvance?: { from: string; to: string; min: number; max: number } | null
  campaignVariables: Record<string, unknown>
  landedOn?: string[]
  gateRetries?: Record<string, number>
  gateCheckedOn?: Record<string, number>
  convoys?: Convoy[]
  territories: Record<string, { faction: string; troops: number }>
  entrench?: Record<string, [number, number]>
  heldSince?: Record<string, number>
  raidedOn?: Record<string, number>
  factions: Record<string, FactionSnapshot>
  log: LogEntry[]
}

export type RestorableGameSnapshot = GameSnapshot | LegacyGameSnapshot

const factionSnapshot = (game: Game) =>
  Object.fromEntries(
    game.factions.map((faction) => [
      faction.name,
      { hand: [...faction.hand], grudges: [...faction.grudges], peaceBroken: faction.peaceBroken },
    ]),
  )

export const snapshotGame = (game: Game): GameSnapshot => ({
  v: SAVE_VERSION,
  core: {
    tradeCount: game.tradeCount,
    humanDefeated: game.humanDefeated,
    winner: game.winner?.name ?? null,
    endedRound: game.endedRound,
    log: game.log.map((entry) => ({ ...entry })),
  },
  turn: game.turn.snapshot(),
  board: game.board.snapshot(),
  factions: factionSnapshot(game),
  campaign: game.campaign.snapshot(),
  movement: game.movement.snapshot(),
  combat: game.combat.snapshot(),
  random: game.random.snapshot?.(),
})

const migrateLegacy = (game: Game, legacy: LegacyGameSnapshot): GameSnapshot => ({
  v: SAVE_VERSION,
  core: {
    tradeCount: legacy.tradeCount,
    humanDefeated: legacy.humanDefeated,
    winner: legacy.winner,
    endedRound: legacy.phase === 'gameover' ? legacy.round : 0,
    log: legacy.log,
  },
  turn: {
    id: 0,
    round: legacy.round,
    playerIndex: legacy.currentPlayerIndex,
    phase: legacy.phase,
    reinforcements: { granted: legacy.reinforcementsLeft, remaining: legacy.reinforcementsLeft },
    attacks: { used: 0, advanceDepth: {} },
    fortifiesUsed: legacy.fortifiesUsed,
    conqueredTerritory: legacy.conqueredThisTurn,
    liberatedHomeland: legacy.liberatedThisTurn ?? false,
    awaitingLanding: false,
  },
  board: {
    territories: Object.fromEntries(
      game.territories.map((territory) => {
        const record = legacy.territories[territory.slug]
        if (!record) throw new Error(`save is missing territory ${territory.slug}`)
        const entrench = legacy.entrench?.[territory.slug]
        return [
          territory.slug,
          {
            ...record,
            quietTurns: entrench?.[0] ?? 0,
            entrenched: entrench?.[1] ?? 0,
            heldSince: legacy.heldSince?.[territory.slug] ?? 1,
            raidedOn: legacy.raidedOn?.[territory.slug] ?? 0,
          },
        ]
      }),
    ),
  },
  factions: legacy.factions,
  campaign: {
    variables: legacy.campaignVariables,
    retries: legacy.gateRetries ?? {},
    checkedOn: legacy.gateCheckedOn ?? {},
    announcedEvents: legacy.announcedEvents,
    pendingCards: legacy.pendingCards ?? [],
    pendingDecision: legacy.pendingDecision ?? null,
  },
  movement: { convoys: legacy.convoys ?? [], pendingLandings: [] },
  combat: { active: null, pendingAdvance: legacy.pendingAdvance ?? null, landedOn: legacy.landedOn ?? [] },
})

export const restoreGame = (game: Game, input: RestorableGameSnapshot) => {
  if (!input || (input.v !== SAVE_VERSION && input.v !== 2)) throw new Error('incompatible save')
  const snapshot = input.v === 2 ? migrateLegacy(game, input) : input
  game.board.restore(snapshot.board)
  for (const faction of game.factions) {
    const record = snapshot.factions[faction.name]
    if (!record) throw new Error(`Save is missing faction ${faction.name}`)
    faction.hand = [...record.hand]
    faction.grudges = new Set(record.grudges)
    faction.peaceBroken = record.peaceBroken
  }
  game.turn.restore(snapshot.turn)
  game.campaign.restore(snapshot.campaign)
  game.movement.restore(snapshot.movement)
  game.combat.restore(snapshot.combat)
  game.tradeCount = snapshot.core.tradeCount
  game.humanDefeated = snapshot.core.humanDefeated
  game.winner = snapshot.core.winner
    ? (game.factions.find((faction) => faction.name === snapshot.core.winner) ?? null)
    : null
  game.endedRound = snapshot.core.endedRound
  game.log = snapshot.core.log.map((entry) => ({ ...entry }))
  if (snapshot.random !== undefined) {
    if (!game.random.restore) throw new Error('Save contains random state but the configured source cannot restore it')
    game.random.restore(snapshot.random)
  }
}
