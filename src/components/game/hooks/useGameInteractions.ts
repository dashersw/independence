import { useState } from 'react'
import type Game from '../../../game/game'
import type { BattleResult } from '../../../game/types'
import { playSound } from '../../../sounds'
import { fortifyTargets, resolveFortifyClick } from './fortify-selection'

export const useGameInteractions = (game: Game, refresh: () => void, runAiTurns: () => void) => {
  const [selected, setSelected] = useState<string | null>(null)
  const [fortifyTarget, setFortifyTarget] = useState<string | null>(null)
  const [lastBattle, setLastBattle] = useState<BattleResult | null>(null)

  const clearSelection = () => {
    setSelected(null)
    setFortifyTarget(null)
  }

  const resetInteraction = () => {
    clearSelection()
    setLastBattle(null)
  }

  // A landing awaiting the player's storm-or-turn-back call blocks the rest of the turn.
  const landingPending = () => game.turn.currentPlayer.isHuman && game.movement.pendingLandings.length > 0

  const endPhase = () => {
    if (landingPending()) return
    const wasFortify = game.turn.phase === 'fortify'
    game.turn.advancePhase()
    playSound('uiClick')
    clearSelection()
    if (game.turn.phase !== 'attack') setLastBattle(null)
    refresh()
    if (wasFortify) runAiTurns()
  }

  const finishAttackPhaseIfSpent = () => {
    if (!game.turn.finishAttackPhaseIfSpent()) return false
    clearSelection()
    setLastBattle(null)
    return true
  }

  const humanFaction = game.humanPlayer.faction
  const targets: string[] = (() => {
    if (!selected || !game.turn.currentPlayer.isHuman) return []
    if (game.turn.phase === 'attack') return game.combat.targets(selected)
    // The chosen destination wears a marker of its own, so it drops out of the
    // target list: the rest stay lit and stay clickable, which is how the
    // player redirects a transfer without giving up the source.
    return fortifyTargets(game, selected).filter((slug) => slug !== fortifyTarget)
  })()

  const onTerritoryClick = (slug: string) => {
    if (!game.turn.currentPlayer.isHuman || game.turn.phase === 'gameover' || landingPending()) return
    const territory = game.bySlug[slug]

    if (game.turn.phase === 'reinforce') {
      game.turn.placeReinforcements(slug)
      playSound('reinforcePlace')
      refresh()
      return
    }

    if (game.turn.phase === 'attack') {
      if (territory.faction === humanFaction) {
        if (slug !== selected) {
          game.combat.cancel()
          setLastBattle(null)
          if (finishAttackPhaseIfSpent()) {
            refresh()
            return
          }
        }
        const canAttackFrom = territory.troops > 1
        setSelected(canAttackFrom ? slug : null)
        if (canAttackFrom) playSound('select')
        return
      }
      if (selected && targets.includes(slug)) {
        const result = game.combat.begin(selected, slug)
        if (result) setLastBattle(result)
        refresh()
      }
      return
    }

    if (game.turn.phase !== 'fortify') return
    const next = resolveFortifyClick(game, { selected, fortifyTarget }, slug)
    if (next.selected !== selected) {
      setSelected(next.selected)
      if (next.selected) playSound('select')
    }
    if (next.fortifyTarget !== fortifyTarget) setFortifyTarget(next.fortifyTarget)
  }

  const onAttackPress = () => {
    if (!lastBattle) return
    playSound('battleExchange')
    const result = game.combat.step(lastBattle.from.slug, lastBattle.to.slug)
    if (result) setLastBattle(result)
    if (game.bySlug[lastBattle.from.slug].troops < 2) setSelected(null)
    finishAttackPhaseIfSpent()
    refresh()
  }

  const onAttackBlitz = () => {
    if (!lastBattle) return
    playSound('battleBlitz')
    const result = game.combat.blitz(lastBattle.from.slug, lastBattle.to.slug)
    if (result) setLastBattle(result)
    if (game.bySlug[lastBattle.from.slug].troops < 2) setSelected(null)
    finishAttackPhaseIfSpent()
    refresh()
  }

  const onPullBack = () => {
    game.combat.pullBack()
    playSound('pullBack')
    setLastBattle(null)
    finishAttackPhaseIfSpent()
    refresh()
  }

  const onFortifyAmount = (amount: number) => {
    if (!selected || !fortifyTarget) return
    if (game.bySlug[selected].isAdjacentTo(game.bySlug[fortifyTarget])) {
      game.movement.fortify(selected, fortifyTarget, amount)
      playSound('fortify')
    } else {
      // embark records log.embark; the observer voices it.
      game.movement.embark(selected, fortifyTarget, amount)
    }
    clearSelection()
    refresh()
  }

  const onAdvance = (amount: number) => {
    game.combat.advance(amount)
    playSound('uiClick')
    finishAttackPhaseIfSpent()
    refresh()
  }

  const onLandingResolve = (assault: boolean) => {
    game.movement.resolveLanding(assault)
    refresh()
  }

  const onAutoPlace = () => {
    if (landingPending()) return
    game.reinforcements.autoPlace()
    playSound('reinforcePlace')
    refresh()
  }

  const onTrade = () => {
    game.tradeCards(game.humanPlayer.faction)
    refresh()
  }

  return {
    selected,
    fortifyTarget,
    lastBattle,
    targets,
    clearSelection,
    resetInteraction,
    endPhase,
    onTerritoryClick,
    onAttackPress,
    onAttackBlitz,
    onPullBack,
    onFortifyAmount,
    onAdvance,
    onLandingResolve,
    onAutoPlace,
    onTrade,
  }
}
