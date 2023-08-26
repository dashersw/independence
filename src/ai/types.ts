import type Game from '../game/game'
import type Faction from '../game/faction'
import type Territory from '../game/territory'

export interface AiMove {
  kind: 'reinforce' | 'attack' | 'fortify' | 'sail' | 'decision' | 'end'
  from?: Territory
  to?: Territory
  choiceKey?: string
  choiceIndex?: number
  choiceCount?: number
}

export type AiScorer = (game: Game, faction: Faction, move: AiMove) => number
export type AiSelector = (game: Game, faction: Faction, moves: AiMove[]) => AiMove | null
