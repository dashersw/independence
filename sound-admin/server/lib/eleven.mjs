import { apiKey } from './env.mjs'

const BASE = 'https://api.elevenlabs.io'

async function post(path, body, { signal } = {}) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'xi-api-key': apiKey(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal
  })
  if (!res.ok) {
    const text = await res.text().catch(() => '')
    throw new Error(`${path} → HTTP ${res.status}: ${text.slice(0, 300)}`)
  }
  return Buffer.from(await res.arrayBuffer())
}

/** Short gameplay effects and stingers. */
export function generateSfx(prompt, params, opts) {
  const body = { text: prompt }
  if (params.duration_seconds != null) body.duration_seconds = params.duration_seconds
  if (params.prompt_influence != null) body.prompt_influence = params.prompt_influence
  if (params.loop) body.loop = true
  return post('/v1/sound-generation', body, opts)
}

/** Ending jingles — the Music API, always instrumental music_v2. */
export function generateMusic(prompt, params, opts) {
  return post(
    '/v1/music',
    {
      prompt,
      music_length_ms: params.music_length_ms ?? 6000,
      model_id: 'music_v2',
      force_instrumental: true
    },
    opts
  )
}

export function generate(kind, prompt, params, opts) {
  return kind === 'music' ? generateMusic(prompt, params, opts) : generateSfx(prompt, params, opts)
}

// The overview is polled every 1.5s while jobs run — cache the subscription
// lookup so ElevenLabs isn't hammered (it throttles), and serve the last-known
// value when a lookup fails rather than flashing "n/a".
const CREDITS_TTL_MS = 10_000
let creditsCache = { value: null, ts: 0 }

export async function credits() {
  if (creditsCache.value && Date.now() - creditsCache.ts < CREDITS_TTL_MS) return creditsCache.value
  try {
    const res = await fetch(`${BASE}/v1/user/subscription`, { headers: { 'xi-api-key': apiKey() } })
    if (!res.ok) return creditsCache.value
    const sub = await res.json()
    creditsCache = {
      value: { used: sub.character_count, limit: sub.character_limit, tier: sub.tier },
      ts: Date.now()
    }
    return creditsCache.value
  } catch {
    return creditsCache.value
  }
}
