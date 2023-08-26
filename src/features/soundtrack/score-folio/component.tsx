import { TRACKS } from '../constants'
import { PauseIcon, PlayIcon } from '../transport-icons'
import type { SoundtrackCopy } from '../copy'
import { useSoundtrackCopy } from '../hooks'
import { SeekSlider } from '../seek-slider'
import type { SoundtrackPlayer } from '../types'
import { formatTime, trackNumber } from '../utils'

type FolioProperties = { player: SoundtrackPlayer; copy: SoundtrackCopy }

const TrackList = ({ player, copy }: FolioProperties) => (
  <ol className="track-list" id="tracks" aria-label={copy.listLabel}>
    {TRACKS.map((item, index) => (
      <li key={item.title} className={player.activeTrack === index ? 'active' : ''}>
        <button type="button" className="track-main" onClick={() => player.toggleTrack(index)}>
          <img className="track-art" src={item.art} style={{ objectPosition: item.pos }} alt="" loading="lazy" />
          <span className="track-number">{trackNumber(index)}</span>
          <span className="track-name">
            <b>{item.title}</b>
            <small>{copy.chapters.at(index)}</small>
          </span>
          <i aria-hidden="true">{player.activeTrack === index && player.playing ? <PauseIcon /> : <PlayIcon />}</i>
        </button>
        <a href={item.src} download aria-label={copy.downloadTrack(item.title)}>
          ↓
        </a>
      </li>
    ))}
  </ol>
)

const NowPlaying = ({ player, copy }: FolioProperties) => {
  const { track, activeTrack, playing, currentTime, duration } = player
  const chapter = copy.chapters.at(activeTrack)

  return (
    <aside className="score-now">
      <div className="score-cover">
        <img src={track.art} style={{ objectPosition: track.pos }} alt={copy.coverAlt(track.title)} />
        <span>
          {copy.brand[0]}
          <br />
          {copy.brand[1]}
        </span>
        <b>{trackNumber(activeTrack)}</b>
      </div>
      <p>
        {copy.nowPlaying} · {trackNumber(activeTrack)} / {TRACKS.length}
      </p>
      <h3>{track.title}</h3>
      <span className="score-chapter">{chapter}</span>
      <div className="score-controls">
        <button
          type="button"
          onClick={() => player.toggleTrack(activeTrack)}
          aria-label={playing ? copy.pause(track.title) : copy.play(track.title)}
        >
          {playing ? <PauseIcon /> : <PlayIcon />}
        </button>
        <div>
          <SeekSlider player={player} label={copy.seekLabel} />
          <p>
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </p>
        </div>
      </div>
      <a href={track.src} download>
        {copy.download} <span aria-hidden="true">↓</span>
      </a>
    </aside>
  )
}

export const ScoreFolio = ({ player }: { player: SoundtrackPlayer }) => {
  const copy = useSoundtrackCopy()

  return (
    <div className="score-shell reveal">
      <NowPlaying player={player} copy={copy} />
      <TrackList player={player} copy={copy} />
    </div>
  )
}
