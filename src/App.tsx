import React, { useCallback, useEffect, useRef, useState } from 'react'
import Game, { BattleResult, HISTORICAL_EVENTS } from './game/game'
import MapView, { FlagIcon } from './components/MapView'
import Hud from './components/Hud'
import EventCard, { CardEntry } from './components/EventCard'
import SettingsMenu from './components/SettingsMenu'
import IntroScreen from './components/IntroScreen'
import { t, onLangChange } from './i18n'
import { loadSnapshot, saveGame } from './saves'
import { makeScorer, makeSelector } from './ai/policy'
import { MODELS } from './ai/models'

const AI_TURN_DELAY = 600
// pause between individual AI attacks so battles are followable step by step
const AI_ATTACK_DELAY = 300

// Exposed for headless simulation / debugging in the console.
if (typeof window !== 'undefined') (window as any).Game = Game

const eventOf = (textKey: string) => HISTORICAL_EVENTS.find(e => e.textKey === textKey)

const App = () => {
  const gameRef = useRef<Game>()
  if (!gameRef.current) gameRef.current = new Game()
  const game = gameRef.current

  const [, setVersion] = useState(0)
  const [started, setStarted] = useState(false)
  const [gameMounted, setGameMounted] = useState(false)
  const [mapReady, setMapReady] = useState(false)
  const [selected, setSelected] = useState<string | null>(null)
  const [fortifyTarget, setFortifyTarget] = useState<string | null>(null)
  const [lastBattle, setLastBattle] = useState<BattleResult | null>(null)
  const refresh = () => setVersion(v => v + 1)

  // a language switch re-renders the whole tree (territory/faction names,
  // phase copy, map labels) rather than needing a context provider
  useEffect(() => onLangChange(refresh), [])

  const clearSelection = () => {
    setSelected(null)
    setFortifyTarget(null)
  }

  // The AI factions play from their trained models rather than the engine's
  // heuristics; each has its own, learned against its own war aims.
  useEffect(() => {
    game.aiScorer = makeScorer(MODELS)
    game.aiSelector = makeSelector(MODELS)
  }, [game])

  const runAiTurns = useCallback(() => {
    const step = () => {
      if (game.phase === 'gameover' || game.currentPlayer.isHuman) {
        refresh()
        return
      }
      game.aiBeginTurn()
      refresh()
      const attackLoop = () => {
        if (game.phase === 'gameover') {
          refresh()
          return
        }
        if (game.aiAttackStep()) {
          refresh()
          setTimeout(attackLoop, AI_ATTACK_DELAY)
        } else {
          game.aiFinishTurn()
          refresh()
          setTimeout(step, AI_TURN_DELAY)
        }
      }
      setTimeout(attackLoop, AI_ATTACK_DELAY)
    }
    setTimeout(step, AI_TURN_DELAY)
  }, [game])

  const endPhase = () => {
    const wasFortify = game.phase === 'fortify'
    game.endPhase()
    clearSelection()
    if (game.phase !== 'attack') setLastBattle(null)
    refresh()
    if (wasFortify) runAiTurns()
  }

  const humanFaction = game.humanPlayer.faction

  const targets: string[] = (() => {
    if (!selected || !game.currentPlayer.isHuman) return []
    const from = game.bySlug[selected]
    // the engine decides what is a legal order; the map only draws it
    if (game.phase === 'attack') return game.attackTargets(selected)
    if (game.phase === 'fortify' && !fortifyTarget)
      return [
        ...from.adjacent.filter(t => t.faction === humanFaction).map(t => t.slug),
        ...game.seaTargets(selected)
      ]
    return []
  })()

  const onTerritoryClick = (slug: string) => {
    if (!game.currentPlayer.isHuman || game.phase === 'gameover') return
    const territory = game.bySlug[slug]

    if (game.phase === 'reinforce') {
      game.placeReinforcement(slug)
      refresh()
      return
    }

    if (game.phase === 'attack') {
      if (territory.faction === humanFaction) {
        setSelected(territory.troops > 1 ? slug : null)
        return
      }
      if (selected && targets.includes(slug)) {
        // clicking only stages the fight — no dice until the player presses
        const result = game.beginAttack(selected, slug)
        if (result) setLastBattle(result)
        refresh()
      }
      return
    }

    if (game.phase === 'fortify') {
      if (game.fortifiesUsed >= game.fortifyLimit) return
      if (territory.faction !== humanFaction) return
      if (!selected) {
        if (territory.troops > 1) setSelected(slug)
        return
      }
      if (slug === selected) {
        clearSelection()
        return
      }
      if (targets.includes(slug)) setFortifyTarget(slug)
      else if (territory.troops > 1) setSelected(slug)
    }
  }

  // one more exchange in the running battle
  const onAttackPress = () => {
    if (!lastBattle) return
    const result = game.attackRound(lastBattle.from.slug, lastBattle.to.slug)
    if (result) setLastBattle(result)
    if (game.bySlug[lastBattle.from.slug].troops < 2) setSelected(null)
    refresh()
  }

  // roll to the end in one go
  const onAttackBlitz = () => {
    if (!lastBattle) return
    const result = game.attack(lastBattle.from.slug, lastBattle.to.slug)
    if (result) setLastBattle(result)
    if (game.bySlug[lastBattle.from.slug].troops < 2) setSelected(null)
    refresh()
  }

  // stop the fight, keeping surviving troops where they are
  const onPullBack = () => {
    game.pullBack()
    setLastBattle(null)
    refresh()
  }

  const onFortifyAmount = (amount: number) => {
    if (selected && fortifyTarget) {
      // a target across water is a crossing, not a march
      if (game.bySlug[selected].isAdjacentTo(game.bySlug[fortifyTarget])) game.fortify(selected, fortifyTarget, amount)
      else game.embark(selected, fortifyTarget, amount)
      clearSelection()
      refresh()
    }
  }

  const onAdvance = (amount: number) => {
    game.advance(amount)
    refresh()
  }

  const onAutoPlace = () => {
    game.autoPlaceReinforcements()
    refresh()
  }

  const onTrade = () => {
    game.tradeCards(game.humanPlayer.faction)
    refresh()
  }

  const outcome = game.outcome
  // a decision outranks queued notices — it has to be answered either way. Any
  // other notices that landed this turn are shown together on one card.
  const decision = game.pendingDecision
  const entries: CardEntry[] = decision
    ? [{ textKey: decision.textKey, faction: decision.faction, vars: decision.vars?.(game) }]
    : game.pendingCards.map(key => {
        const event = eventOf(key)
        return { textKey: key, faction: event?.faction ?? '', vars: event?.vars?.(game) }
      })

  return (
    <div className="app">
      {gameMounted && (
        <>
          <MapView
            territories={game.territories}
            selected={selected}
            targets={targets}
            convoys={game.convoys}
            round={game.round}
            onTerritoryClick={onTerritoryClick}
            onReady={() => setMapReady(true)}
          />
          <Hud
            game={game}
            selected={selected}
            fortifyTarget={fortifyTarget}
            lastBattle={lastBattle}
            onFortifyAmount={onFortifyAmount}
            onAdvance={onAdvance}
            onCancelSelection={clearSelection}
            onEndPhase={endPhase}
            onAutoPlace={onAutoPlace}
            onTrade={onTrade}
            onAttackPress={onAttackPress}
            onAttackBlitz={onAttackBlitz}
            onPullBack={onPullBack}
          />
          <SettingsMenu
            onSave={name => {
              try {
                saveGame(
                  { name, round: game.round, date: game.date, pact: game.pactProgress },
                  game.serialize()
                )
                return true
              } catch {
                return false
              }
            }}
            onLoad={id => {
              const snap = loadSnapshot(id)
              if (!snap) return false
              try {
                game.restore(snap)
              } catch {
                return false
              }
              clearSelection()
              setLastBattle(null)
              refresh()
              // a loaded game may resume on an AI seat — hand the turn back to them
              if (!game.currentPlayer.isHuman && game.phase !== 'gameover') runAiTurns()
              return true
            }}
            defaultSaveName={() => t('menu.defaultSaveName', { date: game.date, pact: game.pactProgress })}
          />
          {entries.length > 0 && game.phase !== 'gameover' && (
            <EventCard
              entries={entries}
              choices={decision?.choices}
              onDismiss={() => {
                game.clearEventCards()
                refresh()
              }}
              onChoose={key => {
                game.resolveDecision(key)
                refresh()
              }}
            />
          )}
          {outcome && (
            <div className="overlay">
              <div className="overlay-card">
                <h2>
                  {t(outcome.titleKey)}
                  {game.winner && <FlagIcon faction="Turkey" className="victory-flag" />}
                </h2>
                <p>{t(outcome.bodyKey, outcome.vars)}</p>
                <button className="primary" onClick={() => window.location.reload()}>
                  {t('overlay.playAgain')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
      {!started && (
        <IntroScreen
          onStart={() => setGameMounted(true)}
          onBegin={() => setStarted(true)}
          mapReady={mapReady}
        />
      )}
    </div>
  )
}

export default App
