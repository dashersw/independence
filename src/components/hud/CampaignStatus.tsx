import React from 'react'
import { CAMPAIGN_EVENTS } from '../../game/campaign-events'
import { NATIONAL_PACT } from '../../game/campaign-data'
import type Game from '../../game/game'
import { t } from '../../i18n'
import { PHASE_TITLE_KEYS, Swatch } from './HudPrimitives'

export const CampaignStatus = ({ game }: { game: Game }) => {
  const human = game.turn.currentPlayer.isHuman
  const fortifiesLeft = game.campaign.fortifyLimit - game.turn.fortifiesUsed
  const requisitionUntil = Number(CAMPAIGN_EVENTS.variable(game, 'tekalif.until'))

  return (
    <>
      <header className="hud hud-brand">
        <h1>{t('brand.title')}</h1>
        <div className="hud-date">{t('hud.dateRound', { date: game.date, round: game.turn.round })}</div>
      </header>

      <div className="hud hud-phase">
        <div className="hud-player">
          <Swatch faction={game.turn.currentPlayer.faction.name} />
          <span>{game.turn.currentPlayer.name}</span>
        </div>
        <div className={`hud-phase-title phase-${game.turn.phase}`}>
          {t(PHASE_TITLE_KEYS[game.turn.phase])}
          {human && game.turn.phase === 'reinforce' && (
            <span className="hud-count">
              {' '}
              · {game.turn.reinforcementsLeft} {t('hud.left')}
            </span>
          )}
          {human && game.turn.phase === 'attack' && (
            <span className="hud-count">
              {' '}
              · {game.turn.attacksLeft} {t('hud.attacks')}
            </span>
          )}
          {human && game.turn.phase === 'fortify' && game.campaign.fortifyLimit > 1 && (
            <span className="hud-count">
              {' '}
              · {fortifiesLeft} {t('hud.moves')}
            </span>
          )}
        </div>
        {game.turn.round <= requisitionUntil && (
          <div className="hud-requisition" title={t('hud.requisitionTitle')}>
            ⚖️ {t('hud.requisition', { n: requisitionUntil - game.turn.round + 1 })}
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
    </>
  )
}
