import { useEffect, useRef, useState } from 'react'
import type { MutableRefObject, RefObject } from 'react'
import { useLang } from '../../useLang'
import { TRACKS } from './constants'
import { soundtrackCopy } from './copy'
import type { SoundtrackPlayer, Track, Transport } from './types'

const ARTWORK_SIZE = '512x512'

type AudioRef = RefObject<HTMLAudioElement | null>
type PlaybackRefs = { audioRef: AudioRef; wantsPlayback: MutableRefObject<boolean> }

const tryPlay = async (audio: HTMLAudioElement | null) => {
  if (!audio) return false

  try {
    await audio.play()
    return true
  } catch {
    return false
  }
}

const useTransport = (
  refs: PlaybackRefs & { activeTrack: number; setActiveTrack: (index: number) => void },
): Transport => {
  const { audioRef, wantsPlayback, activeTrack, setActiveTrack } = refs

  const play = () => {
    wantsPlayback.current = true
    void tryPlay(audioRef.current)
  }

  const pause = () => {
    wantsPlayback.current = false
    audioRef.current?.pause()
  }

  const goToTrack = (index: number) => {
    wantsPlayback.current = true
    setActiveTrack(index)
  }

  const nextTrack = () => goToTrack((activeTrack + 1) % TRACKS.length)
  const previousTrack = () => goToTrack((activeTrack - 1 + TRACKS.length) % TRACKS.length)

  const toggleTrack = (index: number) => {
    if (index !== activeTrack) {
      goToTrack(index)
      return
    }

    if (audioRef.current?.paused) play()
    else pause()
  }

  return { play, pause, toggleTrack, nextTrack, previousTrack }
}

const usePlaybackSync = (refs: PlaybackRefs & { activeTrack: number }) => {
  const { audioRef, wantsPlayback, activeTrack } = refs

  useEffect(() => {
    const audio = audioRef.current
    if (!audio) return

    audio.load()
    if (wantsPlayback.current) void tryPlay(audio)
  }, [activeTrack, audioRef, wantsPlayback])

  useEffect(() => {
    const resumeOnGesture = () => void tryPlay(audioRef.current)

    const openWithTheScore = async () => {
      const started = await tryPlay(audioRef.current)
      if (!started) document.addEventListener('pointerdown', resumeOnGesture, { once: true })
    }

    void openWithTheScore()

    return () => document.removeEventListener('pointerdown', resumeOnGesture)
  }, [audioRef])
}

const useMediaSession = (session: { track: Track; transport: Transport }) => {
  const { track, transport } = session

  useEffect(() => {
    if (!('mediaSession' in navigator)) return

    navigator.mediaSession.metadata = new MediaMetadata({
      title: track.title,
      artist: 'Independence · Original game score',
      album: 'Independence',
      artwork: [{ src: track.art, sizes: ARTWORK_SIZE, type: 'image/jpeg' }],
    })
    navigator.mediaSession.setActionHandler('previoustrack', transport.previousTrack)
    navigator.mediaSession.setActionHandler('nexttrack', transport.nextTrack)
    navigator.mediaSession.setActionHandler('play', transport.play)
    navigator.mediaSession.setActionHandler('pause', transport.pause)
  }, [track, transport])
}

export const useSoundtrackPlayer = (): SoundtrackPlayer => {
  const audioRef = useRef<HTMLAudioElement>(null)
  const wantsPlayback = useRef(true)
  const [activeTrack, setActiveTrack] = useState(0)
  const [playing, setPlaying] = useState(false)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const track = TRACKS.at(activeTrack) ?? TRACKS[0]
  const transport = useTransport({ audioRef, wantsPlayback, activeTrack, setActiveTrack })

  const seek = (time: number) => {
    if (audioRef.current) audioRef.current.currentTime = time
    setCurrentTime(time)
  }

  usePlaybackSync({ audioRef, wantsPlayback, activeTrack })
  useMediaSession({ track, transport })

  return {
    ...transport,
    track,
    activeTrack,
    playing,
    currentTime,
    duration,
    seek,
    audioProps: {
      ref: audioRef,
      src: track.src,
      preload: 'metadata',
      onPlay: () => setPlaying(true),
      onPause: () => setPlaying(false),
      onTimeUpdate: (event) => setCurrentTime(event.currentTarget.currentTime),
      onLoadedMetadata: (event) => setDuration(event.currentTarget.duration),
      onEnded: transport.nextTrack,
    },
  }
}

export const useSoundtrackCopy = () => soundtrackCopy(useLang())
