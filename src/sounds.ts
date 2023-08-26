// Sound-effect engine — a sibling of music.ts. Where music streams one long
// backing track through an <audio> element, effects need sample-accurate
// timing, zero-latency retriggers, and clean overlap, so this runs on the Web
// Audio API: each file is decoded once into an AudioBuffer and played through a
// fresh source node routed AudioBufferSourceNode → per-voice GainNode → master
// gain → destination. The per-voice gain also does a short tail ramp to true
// silence, which kills the end-of-clip click an <audio> element leaves behind.
//
// It lives in the browser layer only — the game engine runs headless during AI
// training and must never reach for audio.

// CLIPS is a generated module written by the sound admin: each cue id maps to
// its live take URLs. It's a normal source module (not a bundler glob), so it
// rebuilds cleanly whenever the admin promotes new takes — a page reload is
// enough, no dev-server restart.
import { CLIPS } from './sounds-manifest'

// Each cue maps to a base asset id. A cue can ship several interchangeable takes
// — game-start.mp3, game-start-2.mp3, game-start-3.mp3 — and one is chosen at
// random on every play so repeated triggers don't sound canned.
const CUES = {
  gameStart: 'game-start',
  yourTurn: 'your-turn',
  reinforcePlace: 'reinforce-place',
  select: 'select',
  uiClick: 'ui-click',
  cardDraw: 'card-draw',
  cardTrade: 'card-trade',
  decisionCard: 'decision-card',
  battleExchange: 'battle-exchange',
  battleBlitz: 'battle-blitz',
  conquest: 'conquest',
  fortify: 'fortify',
  embark: 'embark',
  landings: 'landings',
  pullBack: 'pull-back',
  elimination: 'elimination',
} as const

export type SoundName = keyof typeof CUES

// The live takes for one cue, in play order, as promoted by the sound admin.
const takesFor = (id: string): string[] => CLIPS[id] ?? []

const DEFAULT_VOLUME = 0.25
const STORAGE_KEY = 'independence.sfx'
const VOLUME_KEY = 'independence.sfxVolume'

// The slider value is a 0..1 loudness *fraction*, not raw gain. Ears hear
// loudness roughly logarithmically, so a linear slider feels loud almost
// immediately. Mapping through a perceptual taper (fraction^1.5) makes low
// settings genuinely quiet the way Spotify's slider does — the clips are
// peak-normalized to 0 dBFS, so the 5% default lands near -39 dBFS: soft, but
// still clearly audible (a pure square law dropped it to an inaudible -52).
const gainFor = (fraction: number) => fraction * Math.sqrt(fraction)
// Length of the ramp-to-silence applied at each clip's tail. Long enough to
// smooth an abrupt final sample into silence, short enough to be inaudible.
const TAIL_FADE = 0.012

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
let ctx: AudioContext | null = null
let master: GainNode | null = null
const buffers = new Map<SoundName, AudioBuffer[]>()

export const soundsEnabled = () => enabled

export const setSoundsEnabled = (on: boolean) => {
  enabled = on
  try {
    localStorage.setItem(STORAGE_KEY, on ? 'on' : 'off')
  } catch {}
}

export const sfxVolume = () => volume

export const setSfxVolume = (level: number) => {
  volume = Math.min(1, Math.max(0, level))
  try {
    localStorage.setItem(VOLUME_KEY, String(volume))
  } catch {}

  if (master) master.gain.value = gainFor(volume)
}

// Autoplay policy parks a freshly created context in "suspended" until a user
// gesture; resume() is a no-op once it's running, so it's cheap to call often.
const resume = () => {
  if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => {})
}

// Create the context + master bus and decode every clip up front, so the first
// hit of each effect is a plain buffer read with no fetch/decode latency. Safe
// to call more than once; only the first does any work.
export const initSounds = () => {
  if (ctx) return

  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return

  // A locked-down browser (or one out of hardware audio contexts) can throw on
  // construction — degrade to silence rather than take the caller down with us.
  try {
    ctx = new Ctor()
    master = ctx.createGain()
    master.gain.value = gainFor(volume)
    master.connect(ctx.destination)
  } catch (error) {
    console.warn('[sounds] audio engine unavailable', error)
    ctx = null
    master = null
    return
  }

  // A pointer gesture is what unlocks the context on most browsers.
  document.addEventListener('pointerdown', resume, { capture: true })

  for (const name of Object.keys(CUES) as SoundName[]) {
    // Push each take in as it decodes, so one bad clip can't sink the whole cue
    // and the first playable take is available as early as possible.
    const decoded: AudioBuffer[] = []
    buffers.set(name, decoded)
    for (const href of takesFor(CUES[name])) {
      fetch(href)
        .then((response) => response.arrayBuffer())
        .then((data) => ctx!.decodeAudioData(data))
        .then((buffer) => decoded.push(buffer))
        .catch(() => {})
    }
  }
}

export const playSound = (name: SoundName) => {
  if (!enabled || !ctx || !master) return

  const takes = buffers.get(name)
  if (!takes || takes.length === 0) return
  // Pick a random take so repeated triggers vary.
  const buffer = takes[(Math.random() * takes.length) | 0]

  resume()

  const start = ctx.currentTime
  const end = start + buffer.duration

  const source = ctx.createBufferSource()
  source.buffer = buffer

  // A per-voice gain lets clips overlap without touching each other and carries
  // the tail ramp that lands every clip on exact silence.
  const gain = ctx.createGain()
  const fadeAt = Math.max(start, end - TAIL_FADE)
  gain.gain.setValueAtTime(1, start)
  gain.gain.setValueAtTime(1, fadeAt)
  gain.gain.linearRampToValueAtTime(0, end)

  source.connect(gain).connect(master)
  source.start(start)
  source.stop(end)
  // Let the node graph be collected once it has finished.
  source.onended = () => {
    source.disconnect()
    gain.disconnect()
  }
}
