import React, { useEffect, useRef, useState } from 'react'
import Game, { BattleResult, NATIONAL_PACT } from '../game/game'
import { Card } from '../game/faction'
import { FlagIcon, unitBreakdown } from './MapView'
import { t, tFaction, tTerritory, tCase } from '../i18n'

const DIE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']

const CARD_GLYPH: Record<Card, string> = { infantry: '♟', cavalry: '♞', cannon: '●' }

const PHASE_TITLE_KEYS: Record<string, string> = {
  reinforce: 'phase.reinforce',
  attack: 'phase.attack',
  fortify: 'phase.fortify',
  gameover: 'phase.gameover'
}

const PHASE_HELP_KEYS: Record<string, string> = {
  reinforce: 'phase.help.reinforce',
  attack: 'phase.help.attack',
  fortify: 'phase.help.fortify'
}

interface HudProps {
  game: Game
  selected: string | null
  fortifyTarget: string | null
  lastBattle: BattleResult | null
  onFortifyAmount: (amount: number) => void
  onAdvance: (amount: number) => void
  onCancelSelection: () => void
  onEndPhase: () => void
  onAutoPlace: () => void
  onTrade: () => void
  onAttackPress: () => void
  onAttackBlitz: () => void
  onPullBack: () => void
}

const Swatch = ({ faction }: { faction: string }) => <FlagIcon faction={faction} className="swatch" />

const UnitRow = ({ troops }: { troops: number }) => {
  const { cannonballs, cavalry, infantry } = unitBreakdown(troops)
  return (
    <span className="unit-row" title={`${cannonballs} cannonballs (10) · ${cavalry} cavalry (5) · ${infantry} infantry (1)`}>
      {cannonballs > 0 && <span className="unit">● {cannonballs}</span>}
      {cavalry > 0 && <span className="unit">♞ {cavalry}</span>}
      {infantry > 0 && <span className="unit">♟ {infantry}</span>}
    </span>
  )
}

const Hud = ({
  game,
  selected,
  fortifyTarget,
  lastBattle,
  onFortifyAmount,
  onAdvance,
  onCancelSelection,
  onEndPhase,
  onAutoPlace,
  onTrade,
  onAttackPress,
  onAttackBlitz,
  onPullBack
}: HudProps) => {
  const logRef = useRef<HTMLDivElement>(null)
  const actionsRef = useRef<HTMLDivElement>(null)
  // phone layout: the log rests as a two-line strip and expands on tap
  const [logOpen, setLogOpen] = useState(false)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [game.log.length, logOpen])

  // the phone log sits flush on top of the action sheet, whose height varies
  // with viewport width and content — measure it and expose it to CSS
  useEffect(() => {
    const el = actionsRef.current
    const apply = () =>
      document.documentElement.style.setProperty('--actions-h', `${el ? el.getBoundingClientRect().height : 0}px`)
    apply()
    if (!el) return
    const ro = new ResizeObserver(apply)
    ro.observe(el)
    return () => ro.disconnect()
  }, [game.phase])

  const human = game.currentPlayer.isHuman
  const humanFaction = game.humanPlayer.faction
  const fortifying = game.phase === 'fortify' && selected && fortifyTarget
  const fortifiesLeft = game.fortifyLimit - game.fortifiesUsed
  const maxMove = fortifying
    ? humanFaction.name === 'Greece'
      ? Math.floor((game.bySlug[selected].troops - 1) / 2)
      : game.bySlug[selected].troops - 1
    : 0
  const selectedTerritory = selected ? game.bySlug[selected] : null
  // a won battle waiting on how much of the assault force follows it in
  const advance = human ? game.pendingAdvance : null
  const lastRound = lastBattle?.rounds[lastBattle.rounds.length - 1]
  const canTrade = game.phase === 'reinforce' && human && game.findTradeSet(humanFaction.hand) !== null

  return (
    <>
      <header className="hud hud-brand">
        <h1>{t('brand.title')}</h1>
        <div className="hud-date">{t('hud.dateRound', { date: game.date, round: game.round })}</div>
      </header>

      <div className="hud hud-phase">
        <div className="hud-player">
          <Swatch faction={game.currentPlayer.faction.name} />
          <span>{game.currentPlayer.name}</span>
        </div>
        <div className={`hud-phase-title phase-${game.phase}`}>
          {t(PHASE_TITLE_KEYS[game.phase])}
          {human && game.phase === 'reinforce' && (
            <span className="hud-count"> · {game.reinforcementsLeft} {t('hud.left')}</span>
          )}
          {human && game.phase === 'fortify' && game.fortifyLimit > 1 && (
            <span className="hud-count"> · {fortifiesLeft} {t('hud.moves')}</span>
          )}
        </div>
        {game.requisitionActive && (
          <div className="hud-requisition" title={t('hud.requisitionTitle')}>
            ⚖️ {t('hud.requisition', { n: game.requisitionUntil - game.round + 1 })}
          </div>
        )}
        <div className="hud-pact">
          <span>
            {t('hud.pact')} {game.pactProgress}/{NATIONAL_PACT.length}
          </span>
          <div className="pact-bar">
            <div className="pact-fill" style={{ width: `${(100 * game.pactProgress) / NATIONAL_PACT.length}%` }} />
          </div>
        </div>
      </div>

      <aside className="hud hud-factions">
        {game.players.map(p => (
          <div
            key={p.faction.name}
            title={game.traitSummary(p.faction)}
            className={`chip${p.faction.eliminated ? ' eliminated' : ''}${p === game.currentPlayer ? ' active' : ''}`}
          >
            <Swatch faction={p.faction.name} />
            <span className="chip-name">{tFaction(p.faction.name)}</span>
            <span className="chip-stats">
              {p.faction.territories.length}⚑ {p.faction.troopTotal}⚔
              {game.isPassive(p.faction) && !p.faction.eliminated && <span className="chip-flag"> ☮</span>}
            </span>
          </div>
        ))}
      </aside>

      <div className={`hud hud-log${logOpen ? ' open' : ''}`} ref={logRef} onClick={() => setLogOpen(o => !o)}>
        {game.log.slice(-40).map((entry, i) => (
          <div key={i} className={`log-entry${entry.event ? ' log-event' : ''}`}>
            {!entry.event && <Swatch faction={entry.faction} />}
            <span>{entry.text}</span>
          </div>
        ))}
      </div>

      {game.phase !== 'gameover' && (
        <div className="hud hud-actions" ref={actionsRef}>
          {lastBattle && (
            <div className={`battle-report${lastBattle.pending ? ' pending' : lastBattle.conquered ? ' won' : ' lost'}`}>
              {lastRound && (
                <>
                  <span className="dice attacker">{lastRound.attackerDice.map(v => DIE[v - 1]).join(' ')}</span>
                  <span className="vs">vs</span>
                  <span className="dice defender">{lastRound.defenderDice.map(v => DIE[v - 1]).join(' ')}</span>
                </>
              )}
              <span className="battle-outcome">
                {lastBattle.pending
                  ? t('hud.battleTally', {
                      from: tTerritory(lastBattle.from.slug, lastBattle.from.name),
                      fromN: lastBattle.from.troops,
                      to: tTerritory(lastBattle.to.slug, lastBattle.to.name),
                      toN: lastBattle.to.troops,
                      atkLoss: lastBattle.attackerLosses,
                      defLoss: lastBattle.defenderLosses
                    })
                  : lastBattle.conquered
                    ? t('hud.falls', {
                        territory: tTerritory(lastBattle.to.slug, lastBattle.to.name),
                        atkLoss: lastBattle.attackerLosses,
                        defLoss: lastBattle.defenderLosses
                      })
                    : t('hud.repelled', {
                        territory: tTerritory(lastBattle.to.slug, lastBattle.to.name),
                        territoryLoc: tCase(tTerritory(lastBattle.to.slug, lastBattle.to.name), 'loc'),
                        atkLoss: lastBattle.attackerLosses,
                        defLoss: lastBattle.defenderLosses
                      })}
              </span>
              {lastBattle.pending && human && (
                <span className="battle-controls">
                  <button className="primary" onClick={onAttackPress}>
                    {t('hud.press')}
                  </button>
                  <button onClick={onAttackBlitz}>{t('hud.blitz')}</button>
                  <button onClick={onPullBack}>{t('hud.pullBack')}</button>
                </span>
              )}
            </div>
          )}

          {human ? (
            <div className="action-row">
              {humanFaction.hand.length > 0 && (
                <div className="card-hand" title={t('hud.cardHandTitle')}>
                  {humanFaction.hand.map((c, i) => (
                    <span key={i} className={`game-card card-${c}`}>
                      {CARD_GLYPH[c]}
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
                </div>
              )}
              <span className="hud-help">{advance ? t('hud.advanceHelp') : t(PHASE_HELP_KEYS[game.phase])}</span>
              {advance && (
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
              {!advance && game.phase === 'reinforce' && (
                <button className="primary" onClick={onAutoPlace}>
                  {t('hud.autoDeploy', { n: game.reinforcementsLeft })}
                </button>
              )}
              {!advance && game.phase === 'attack' && (
                <button className="primary" onClick={onEndPhase}>
                  {t('hud.endAttacks')}
                </button>
              )}
              {!advance && game.phase === 'fortify' && !fortifying && (
                <button className="primary" onClick={onEndPhase}>
                  {game.fortifiesUsed > 0 ? t('hud.endTurn') : t('hud.skipEndTurn')}
                </button>
              )}
              {!advance && fortifying && (
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
              <Swatch faction={game.currentPlayer.faction.name} />
              <span>{t('hud.aiThinking', { faction: tFaction(game.currentPlayer.faction.name) })}</span>
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default Hud
