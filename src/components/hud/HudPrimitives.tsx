import React from 'react'
import type { Card } from '../../game/faction'
import { FlagIcon, unitBreakdown } from '../map-flags'

export const DICE = ['⚀', '⚁', '⚂', '⚃', '⚄', '⚅']
export const CARD_GLYPH: Record<Card, string> = { infantry: '♟', cavalry: '♞', cannon: '●' }

export const PHASE_TITLE_KEYS: Record<string, string> = {
  reinforce: 'phase.reinforce',
  attack: 'phase.attack',
  fortify: 'phase.fortify',
  gameover: 'phase.gameover',
}

export const PHASE_HELP_KEYS: Record<string, string> = {
  reinforce: 'phase.help.reinforce',
  attack: 'phase.help.attack',
  fortify: 'phase.help.fortify',
}

export const Swatch = ({ faction }: { faction: string }) => <FlagIcon faction={faction} className="swatch" />

export const UnitRow = ({ troops }: { troops: number }) => {
  const { cannonballs, cavalry, infantry } = unitBreakdown(troops)
  return (
    <span
      className="unit-row"
      title={`${cannonballs} cannonballs (10) · ${cavalry} cavalry (5) · ${infantry} infantry (1)`}
    >
      {cannonballs > 0 && <span className="unit">● {cannonballs}</span>}
      {cavalry > 0 && <span className="unit">♞ {cavalry}</span>}
      {infantry > 0 && <span className="unit">♟ {infantry}</span>}
    </span>
  )
}
