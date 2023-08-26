import type Faction from './faction'
import type Territory from './territory'

export type Phase = 'reinforce' | 'attack' | 'fortify' | 'gameover'

/** Troops in the middle of a sea crossing. */
export interface Convoy {
  faction: string
  from: string
  to: string
  troops: number
  arrives: number
  /** A convoy sailing home after its target was lost: it can't fall back again. */
  returning?: boolean
}

/**
 * A convoy that reached a port an enemy captured mid-crossing, awaiting the
 * human player's decision to storm the beach or fall back to the origin.
 */
export interface PendingLanding {
  faction: string
  from: string
  to: string
  troops: number
}

export interface BattleRound {
  attackerDice: number[]
  defenderDice: number[]
  attackerLosses: number
  defenderLosses: number
}

export interface BattleResult {
  from: Territory
  to: Territory
  attacker: Faction
  defender: Faction
  rounds: BattleRound[]
  conquered: boolean
  attackerLosses: number
  defenderLosses: number
  troopsMoved: number
  eliminatedFaction: Faction | null
  pending: boolean
}

export type LogValue =
  | string
  | number
  | { kind: 'faction'; name: string }
  | { kind: 'territory'; slug: string; fallback: string; grammaticalCase?: 'dat' | 'acc' | 'loc' | 'abl' }
  | { kind: 'date'; value: string }

export interface LogEntry {
  round: number
  faction: string
  color: string
  key: string
  vars: Record<string, LogValue>
  event?: boolean
}
