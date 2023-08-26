import { useEffect, useRef } from 'react'
import type Game from '../../../game/game'
import type { LogEntry } from '../../../game/types'
import { playSound, type SoundName } from '../../../sounds'

// Which log keys speak, and with what. The log is the game's single event
// stream — every meaningful thing already calls game.record() — so listening
// here catches the player's battles and movements without threading a play()
// call through every engine site. Only the human's own turn is voiced: the AI
// grinding through its conquests and retreats plays out silently. Keys not
// listed are silent by design.
const LOG_SOUNDS: Record<string, SoundName> = {
  'log.captured': 'conquest',
  'log.knockedOut': 'elimination',
  'log.turkeyFallen': 'elimination',
  'log.tradeCards': 'cardTrade',
  'log.embark': 'embark',
  'log.landing': 'landings',
  'log.landingUnopposed': 'landings',
  'log.convoyLanded': 'landings',
  'log.landingRepelled': 'pullBack',
  'log.repelled': 'pullBack',
  'log.convoyTurnedBack': 'pullBack',
  'log.convoyReturned': 'pullBack',
}

// Reads the game's log/turn/card state after each render and fires the matching
// effects for whatever is new since last time. Purely observational — it never
// touches game state, so it composes cleanly alongside the interaction hook,
// which handles the immediate UI one-shots (select, exchange, fortify) that
// leave no log entry.
export const useGameSounds = (game: Game, hasDecision: boolean, historicalCards: number) => {
  // Track the last log entry we spoke to by reference: the log is capped and
  // spliced from the front, so a length counter drifts, but the object identity
  // survives — indexOf finds where we left off.
  const lastEntry = useRef<LogEntry | null>(null)
  const primed = useRef(false)
  const wasHumanTurn = useRef(false)
  const hadDecision = useRef(false)
  const historicalSeen = useRef(0)

  // No dependency array: this runs after every commit, matching the version
  // bumps the game loop drives, so each human action and AI step is inspected
  // once, in order.
  useEffect(() => {
    const log = game.log

    if (!primed.current) {
      // First pass after mount (or a load): adopt the current state as the
      // baseline so we don't replay a game's worth of history in one burst.
      primed.current = true
      lastEntry.current = log[log.length - 1] ?? null
      wasHumanTurn.current = game.turn.currentPlayer.isHuman
      hadDecision.current = hasDecision
      historicalSeen.current = historicalCards
      return
    }

    const humanTurn = game.turn.currentPlayer.isHuman && game.turn.phase !== 'gameover'

    // Battle and movement effects belong to the player's own turn. During AI
    // turns we still advance the pointer (so these entries never replay later)
    // but stay silent.
    if (humanTurn) {
      const start = lastEntry.current ? log.indexOf(lastEntry.current) + 1 : 0
      for (let i = start; i < log.length; i++) {
        const sound = LOG_SOUNDS[log[i].key]
        if (sound) playSound(sound)
      }
    }
    lastEntry.current = log[log.length - 1] ?? null

    // A decision card sliding in, or fresh historical cards being dealt.
    if (hasDecision && !hadDecision.current) playSound('decisionCard')
    else if (historicalCards > historicalSeen.current) playSound('cardDraw')
    hadDecision.current = hasDecision
    historicalSeen.current = historicalCards

    // The moment control returns to the player.
    if (humanTurn && !wasHumanTurn.current) playSound('yourTurn')
    wasHumanTurn.current = humanTurn
  })
}
