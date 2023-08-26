import React, { useEffect, useRef, useState } from 'react'
import type Game from '../../game/game'
import { renderLogEntry } from '../../game/log'
import { Swatch } from './HudPrimitives'

export const GameLog = ({ game }: { game: Game }) => {
  const logRef = useRef<HTMLDivElement>(null)
  const [open, setOpen] = useState(false)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [game.log.length, open])

  return (
    <div className={`hud hud-log${open ? ' open' : ''}`} ref={logRef} onClick={() => setOpen((value) => !value)}>
      {game.log.slice(-40).map((entry, index) => (
        <div key={index} className={`log-entry${entry.event ? ' log-event' : ''}`}>
          {!entry.event && <Swatch faction={entry.faction} />}
          <span>{renderLogEntry(entry)}</span>
        </div>
      ))}
    </div>
  )
}
