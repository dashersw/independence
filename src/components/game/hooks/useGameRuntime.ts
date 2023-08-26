import { useCallback, useEffect, useRef, useState } from 'react'
import { AiTurnController } from '../../../ai/turn-controller'
import { MODELS } from '../../../ai/models'
import { makeScorer, makeSelector } from '../../../ai/policy'
import Game from '../../../game/game'
import { onLangChange } from '../../../i18n'
import { startMusic } from '../../../music'
import { initSounds } from '../../../sounds'

// Exposed for headless simulation and console debugging.
if (typeof window !== 'undefined') (window as Window & { Game?: typeof Game }).Game = Game

export const useGameRuntime = () => {
  const gameRef = useRef<Game>()
  if (!gameRef.current) gameRef.current = new Game()
  const game = gameRef.current

  const aiRef = useRef<AiTurnController>()
  if (!aiRef.current)
    aiRef.current = new AiTurnController(game, { scorer: makeScorer(MODELS), selector: makeSelector(MODELS) })

  const [, setVersion] = useState(0)
  const refresh = useCallback(() => setVersion((version) => version + 1), [])

  useEffect(() => onLangChange(refresh), [refresh])
  useEffect(() => {
    startMusic()
    initSounds()
  }, [])

  return { game, ai: aiRef.current, refresh }
}
