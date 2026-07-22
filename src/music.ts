const TRACKS = [
  new URL('assets/music/the-first-shot.mp3', import.meta.url),
  new URL('assets/music/a-nation-in-chains.mp3', import.meta.url),
  new URL('assets/music/rise-of-the-resistance.mp3', import.meta.url),
  new URL('assets/music/ankara.mp3', import.meta.url),
  new URL('assets/music/mehmets.mp3', import.meta.url),
  new URL('assets/music/inonu.mp3', import.meta.url),
  new URL('assets/music/sakarya.mp3', import.meta.url),
  new URL('assets/music/taaruz.mp3', import.meta.url),
  new URL('assets/music/for-those-who-never-returned.mp3', import.meta.url),
  new URL('assets/music/the-road-to-izmir.mp3', import.meta.url),
  new URL('assets/music/lausanne.mp3', import.meta.url),
  new URL('assets/music/the-dawn-of-victory.mp3', import.meta.url),
  new URL('assets/music/a-nation-unchained.mp3', import.meta.url)
]

const DEFAULT_VOLUME = 0.2
const STORAGE_KEY = 'independence.music'
const VOLUME_KEY = 'independence.musicVolume'

const readPref = (): boolean => {
  try {
    return localStorage.getItem(STORAGE_KEY) !== 'off'
  } catch {
    return true
  }
}

const readVolume = (): number => {
  try {
    const raw = localStorage.getItem(VOLUME_KEY)
    const parsed = raw === null ? NaN : Number(raw)
    return parsed >= 0 && parsed <= 1 ? parsed : DEFAULT_VOLUME
  } catch {
    return DEFAULT_VOLUME
  }
}

let enabled = readPref()
let volume = readVolume()
let audio: HTMLAudioElement | null = null
let position = 0

const retryOnGesture = () => {
  const resume = () => {
    if (enabled) audio?.play().catch(() => {})
  }
  document.addEventListener('pointerdown', resume, { once: true })
}

const playCurrent = () => {
  if (!audio) return

  audio.src = TRACKS[position].href
  audio.play().catch(retryOnGesture)
}

const playNext = () => {
  position = (position + 1) % TRACKS.length
  playCurrent()
}

export const musicEnabled = () => enabled

export const musicVolume = () => volume

export const setMusicVolume = (level: number) => {
  volume = Math.min(1, Math.max(0, level))
  try {
    localStorage.setItem(VOLUME_KEY, String(volume))
  } catch {}

  if (audio) audio.volume = volume
}

export const setMusicEnabled = (on: boolean) => {
  enabled = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {}

  if (!audio) return

  if (on) audio.play().catch(retryOnGesture)
  else audio.pause()
}

export const startMusic = () => {
  if (audio) return

  audio = new Audio()
  audio.volume = volume
  if (typeof window !== 'undefined') (window as any).__music = audio
  audio.addEventListener('ended', playNext)
  position = 0

  if (enabled) playCurrent()
}
