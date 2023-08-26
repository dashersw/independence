import React, { useEffect, useReducer, useRef } from 'react'

// One shared registry so starting any player pauses all the others.
const allAudio = new Set()

const fmtTime = t => {
  if (!isFinite(t)) return '–'
  if (t < 60) return `${t.toFixed(1)}s`
  return `${Math.floor(t / 60)}:${String(Math.round(t % 60)).padStart(2, '0')}`
}

const PlayIcon = () => (
  <svg viewBox="0 0 16 16" width="11" height="11">
    <path fill="currentColor" d="M3 1.5v13l11-6.5z" />
  </svg>
)
const PauseIcon = () => (
  <svg viewBox="0 0 16 16" width="11" height="11">
    <path fill="currentColor" d="M3 1.5h4v13H3zM9 1.5h4v13H9z" />
  </svg>
)

/** Themed audio player: total duration up front (metadata preload), click-to-seek,
 *  one-at-a-time playback. The Audio object lives in a ref, so React re-renders
 *  never interrupt playback — keep the component keyed by its file identity. */
export default function Player({ src, small }) {
  const audioRef = useRef(null)
  const barRef = useRef(null)
  const [, repaint] = useReducer(x => x + 1, 0)

  if (!audioRef.current) {
    const a = new Audio()
    a.preload = 'metadata'
    a.src = src
    audioRef.current = a
  }

  useEffect(() => {
    const a = audioRef.current
    allAudio.add(a)
    const onPlay = () => {
      for (const other of allAudio) if (other !== a && !other.paused) other.pause()
      repaint()
    }
    const events = ['loadedmetadata', 'timeupdate', 'ended', 'pause']
    events.forEach(ev => a.addEventListener(ev, repaint))
    a.addEventListener('play', onPlay)
    return () => {
      a.pause()
      events.forEach(ev => a.removeEventListener(ev, repaint))
      a.removeEventListener('play', onPlay)
      allAudio.delete(a)
    }
  }, [])

  // src can change in place (the live file is cache-busted by mtime)
  useEffect(() => {
    const a = audioRef.current
    if (new URL(a.src, location.href).href !== new URL(src, location.href).href) {
      a.src = src
      repaint()
    }
  }, [src])

  const a = audioRef.current
  const seek = e => {
    e.stopPropagation()
    if (!a.duration) return
    const rect = barRef.current.getBoundingClientRect()
    a.currentTime = ((e.clientX - rect.left) / rect.width) * a.duration
  }

  return (
    <div className={`player ready ${small ? 'small' : ''} ${!a.paused ? 'playing' : ''}`}>
      <button
        className="pp"
        title={a.paused ? 'Play' : 'Pause'}
        onClick={e => {
          e.stopPropagation()
          a.paused ? a.play() : a.pause()
        }}
      >
        {a.paused ? <PlayIcon /> : <PauseIcon />}
      </button>
      <div className="bar" ref={barRef} onClick={seek}>
        <div className="fill" style={{ width: a.duration ? `${(a.currentTime / a.duration) * 100}%` : '0%' }} />
      </div>
      <span className="time">
        {fmtTime(a.currentTime)} / {fmtTime(a.duration)}
      </span>
    </div>
  )
}
