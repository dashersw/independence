import { useState } from 'react'
import { gameOutcome } from '../../../game/outcome'
import { CAMPAIGN_EVENTS, HISTORICAL_EVENTS } from '../../../game/campaign-events'
import { restoreGame, snapshotGame } from '../../../game/snapshot'
import { t } from '../../../i18n'
import { loadSnapshot, saveGame } from '../../../saves'
import type { CardEntry } from '../../EventCard'
import { useAiTurns } from './useAiTurns'
import { useGameInteractions } from './useGameInteractions'
import { useGameRuntime } from './useGameRuntime'
import { useGameSounds } from './useGameSounds'

const eventOf = (eventId: string) => HISTORICAL_EVENTS.find((event) => event.id === eventId)

export const useGameSession = () => {
  const { game, ai, refresh } = useGameRuntime()
  const runAiTurns = useAiTurns(game, ai, refresh)
  const interaction = useGameInteractions(game, refresh, runAiTurns)
  const [started, setStarted] = useState(false)
  const [gameMounted, setGameMounted] = useState(false)
  const [mapReady, setMapReady] = useState(false)

  const decision = game.campaign.pendingDecision
  useGameSounds(game, !!decision, game.campaign.pendingCards.length)

  const entries: CardEntry[] = decision
    ? [
        {
          textKey: decision.id,
          faction: decision.actor ?? '',
          vars: CAMPAIGN_EVENTS.variables(decision, game, game.turn.round, game.campaign.retries[decision.id] ?? 0),
        },
      ]
    : game.campaign.pendingCards.map((key) => {
        const event = eventOf(key)
        return {
          textKey: key,
          faction: event?.actor ?? '',
          vars: event
            ? CAMPAIGN_EVENTS.variables(event, game, game.turn.round, game.campaign.retries[event.id] ?? 0)
            : undefined,
        }
      })

  const save = (name: string) => {
    try {
      saveGame({ name, round: game.turn.round, date: game.date, pact: game.pactProgress }, snapshotGame(game))
      return true
    } catch {
      return false
    }
  }

  const load = (id: string) => {
    const snapshot = loadSnapshot(id)
    if (!snapshot) return false
    try {
      restoreGame(game, snapshot)
    } catch {
      return false
    }
    interaction.resetInteraction()
    refresh()
    if (!game.turn.currentPlayer.isHuman && game.turn.phase !== 'gameover') runAiTurns()
    return true
  }

  return {
    game,
    started,
    gameMounted,
    mapReady,
    setStarted,
    setGameMounted,
    setMapReady,
    interaction,
    decision,
    entries,
    outcome: gameOutcome(game),
    save,
    load,
    defaultSaveName: () => t('menu.defaultSaveName', { date: game.date, pact: game.pactProgress }),
    dismissCards: () => {
      game.campaign.clearCards()
      refresh()
    },
    resolveDecision: (key: string) => {
      game.campaign.resolveDecision(key)
      refresh()
    },
  }
}
