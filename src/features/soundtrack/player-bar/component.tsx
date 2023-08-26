import { TRACKS } from '../constants'
import { PauseIcon, PlayIcon } from '../transport-icons'
import type { SoundtrackCopy } from '../copy'
import { useSoundtrackCopy } from '../hooks'
import { SeekSlider } from '../seek-slider'
import type { SoundtrackPlayer } from '../types'
import { formatTime, trackNumber } from '../utils'

type BarProperties = { player: SoundtrackPlayer; copy: SoundtrackCopy }

const Transport = ({ player, copy }: BarProperties) => {
  const { track, activeTrack, playing } = player

  return (
    <div className="pb-controls">
      <button type="button" onClick={player.previousTrack} aria-label={copy.previous}>
        ‹‹
      </button>
      <button
        type="button"
        className="pb-play"
        onClick={() => player.toggleTrack(activeTrack)}
        aria-label={playing ? copy.pause(track.title) : copy.play(track.title)}
      >
        {playing ? <PauseIcon /> : <PlayIcon />}
      </button>
      <button type="button" onClick={player.nextTrack} aria-label={copy.next}>
        ››
      </button>
    </div>
  )
}

export const PlayerBar = ({ player, visible }: { player: SoundtrackPlayer; visible: boolean }) => {
  const copy = useSoundtrackCopy()
  const { track, activeTrack, currentTime, duration } = player

  return (
    <div className={`player-bar${visible ? ' on' : ''}`} role="region" aria-label={copy.playerLabel}>
      <Transport player={player} copy={copy} />

      <a className="pb-info" href="#soundtrack">
        <img className="pb-art" src={track.art} style={{ objectPosition: track.pos }} alt="" />
        <span>
          <b>{track.title}</b>
          <small>
            {trackNumber(activeTrack)} / {TRACKS.length} · {copy.chapters.at(activeTrack)}
          </small>
        </span>
      </a>

      <div className="pb-seek">
        <span>{formatTime(currentTime)}</span>
        <SeekSlider player={player} label={copy.seekLabel} />
        <span>{formatTime(duration)}</span>
      </div>
    </div>
  )
}
