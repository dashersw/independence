import type { CSSProperties } from 'react'
import type { SoundtrackPlayer } from '../types'
import { seekProgress } from '../utils'

export const SeekSlider = ({ player, label }: { player: SoundtrackPlayer; label: string }) => {
  const { currentTime, duration } = player

  return (
    <input
      aria-label={label}
      type="range"
      min="0"
      max={duration || 0}
      value={Math.min(currentTime, duration || 0)}
      onChange={(event) => player.seek(Number(event.target.value))}
      style={{ '--progress': seekProgress(currentTime, duration) } as CSSProperties}
    />
  )
}
