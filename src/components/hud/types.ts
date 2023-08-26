import type Game from '../../game/game'
import type { BattleResult } from '../../game/types'

export interface HudProps {
  game: Game
  selected: string | null
  fortifyTarget: string | null
  lastBattle: BattleResult | null
  onFortifyAmount: (amount: number) => void
  onAdvance: (amount: number) => void
  onLandingResolve: (assault: boolean) => void
  onCancelSelection: () => void
  onEndPhase: () => void
  onAutoPlace: () => void
  onTrade: () => void
  onAttackPress: () => void
  onAttackBlitz: () => void
  onPullBack: () => void
}
