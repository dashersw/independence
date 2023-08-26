import type { ComponentProps } from 'react'

export type Track = {
  title: string
  src: string
  art: string
  pos?: string
}

export type Transport = {
  play: () => void
  pause: () => void
  toggleTrack: (index: number) => void
  nextTrack: () => void
  previousTrack: () => void
}

export type SoundtrackPlayer = Transport & {
  track: Track
  activeTrack: number
  playing: boolean
  currentTime: number
  duration: number
  seek: (time: number) => void
  audioProps: ComponentProps<'audio'>
}
