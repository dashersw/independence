import React from 'react'
import type Game from '../../game/game'
import { tFaction } from '../../i18n'
import { Swatch } from './HudPrimitives'

export const FactionRail = ({ game }: { game: Game }) => (
  <aside className="hud hud-factions">
    {game.players.map((player) => (
      <div
        key={player.faction.name}
        title={game.traitSummary(player.faction)}
        className={`chip${player.faction.eliminated ? ' eliminated' : ''}${player === game.turn.currentPlayer ? ' active' : ''}`}
      >
        <Swatch faction={player.faction.name} />
        <span className="chip-name">{tFaction(player.faction.name)}</span>
        <span className="chip-stats">
          {player.faction.territories.length}⚑ {player.faction.troopTotal}⚔
          {game.campaign.isPassive(player.faction) && !player.faction.eliminated && (
            <span className="chip-flag"> ☮</span>
          )}
        </span>
      </div>
    ))}
  </aside>
)
