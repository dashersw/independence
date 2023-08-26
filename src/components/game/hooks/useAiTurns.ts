import { useCallback } from 'react'
import type { AiTurnController } from '../../../ai/turn-controller'
import type Game from '../../../game/game'

const AI_TURN_DELAY = 600
const AI_ATTACK_DELAY = 300

export const useAiTurns = (game: Game, ai: AiTurnController, refresh: () => void) =>
  useCallback(() => {
    const step = () => {
      if (game.turn.phase === 'gameover' || game.turn.currentPlayer.isHuman) {
        refresh()
        return
      }
      ai.beginTurn()
      const turnId = game.turn.id
      refresh()
      const attackLoop = () => {
        if (!game.turn.isCurrent(turnId)) return
        if (game.turn.phase === 'gameover') {
          refresh()
          return
        }
        if (ai.attackStep()) {
          refresh()
          window.setTimeout(attackLoop, AI_ATTACK_DELAY)
        } else {
          ai.finishTurn()
          refresh()
          window.setTimeout(step, AI_TURN_DELAY)
        }
      }
      window.setTimeout(attackLoop, AI_ATTACK_DELAY)
    }
    window.setTimeout(step, AI_TURN_DELAY)
  }, [ai, game, refresh])
