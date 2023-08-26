#!/usr/bin/env node
// CLI generation, no server needed:
//   node server/generate.mjs battle-exchange conquest       # specific sounds
//   node server/generate.mjs --category endings             # one category
//   node server/generate.mjs --missing                      # everything without a candidate yet
//   node server/generate.mjs --all --count 3                # 3 takes of every sound
import { listSounds } from './lib/sounds.mjs'
import { generate } from './lib/eleven.mjs'
import { saveCandidate } from './lib/sounds.mjs'

const args = process.argv.slice(2)
const flag = name => {
  const i = args.indexOf(`--${name}`)
  if (i === -1) return null
  return args[i + 1] && !args[i + 1].startsWith('--') ? args.splice(i, 2)[1] : (args.splice(i, 1), true)
}

const count = Math.max(1, Math.min(8, Number(flag('count')) || 1))
const category = flag('category')
const missing = Boolean(flag('missing'))
const all = Boolean(flag('all'))
const ids = args.filter(a => !a.startsWith('--'))

let targets = listSounds()
if (ids.length) {
  const unknown = ids.filter(id => !targets.some(s => s.id === id))
  if (unknown.length) {
    console.error(`unknown sounds: ${unknown.join(', ')}`)
    process.exit(1)
  }
  targets = targets.filter(s => ids.includes(s.id))
} else if (category) targets = targets.filter(s => s.category === category)
else if (missing) targets = targets.filter(s => !s.candidates.length)
else if (!all) {
  console.error('usage: generate.mjs [--count N] <id...> | --category <cat> | --missing | --all')
  process.exit(1)
}

console.log(`generating ${count} take(s) of ${targets.length} sound(s)…`)
const CONCURRENCY = 3
const work = targets.flatMap(s => Array.from({ length: count }, (_, i) => ({ sound: s, take: i + 1 })))
let failed = 0

await Promise.all(
  Array.from({ length: Math.min(CONCURRENCY, work.length) }, async () => {
    let item
    while ((item = work.shift())) {
      const { sound, take } = item
      const label = count > 1 ? `${sound.id} (take ${take})` : sound.id
      try {
        const buffer = await generate(sound.kind, sound.prompt, sound.params ?? {})
        const saved = saveCandidate(sound.id, buffer, `cli${take}`)
        console.log(`  ✓ ${label} → sounds/candidates/${sound.id}/${saved.file}`)
      } catch (err) {
        failed++
        console.error(`  ✗ ${label}: ${err.message}`)
      }
    }
  })
)

console.log(failed ? `done, ${failed} failed` : 'done')
process.exit(failed ? 1 : 0)
