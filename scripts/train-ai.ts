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
const WORKER = join(ROOT, 'scripts/train-worker.ts')

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
// where initial weights are loaded from (--resume) and where results are written.
// Kept separate so a plan-search retrain can start from the shipped models and
// write to its own directory, leaving the originals untouched.
const IN_DIR = join(ROOT, argStr('from', 'src/ai/models'))
const OUT_DIR = join(ROOT, argStr('out', 'src/ai/models'))

const GAMES = Math.max(1, Math.trunc(arg('games', 50000)))
const WORKERS = Math.max(1, Math.min(Math.trunc(arg('workers', Math.max(1, cpus().length - 4))), 32, GAMES))
const ROUNDS = Math.max(
  1,
  Math.min(Math.trunc(arg('rounds', Math.ceil(GAMES / (WORKERS * 150)))), Math.floor(GAMES / WORKERS)),
)
const RESUME = process.argv.includes('--resume')
const PROFILE = process.argv.includes('--profile')
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
  TWO_PLY: arg('twoply', 1) !== 0,
  // expert iteration: play the exploit turns with turn-level plan search
  // (reinforcement allocation + attack axis, rolled forward) so the net learns
  // to value the positions a stronger policy reaches. A smaller search budget
  // than eval uses, because this runs on every exploit turn of every game.
  PLAN: process.argv.includes('--plan'),
  PLAN_BUDGET: { mass: 2, axes: 2, rolloutCap: 10 },
  // Anchor a fraction of games to a fixed scripted aggressor on one side, so the
  // learning nets face strong play instead of only their own weak selves — which
  // is what let the last plan retrain overfit to a passive Turkey. Half the
  // anchored games script Turkey, half the occupiers, so BOTH sides learn to
  // beat good play. --scripted-opponents turns it on; --script <r> sets the rate.
  SCRIPT_RATE: arg('script', process.argv.includes('--scripted-opponents') ? 0.5 : 0),
}
// snapshots kept for the league, and how often one is taken
const LEAGUE_SIZE = 5
const LEAGUE_EVERY = 6

const FACTIONS = ['Turkey', 'Greece', 'Britain', 'France', 'Italy', 'Armenia', 'Bulgaria']
const totalJobs = ROUNDS * WORKERS
const gamesPerJob = Math.floor(GAMES / totalJobs)
const jobsWithExtraGame = GAMES % totalJobs
const gamesForJob = (round: number, worker: number) =>
  gamesPerJob + ((round - 1) * WORKERS + worker < jobsWithExtraGame ? 1 : 0)

const nets: Record<string, Net> = {}
for (const [i, name] of FACTIONS.entries()) {
  const path = join(IN_DIR, `${name.toLowerCase()}.json`)
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
  mkdirSync(OUT_DIR, { recursive: true })
  for (const name of FACTIONS) {
    const json = nets[name].toJSON()
    writeFileSync(
      join(OUT_DIR, `${name.toLowerCase()}.json`),
      JSON.stringify({
        sizes: json.sizes,
        weights: json.weights.map((l) => l.map((r) => r.map(round5))),
        biases: json.biases.map((l) => l.map(round5)),
      }),
    )
  }
}

interface WorkerResult {
  weights: Record<string, NetJSON>
  stats: {
    turkeyWins: number
    rounds: number
    ends: Record<string, number>
    ults: Record<string, number>
    profile?: {
      game: number
      elapsedMs: number
      playMs: number
      creditMs: number
      learnMs: number
      bufferEntries: number
    }[]
  }
}

/** Average what every worker learned this round — local SGD, one step. */
const merge = (results: WorkerResult[], games: number[]) => {
  const totalGames = games.reduce((sum, count) => sum + count, 0)
  for (const name of FACTIONS) {
    const target = nets[name]
    const all = results.map((r) => r.weights[name])
    for (let l = 0; l < target.weights.length; l++)
      for (let i = 0; i < target.weights[l].length; i++) {
        const row = target.weights[l][i]
        for (let j = 0; j < row.length; j++) {
          let sum = 0
          for (let n = 0; n < all.length; n++) sum += all[n].weights[l][i][j] * games[n]
          row[j] = sum / totalGames
        }
        let bias = 0
        for (let n = 0; n < all.length; n++) bias += all[n].biases[l][i] * games[n]
        target.biases[l][i] = bias / totalGames
      }
  }
}

const runWorker = (inPath: string, outPath: string) =>
  new Promise<void>((resolve, reject) => {
    execFile(
      process.execPath,
      ['--import', 'tsx', WORKER, inPath, outPath],
      { maxBuffer: 64 * 1024 * 1024 },
      (err, _stdout, stderr) => (err ? reject(new Error(`${err.message}\n${stderr}`)) : resolve()),
    )
  })

// tsx compiles this to CommonJS, where top-level await is not a thing
const main = async () => {
  const scratch = join(tmpdir(), `independence-train-${process.pid}`)
  mkdirSync(scratch, { recursive: true })

  console.log(
    `Training ${FACTIONS.length} factions: ${GAMES.toLocaleString()} games over ${ROUNDS} rounds × ${WORKERS} workers`,
  )
  const started = Date.now()
  const pool: Record<string, NetJSON>[] = []
  let done = 0

  for (let r = 1; r <= ROUNDS; r++) {
    const explore = Math.max(EXPLORE_MIN, EXPLORE_START * (1 - (r - 1) / Math.max(1, ROUNDS - 1)))
    const weights = Object.fromEntries(FACTIONS.map((n) => [n, nets[n].toJSON()]))

    const jobs = Array.from({ length: WORKERS }, (_, w) => {
      const inPath = join(scratch, `in-${w}.json`)
      const outPath = join(scratch, `out-${w}.json`)
      const games = gamesForJob(r, w)
      writeFileSync(
        inPath,
        JSON.stringify({
          games,
          explore,
          seed: r * 7919 + w * 104729,
          factions: FACTIONS,
          weights,
          pool,
          hyper: HYPER,
          profile: PROFILE,
        }),
      )
      return { inPath, outPath, games }
    })

    await Promise.all(jobs.map((job) => runWorker(job.inPath, job.outPath)))

    const results: WorkerResult[] = jobs.map((job) => JSON.parse(readFileSync(job.outPath, 'utf8')))
    merge(
      results,
      jobs.map((job) => job.games),
    )
    save()

    // keep an occasional snapshot for the league to play against
    if (r % LEAGUE_EVERY === 0) {
      pool.push(Object.fromEntries(FACTIONS.map((n) => [n, JSON.parse(JSON.stringify(nets[n].toJSON()))])))
      if (pool.length > LEAGUE_SIZE) pool.shift()
    }

    const played = jobs.reduce((sum, job) => sum + job.games, 0)
    const wins = results.reduce((n, x) => n + x.stats.turkeyWins, 0)
    const rounds = results.reduce((n, x) => n + x.stats.rounds, 0)
    const line = FACTIONS.map((n) => {
      const end = results.reduce((s, x) => s + x.stats.ends[n], 0) / played
      const ults = results.reduce((s, x) => s + x.stats.ults[n], 0)
      return `${n.slice(0, 3)} ${end.toFixed(2)}${ults ? `*${ults}` : ''}`
    }).join('  ')
    done += played
    const rate = done / ((Date.now() - started) / 1000)
    console.log(
      `round ${r}/${ROUNDS}  ${done.toLocaleString()} games  ${rate.toFixed(0)}/s  explore ${explore.toFixed(2)}  ` +
        `TR wins ${((100 * wins) / played).toFixed(1)}%  rounds ${(rounds / played).toFixed(1)}  | ${line}`,
    )
    if (PROFILE && results[0].stats.profile)
      for (const point of results[0].stats.profile)
        console.log(
          `  profile game ${point.game}: ${(point.elapsedMs / 1000).toFixed(1)}s total, ` +
            `${(point.playMs / 1000).toFixed(1)}s play, ${(point.creditMs / 1000).toFixed(1)}s credit, ` +
            `${(point.learnMs / 1000).toFixed(1)}s learn, ${point.bufferEntries.toLocaleString()} replay entries`,
        )
  }

  rmSync(scratch, { recursive: true, force: true })
  console.log(`Done in ${((Date.now() - started) / 60000).toFixed(1)} min. Models in ${OUT_DIR}`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
