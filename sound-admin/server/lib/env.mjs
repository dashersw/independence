import fs from 'node:fs'
import { ENV_FILE } from './paths.mjs'

/** .env re-read on every call so a key change needs no restart (art-admin convention). */
export function env() {
  const out = { ...process.env }
  try {
    for (const line of fs.readFileSync(ENV_FILE, 'utf8').split('\n')) {
      const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/)
      if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '')
    }
  } catch {}
  return out
}

export function apiKey() {
  const key = env().ELEVENLABS_API_KEY
  if (!key) throw new Error('ELEVENLABS_API_KEY missing — put it in sound-admin/.env')
  return key
}
