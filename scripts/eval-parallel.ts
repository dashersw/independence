// Shard eval-ai across cores and aggregate — plan-mode eval is single-threaded
// and slow (~0.07 games/s), so a faithful run of any real size needs the cores.
//
//   npm run eval-parallel -- --games 700 --shards 14 --plan --models src/ai/models
//
// Every flag other than --games/--shards is forwarded verbatim to each shard
// (so --plan, --scripted, --fight-on all work). Each shard runs eval-ai with
// --json; we sum the raw accumulators and print the usual scorecard.
import { spawn } from 'node:child_process'
import { cpus } from 'node:os'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import { NATIONAL_PACT } from '../src/game/campaign-data'
import { ULTIMATE } from '../src/ai/rewards'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const FACTIONS = ['Turkey', 'Greece', 'Britain', 'France', 'Italy', 'Armenia', 'Bulgaria']

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1 || i === process.argv.length - 1) return fallback
  const n = Number(process.argv[i + 1])
  return Number.isFinite(n) ? n : fallback
}
const argStr = (name: string, fallback: string) => {
  const i = process.argv.indexOf(`--${name}`)
  return i === -1 || i === process.argv.length - 1 ? fallback : process.argv[i + 1]
}

const GAMES = arg('games', 700)
const SHARDS = Math.max(1, Math.min(arg('shards', Math.max(1, cpus().length - 2)), GAMES))
const MODEL_DIR = argStr('models', 'src/ai/models')

// forward every flag except --games/--shards (and their values)
const CONSUMED = new Set(['--games', '--shards'])
const passthrough: string[] = []
const raw = process.argv.slice(2)
for (let i = 0; i < raw.length; i++) {
  if (CONSUMED.has(raw[i])) {
    i++ // skip its value
    continue
  }
  passthrough.push(raw[i])
}

type Counts = {
  games: number
  pactTotal: number
  roundsTotal: number
  unfinished: number
  endings: Record<string, number>
  aim: Record<string, number>
  home: Record<string, number>
  ult: Record<string, number>
  alive: Record<string, number>
  tookFromTurkey: Record<string, number>
}

const base = GAMES / SHARDS
const shardGames = Array.from({ length: SHARDS }, (_, i) => Math.floor((i + 1) * base) - Math.floor(i * base)).filter(
  (n) => n > 0,
)

console.error(`eval-parallel: ${GAMES} games over ${shardGames.length} shards  [${MODEL_DIR}] ${passthrough.join(' ')}`)
const t0 = Date.now()
let done = 0

function runShard(games: number): Promise<Counts> {
  return new Promise((resolve, reject) => {
    const child = spawn(
      'node',
      [
        join(ROOT, 'node_modules/.bin/tsx'),
        join(ROOT, 'scripts/eval-ai.ts'),
        '--json',
        '--games',
        String(games),
        '--models',
        MODEL_DIR,
        ...passthrough,
      ],
      { cwd: ROOT },
    )
    let out = ''
    let err = ''
    child.stdout.on('data', (d) => (out += d))
    child.stderr.on('data', (d) => (err += d))
    child.on('close', (code) => {
      if (code !== 0) return reject(new Error(`shard exited ${code}\n${err}`))
      try {
        resolve(JSON.parse(out.trim().split('\n').pop()!))
      } catch {
        reject(new Error(`bad shard output: ${out}\n${err}`))
      }
    })
  })
}

async function main() {
  const results = await Promise.all(
    shardGames.map((g) =>
      runShard(g).then((r) => {
        done += r.games
        const secs = (Date.now() - t0) / 1000
        console.error(`  shard done  ${done}/${GAMES}  ${(done / secs).toFixed(2)}/s`)
        return r
      }),
    ),
  )

  // ── aggregate ────────────────────────────────────────────────────────────────
  const total: Counts = {
    games: 0,
    pactTotal: 0,
    roundsTotal: 0,
    unfinished: 0,
    endings: {},
    aim: {},
    home: {},
    ult: {},
    alive: {},
    tookFromTurkey: {},
  }
  for (const r of results) {
    total.games += r.games
    total.pactTotal += r.pactTotal
    total.roundsTotal += r.roundsTotal
    total.unfinished += r.unfinished
    for (const k of Object.keys(r.endings)) total.endings[k] = (total.endings[k] ?? 0) + r.endings[k]
    for (const n of FACTIONS) {
      total.aim[n] = (total.aim[n] ?? 0) + (r.aim[n] ?? 0)
      total.home[n] = (total.home[n] ?? 0) + (r.home[n] ?? 0)
      total.ult[n] = (total.ult[n] ?? 0) + (r.ult[n] ?? 0)
      total.alive[n] = (total.alive[n] ?? 0) + (r.alive[n] ?? 0)
      total.tookFromTurkey[n] = (total.tookFromTurkey[n] ?? 0) + (r.tookFromTurkey[n] ?? 0)
    }
  }

  const G = total.games
  const ENDINGS = [
    'overlay.total.title',
    'overlay.beyond.title',
    'overlay.victory.title',
    'overlay.lausanne.near.title',
    'overlay.lausanne.partial.title',
    'overlay.lausanne.poor.title',
    'overlay.defeat.title',
  ]
  const LABEL: Record<string, string> = {
    'overlay.total.title': 'the whole map',
    'overlay.beyond.title': 'victory and more',
    'overlay.victory.title': 'victory',
    'overlay.lausanne.near.title': 'near miss',
    'overlay.lausanne.partial.title': 'truncated peace',
    'overlay.lausanne.poor.title': 'their terms',
    'overlay.defeat.title': 'Turkey destroyed',
  }
  const pct = (n: number) => `${((100 * n) / G).toFixed(1)}%`

  console.log(
    `\n${G} games (${shardGames.length} shards), no exploration${passthrough.includes('--plan') ? ', plan search' : ''}${passthrough.includes('--scripted') ? ', scripted Turkey' : ''}  [${MODEL_DIR}]\n`,
  )
  console.log(
    `Turkey ends the war holding ${(total.pactTotal / G).toFixed(1)} of ${NATIONAL_PACT.length} Pact provinces`,
  )
  console.log(`the war runs ${(total.roundsTotal / G).toFixed(1)} rounds on average\n`)
  console.log('how it ends for Turkey')
  for (const key of ENDINGS) console.log(`  ${LABEL[key].padEnd(18)} ${pct(total.endings[key] ?? 0).padStart(6)}`)
  if (total.unfinished) console.log(`  ${'still running'.padEnd(18)} ${pct(total.unfinished).padStart(6)}`)
  console.log('\nwhat each of them made of it')
  console.log(
    `  ${'faction'.padEnd(10)} ${'own aim'.padStart(8)} ${'own land'.padStart(9)} ${'maximum'.padStart(8)} ${'survived'.padStart(9)} ${'Pact taken'.padStart(16)}`,
  )
  for (const name of FACTIONS) {
    const goal = name === 'Turkey' ? 'the map' : `${(ULTIMATE[name] ?? []).length} provinces`
    console.log(
      `  ${name.padEnd(10)} ${((100 * total.aim[name]) / G).toFixed(0).padStart(7)}% ` +
        `${((100 * total.home[name]) / G).toFixed(0).padStart(8)}% ${pct(total.ult[name]).padStart(8)} ` +
        `${pct(total.alive[name]).padStart(9)} ${(total.tookFromTurkey[name] / G).toFixed(2).padStart(16)}  (${goal})`,
    )
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
