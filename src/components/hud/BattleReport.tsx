import React from 'react'
import type Game from '../../game/game'
import type { BattleResult } from '../../game/types'
import { t, tCase, tTerritory } from '../../i18n'
import { DICE } from './HudPrimitives'

export const BattleReport = ({
  game,
  battle,
  onAttackPress,
  onAttackBlitz,
  onPullBack,
}: {
  game: Game
  battle: BattleResult
  onAttackPress: () => void
  onAttackBlitz: () => void
  onPullBack: () => void
}) => {
  const lastRound = battle.rounds[battle.rounds.length - 1]
  return (
    <div className={`battle-report${battle.pending ? ' pending' : battle.conquered ? ' won' : ' lost'}`}>
      {lastRound && (
        <>
          <span className="dice attacker">{lastRound.attackerDice.map((value) => DICE[value - 1]).join(' ')}</span>
          <span className="vs">vs</span>
          <span className="dice defender">{lastRound.defenderDice.map((value) => DICE[value - 1]).join(' ')}</span>
        </>
      )}
      <span className="battle-outcome">
        {battle.pending
          ? t('hud.battleTally', {
              from: tTerritory(battle.from.slug, battle.from.name),
              fromN: battle.from.troops,
              to: tTerritory(battle.to.slug, battle.to.name),
              toN: battle.to.troops,
              atkLoss: battle.attackerLosses,
              defLoss: battle.defenderLosses,
            })
          : battle.conquered
            ? t('hud.falls', {
                territory: tTerritory(battle.to.slug, battle.to.name),
                atkLoss: battle.attackerLosses,
                defLoss: battle.defenderLosses,
              })
            : t('hud.repelled', {
                territory: tTerritory(battle.to.slug, battle.to.name),
                territoryLoc: tCase(tTerritory(battle.to.slug, battle.to.name), 'loc'),
                atkLoss: battle.attackerLosses,
                defLoss: battle.defenderLosses,
              })}
      </span>
      {battle.pending && game.turn.currentPlayer.isHuman && (
        <span className="battle-controls">
          <button className="primary" onClick={onAttackPress}>
            {t('hud.press')}
          </button>
          <button onClick={onAttackBlitz}>{t('hud.blitz')}</button>
          <button onClick={onPullBack}>{t('hud.pullBack')}</button>
        </span>
      )}
    </div>
  )
}
