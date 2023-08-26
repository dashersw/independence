// Self-play training for the faction models.
//
//   npm run train-ai -- --games 200000 --workers 10
//
// Seven networks, one per faction, all learning at once from the same games —
// each from its own side of the board and against its own reward function. The
// structure follows the lalecg trainer: a value net scored per candidate move,
// an epsilon-greedy policy over it, a prioritised replay buffer, and a reward
// that is the turn's own shaping plus the end of the war discounted back.
//
// The games are played across worker processes and their weights averaged each
// round (local SGD). Playing is the expensive part and games are independent,
// so this is the difference between one core and all of them. There is no GPU
// in it because the bottleneck was never the matrix maths: a forward pass here
// is two thousand multiply-adds, and the simulation around it costs more.
//
// Models land in src/ai/models/<faction>.json, which the game imports directly,
// so training and play always read the same weights.
import { execFile } from 'node:child_process'
import { writeFileSync, mkdirSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { cpus, tmpdir } from 'node:os'

import { Net, NetJSON } from '../src/ai/net'
import { INPUT_SIZE } from '../src/ai/features'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_DIR = join(ROOT, 'src/ai/models')
const WORKER = join(ROOT, 'scripts/train-worker.ts')

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1 || i === process.argv.length - 1) return fallback
  const n = Number(process.argv[i + 1])
  return Number.isFinite(n) ? n : fallback
}

const GAMES = arg('games', 50000)
const WORKERS = Math.max(1, Math.min(arg('workers', Math.max(1, cpus().length - 4)), 32))
const ROUNDS = Math.max(1, arg('rounds', Math.ceil(GAMES / (WORKERS * 150))))
const RESUME = process.argv.includes('--resume')
const HIDDEN = [40, 24]
const EXPLORE_START = 0.6
const EXPLORE_MIN = 0.06
const HYPER = {
  LEARNING_RATE: 0.02,
  DISCOUNT: 0.94,
  BUFFER_MAX: 20000,
  BATCH: 48,
  MAX_ROUNDS: 28,
  // how often a faction plays as one of its own older selves. Measured at 20k
  // games it costs nothing in strength and widens what gets tried: Bulgaria
  // reached its maximum twice as often, Armenia four times as often.
  LEAGUE_RATE: arg('league', 0.3),
  // Bootstrapping off the net's own estimates, blended with what actually
  // happened. Off: measured at 20k games it took Turkey's win rate from 50% to
  // 32%. Rewards here are sparse enough that the estimates drag each other to
  // zero and the whole set goes passive. Kept as a knob, not a default.
  TD_BLEND: arg('td', 0),
  // look past the shortlist to what each move would let you do next
  TWO_PLY: arg('twoply', 1) !== 0
}
// snapshots kept for the league, and how often one is taken
const LEAGUE_SIZE = 5
const LEAGUE_EVERY = 6

const FACTIONS = ['Turkey', 'Greece', 'Britain', 'France', 'Italy', 'Armenia', 'Bulgaria']
const perWorker = Math.max(1, Math.round(GAMES / (ROUNDS * WORKERS)))

const nets: Record<string, Net> = {}
for (const [i, name] of FACTIONS.entries()) {
  const path = join(MODEL_DIR, `${name.toLowerCase()}.json`)
  if (RESUME && existsSync(path)) {
    nets[name] = Net.fromJSON(JSON.parse(readFileSync(path, 'utf8')))
    console.log(`↻ resumed ${name}`)
  } else {
    nets[name] = new Net([INPUT_SIZE, ...HIDDEN, 1], 1000 + i * 17)
  }
}

// Five significant digits is well past what the forward pass can tell apart,
// and it takes the seven models from ~310KB to ~110KB — this ships in the
// bundle to a phone, so the difference is the point.
const round5 = (x: number) => Number(x.toPrecision(5))

const save = () => {
  mkdirSync(MODEL_DIR, { recursive: true })
  for (const name of FACTIONS) {
    const json = nets[name].toJSON()
    writeFileSync(
      join(MODEL_DIR, `${name.toLowerCase()}.json`),
      JSON.stringify({
        sizes: json.sizes,
        weights: json.weights.map(l => l.map(r => r.map(round5))),
        biases: json.biases.map(l => l.map(round5))
      })
    )
  }
}

interface WorkerResult {
  weights: Record<string, NetJSON>
  stats: { turkeyWins: number; rounds: number; ends: Record<string, number>; ults: Record<string, number> }
}

/** Average what every worker learned this round — local SGD, one step. */
const merge = (results: WorkerResult[]) => {
  for (const name of FACTIONS) {
    const target = nets[name]
    const all = results.map(r => r.weights[name])
    for (let l = 0; l < target.weights.length; l++)
      for (let i = 0; i < target.weights[l].length; i++) {
        const row = target.weights[l][i]
        for (let j = 0; j < row.length; j++) {
          let sum = 0
          for (const w of all) sum += w.weights[l][i][j]
          row[j] = sum / all.length
        }
        let bias = 0
        for (const w of all) bias += w.biases[l][i]
        target.biases[l][i] = bias / all.length
      }
  }
}

const runWorker = (inPath: string, outPath: string) =>
  new Promise<void>((resolve, reject) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', WORKER, inPath, outPath],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, _stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve())
    )
  })

// tsx compiles this to CommonJS, where top-level await is not a thing
const main = async () => {
  const scratch = join(tmpdir(), `independence-train-${process.pid}`)
  mkdirSync(scratch, { recursive: true })

  console.log(
    `Training ${FACTIONS.length} factions: ${ROUNDS} rounds × ${WORKERS} workers × ${perWorker} games ` +
      `= ${(ROUNDS * WORKERS * perWorker).toLocaleString()} games`
  )
  const started = Date.now()
  const pool: Record<string, NetJSON>[] = []

  for (let r = 1; r <= ROUNDS; r++) {
    const explore = Math.max(EXPLORE_MIN, EXPLORE_START * (1 - (r - 1) / Math.max(1, ROUNDS - 1)))
    const weights = Object.fromEntries(FACTIONS.map(n => [n, nets[n].toJSON()]))

    const jobs = Array.from({ length: WORKERS }, (_, w) => {
      const inPath = join(scratch, `in-${w}.json`)
      const outPath = join(scratch, `out-${w}.json`)
      writeFileSync(
        inPath,
        JSON.stringify({
          games: perWorker,
          explore,
          seed: r * 7919 + w * 104729,
          factions: FACTIONS,
          weights,
          pool,
          hyper: HYPER
        })
      )
      return { inPath, outPath }
    })

    await Promise.all(jobs.map(job => runWorker(job.inPath, job.outPath)))

    const results: WorkerResult[] = jobs.map(job => JSON.parse(readFileSync(job.outPath, 'utf8')))
    merge(results)
    save()

    // keep an occasional snapshot for the league to play against
    if (r % LEAGUE_EVERY === 0) {
      pool.push(Object.fromEntries(FACTIONS.map(n => [n, JSON.parse(JSON.stringify(nets[n].toJSON()))])))
      if (pool.length > LEAGUE_SIZE) pool.shift()
    }

    const played = results.length * perWorker
    const wins = results.reduce((n, x) => n + x.stats.turkeyWins, 0)
    const rounds = results.reduce((n, x) => n + x.stats.rounds, 0)
    const line = FACTIONS.map(n => {
      const end = results.reduce((s, x) => s + x.stats.ends[n], 0) / played
      const ults = results.reduce((s, x) => s + x.stats.ults[n], 0)
      return `${n.slice(0, 3)} ${end.toFixed(2)}${ults ? `*${ults}` : ''}`
    }).join('  ')
    const done = r * WORKERS * perWorker
    const rate = done / ((Date.now() - started) / 1000)
    console.log(
      `round ${r}/${ROUNDS}  ${done.toLocaleString()} games  ${rate.toFixed(0)}/s  explore ${explore.toFixed(2)}  ` +
        `TR wins ${((100 * wins) / played).toFixed(1)}%  rounds ${(rounds / played).toFixed(1)}  | ${line}`
    )
  }

  rmSync(scratch, { recursive: true, force: true })
  console.log(`Done in ${((Date.now() - started) / 60000).toFixed(1)} min. Models in src/ai/models/`)
}

main().catch(err => {
  console.error(err)
  process.exit(1)
})
