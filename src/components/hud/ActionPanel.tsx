import React, { useEffect, useRef } from 'react'
import { t, tFaction, tTerritory } from '../../i18n'
import { BattleReport } from './BattleReport'
import { CARD_GLYPH, PHASE_HELP_KEYS, Swatch, UnitRow } from './HudPrimitives'
import type { HudProps } from './types'

export const ActionPanel = ({
  game,
  selected,
  fortifyTarget,
  lastBattle,
  onFortifyAmount,
  onAdvance,
  onLandingResolve,
  onCancelSelection,
  onEndPhase,
  onAutoPlace,
  onTrade,
  onAttackPress,
  onAttackBlitz,
  onPullBack,
}: HudProps) => {
  const actionsRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const element = actionsRef.current
    const apply = () =>
      document.documentElement.style.setProperty(
        '--actions-h',
        `${element ? element.getBoundingClientRect().height : 0}px`,
      )
    apply()
    if (!element) return
    const observer = new ResizeObserver(apply)
    observer.observe(element)
    return () => observer.disconnect()
  }, [game.turn.phase])

  if (game.turn.phase === 'gameover') return null

  const human = game.turn.currentPlayer.isHuman
  const humanFaction = game.humanPlayer.faction
  const fortifying = game.turn.phase === 'fortify' && selected && fortifyTarget
  const maxMove = fortifying
    ? humanFaction.name === 'Greece'
      ? Math.floor((game.bySlug[selected].troops - 1) / 2)
      : game.bySlug[selected].troops - 1
    : 0
  const selectedTerritory = selected ? game.bySlug[selected] : null
  const selectedAdvanceDepth = selected ? game.turn.advanceDepth(selected) : 0
  const advance = human ? game.combat.pendingAdvance : null
  const landing = human ? (game.movement.pendingLandings[0] ?? null) : null
  const canTrade = !landing && game.turn.phase === 'reinforce' && human && game.findTradeSet(humanFaction.hand) !== null
  const phaseHelp =
    game.turn.phase === 'attack'
      ? t(PHASE_HELP_KEYS.attack, { attacks: game.turn.attackLimit })
      : t(PHASE_HELP_KEYS[game.turn.phase])

  return (
    <div className="hud hud-actions" ref={actionsRef}>
      {lastBattle && (
        <BattleReport
          game={game}
          battle={lastBattle}
          onAttackPress={onAttackPress}
          onAttackBlitz={onAttackBlitz}
          onPullBack={onPullBack}
        />
      )}

      {human ? (
        <div className="action-row">
          {humanFaction.hand.length > 0 && (
            <div className="card-hand" title={t('hud.cardHandTitle')}>
              {humanFaction.hand.map((card, index) => (
                <span key={index} className={`game-card card-${card}`}>
                  {CARD_GLYPH[card]}
                </span>
              ))}
              {canTrade && (
                <button className="primary" onClick={onTrade}>
                  {t('hud.trade', { n: game.pendingTradeBonus })}
                </button>
              )}
            </div>
          )}
          {selectedTerritory && (
            <div className="selection">
              <strong>{tTerritory(selectedTerritory.slug, selectedTerritory.name)}</strong>
              <UnitRow troops={selectedTerritory.troops} />
              {game.turn.phase === 'attack' && selectedAdvanceDepth > 0 && (
                <span className="hud-count">
                  {t('hud.advanceDepth', {
                    current: selectedAdvanceDepth,
                  })}
                </span>
              )}
            </div>
          )}
          <span className="hud-help">
            {landing ? t('hud.landingHelp') : advance ? t('hud.advanceHelp') : phaseHelp}
          </span>
          {landing && (
            <div className="fortify-row">
              <span>{tTerritory(game.bySlug[landing.to].slug, game.bySlug[landing.to].name)}</span>
              <button className="primary" onClick={() => onLandingResolve(true)}>
                {t('hud.landingStorm', {
                  territory: tTerritory(game.bySlug[landing.to].slug, game.bySlug[landing.to].name),
                })}
              </button>
              <button onClick={() => onLandingResolve(false)}>
                {t('hud.landingFallBack', {
                  territory: tTerritory(game.bySlug[landing.from].slug, game.bySlug[landing.from].name),
                })}
              </button>
            </div>
          )}
          {!landing && advance && (
            <div className="fortify-row">
              <span>
                {tTerritory(game.bySlug[advance.from].slug, game.bySlug[advance.from].name)} →{' '}
                {tTerritory(game.bySlug[advance.to].slug, game.bySlug[advance.to].name)}
              </span>
              <button onClick={() => onAdvance(advance.min)}>{advance.min}</button>
              <button onClick={() => onAdvance(Math.max(advance.min, Math.round(advance.max / 2)))}>
                {t('hud.half')}
              </button>
              <button className="primary" onClick={() => onAdvance(advance.max)}>
                {t('hud.all', { n: advance.max })}
              </button>
            </div>
          )}
          {!landing && !advance && game.turn.phase === 'reinforce' && (
            <button className="primary" onClick={onAutoPlace}>
              {t('hud.autoDeploy', { n: game.turn.reinforcementsLeft })}
            </button>
          )}
          {!landing && !advance && game.turn.phase === 'attack' && (
            <button className="primary" onClick={onEndPhase}>
              {t('hud.endAttacks')}
            </button>
          )}
          {!landing && !advance && game.turn.phase === 'fortify' && !fortifying && (
            <button className="primary" onClick={onEndPhase}>
              {game.turn.fortifiesUsed > 0 ? t('hud.endTurn') : t('hud.skipEndTurn')}
            </button>
          )}
          {!landing && !advance && fortifying && (
            <div className="fortify-row">
              <span>
                {tTerritory(game.bySlug[selected].slug, game.bySlug[selected].name)} →{' '}
                {tTerritory(game.bySlug[fortifyTarget].slug, game.bySlug[fortifyTarget].name)}
                {humanFaction.name === 'Greece' && <em> {t('hud.halfMax')}</em>}
              </span>
              <button onClick={() => onFortifyAmount(1)}>1</button>
              <button onClick={() => onFortifyAmount(Math.max(1, Math.floor(maxMove / 2)))}>{t('hud.half')}</button>
              <button className="primary" onClick={() => onFortifyAmount(maxMove)}>
                {t('hud.all', { n: maxMove })}
              </button>
              <button onClick={onCancelSelection}>✕</button>
            </div>
          )}
        </div>
      ) : (
        <div className="action-row ai-thinking">
          <Swatch faction={game.turn.currentPlayer.faction.name} />
          <span>{t('hud.aiThinking', { faction: tFaction(game.turn.currentPlayer.faction.name) })}</span>
        </div>
      )}
    </div>
  )
}
