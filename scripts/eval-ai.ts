// A scorecard for the trained models.
//
//   npm run eval-ai -- --games 2000
//
// Training prints one number per round and that number is easy to fool: a set
// of models can raise Turkey's win rate by every occupier quietly giving up.
// This plays the finished models with no exploration at all and reports what
// each of them actually does with a war — which endings Turkey reaches, how
// much of its own aim each occupier holds, how often anybody reaches for the
// maximum, and whether the six of them ever manage to gang up.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import Game from '../src/game/game'
import { NATIONAL_PACT } from '../src/game/campaign-data'
import { NetJSON } from '../src/ai/net'
import { ULTIMATE, aimHeld, homeHeld, ultimateHeld } from '../src/ai/rewards'
import { chooseMove, decisionMoves, playTurn, makeScorer, makeSelector, makePlanScore } from '../src/ai/policy'
import { scriptedTurn, scriptedDecisionKey } from '../src/ai/scripted'
import { AiTurnController } from '../src/ai/turn-controller'
import { gameOutcome } from '../src/game/outcome'

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
const GAMES = arg('games', 2000)
const MODEL_DIR = join(ROOT, argStr('models', 'src/ai/models'))

const models: Record<string, NetJSON> = Object.fromEntries(
  FACTIONS.map((n) => [n, JSON.parse(readFileSync(join(MODEL_DIR, `${n.toLowerCase()}.json`), 'utf8'))]),
)

// ── Scripted / plan-search modes ─────────────────────────────────────────────
// --scripted   Turkey played by the hand-written aggressor (a competent-human
//              proxy from src/ai/scripted.ts), so the scorecard measures the
//              trained OCCUPIERS against real play rather than the passive net.
// --fight-on   with --scripted, reject Lausanne instead of signing.
// --plan       reinforcement + attack chosen by turn-level plan search, both sides.
const SCRIPTED = process.argv.includes('--scripted')
const FIGHT_ON = process.argv.includes('--fight-on')
const PLAN = process.argv.includes('--plan')
// --json   emit raw accumulator counts as one line (for sharded/parallel eval)
//          instead of the human scorecard. Consumed by scripts/eval-parallel.mjs.
const JSON_OUT = process.argv.includes('--json')

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

const endings: Record<string, number> = Object.fromEntries(ENDINGS.map((k) => [k, 0]))
const aim: Record<string, number> = Object.fromEntries(FACTIONS.map((n) => [n, 0]))
const ult: Record<string, number> = Object.fromEntries(FACTIONS.map((n) => [n, 0]))
const alive: Record<string, number> = Object.fromEntries(FACTIONS.map((n) => [n, 0]))
const home: Record<string, number> = Object.fromEntries(FACTIONS.map((n) => [n, 0]))
const tookFromTurkey: Record<string, number> = Object.fromEntries(FACTIONS.map((n) => [n, 0]))
let pactTotal = 0
let roundsTotal = 0
let unfinished = 0

const PROGRESS_EVERY = Math.max(1, Math.min(50, Math.floor(GAMES / 40)))
const t0 = Date.now()

for (let g = 0; g < GAMES; g++) {
  const game = new Game()
  // Turkey sits in the human seat, so the engine's own AI hooks refuse to play
  // it. Here every seat is driven through the same policy, Turkey included —
  // that is the whole point: this is the AI playing itself, from both sides.
  const ai = new AiTurnController(game, {
    scorer: makeScorer(models),
    selector: makeSelector(models),
    planScore: PLAN ? makePlanScore(models) : null,
  })
  const turkey = game.humanPlayer.faction
  let held = new Set(turkey.territories.map((t) => t.slug))
  let guard = 0

  while (game.turn.phase !== 'gameover' && game.turn.round <= 28 && guard++ < 4000) {
    if (game.campaign.pendingDecision) {
      const q = game.campaign.pendingDecision
      const faction = game.turn.currentPlayer.faction
      const scripted = SCRIPTED
        ? scriptedDecisionKey(
            (q.choices ?? []).map((c) => c.key),
            FIGHT_ON,
          )
        : undefined
      const key = scripted ?? chooseMove(game, faction, decisionMoves(q), models[faction.name])?.choiceKey
      if (key) game.campaign.resolveDecision(key)
    }
    game.campaign.clearCards()
    if (game.turn.isGameOver) break
    // through the engine's own hooks, exactly as the browser plays them
    ai.beginTurn()
    while (ai.attackStep()) {
      /* one attack per step, as the UI paces them */
    }
    ai.finishTurn()
    if (game.turn.currentPlayer.isHuman) {
      if (SCRIPTED) scriptedTurn(game)
      else playTurn(game, models[game.turn.currentPlayer.faction.name], { plan: PLAN })
    }

    // Misak-ı Millî provinces prised off Turkey, whichever they are — the
    // coalition is paid for the count, not for any particular city
    const now = new Set(turkey.territories.map((t) => t.slug))
    for (const slug of held)
      if (!now.has(slug)) {
        const taker = game.bySlug[slug].faction.name
        if (taker in tookFromTurkey) tookFromTurkey[taker]++
      }
    held = now
  }

  const key = gameOutcome(game)?.titleKey
  if (key && key in endings) endings[key]++
  else unfinished++
  pactTotal += game.pactProgress
  roundsTotal += game.turn.round
  for (const name of FACTIONS) {
    const faction = game.factions.find((f) => f.name === name)!
    aim[name] += aimHeld(game, faction)
    home[name] += homeHeld(game, faction)
    if (ultimateHeld(game, faction) >= 0.999) ult[name]++
    if (!faction.eliminated) alive[name]++
  }

  const done = g + 1
  if (done % PROGRESS_EVERY === 0 || done === GAMES) {
    const secs = (Date.now() - t0) / 1000
    const rate = done / secs
    const eta = (GAMES - done) / rate
    process.stderr.write(
      `  ${done}/${GAMES}  ${rate.toFixed(2)}/s  eta ${(eta / 60).toFixed(1)}m  ` +
        `TR pact ${(pactTotal / done).toFixed(1)}/${NATIONAL_PACT.length}  rounds ${(roundsTotal / done).toFixed(1)}\n`,
    )
  }
}

if (JSON_OUT) {
  process.stdout.write(
    JSON.stringify({
      games: GAMES,
      pactTotal,
      roundsTotal,
      unfinished,
      endings,
      aim,
      home,
      ult,
      alive,
      tookFromTurkey,
    }) + '\n',
  )
  process.exit(0)
}

const pct = (n: number) => `${((100 * n) / GAMES).toFixed(1)}%`
console.log(
  `\n${GAMES} games, no exploration — the models as they ship` +
    `${SCRIPTED ? ', Turkey played by the scripted aggressor' : ''}` +
    `${PLAN ? ', reinforcement by turn-level plan search' : ''}\n`,
)
console.log(`Turkey ends the war holding ${(pactTotal / GAMES).toFixed(1)} of ${NATIONAL_PACT.length} Pact provinces`)
console.log(`the war runs ${(roundsTotal / GAMES).toFixed(1)} rounds on average\n`)

console.log('how it ends for Turkey')
for (const key of ENDINGS) console.log(`  ${LABEL[key].padEnd(18)} ${pct(endings[key]).padStart(6)}`)
if (unfinished) console.log(`  ${'still running'.padEnd(18)} ${pct(unfinished).padStart(6)}`)

console.log('\nwhat each of them made of it')
console.log(
  `  ${'faction'.padEnd(10)} ${'own aim'.padStart(8)} ${'own land'.padStart(9)} ${'maximum'.padStart(8)} ${'survived'.padStart(9)} ${'Pact taken'.padStart(16)}`,
)
for (const name of FACTIONS) {
  const goal = name === 'Turkey' ? 'the map' : `${(ULTIMATE[name] ?? []).length} provinces`
  console.log(
    `  ${name.padEnd(10)} ${((100 * aim[name]) / GAMES).toFixed(0).padStart(7)}% ` +
      `${((100 * home[name]) / GAMES).toFixed(0).padStart(8)}% ${pct(ult[name]).padStart(8)} ` +
      `${pct(alive[name]).padStart(9)} ${(tookFromTurkey[name] / GAMES).toFixed(2).padStart(16)}  (${goal})`,
  )
}
console.log(`\n  own aim = share of ${'its AIMS provinces held, averaged over games'}`)
console.log('  own land = share of the provinces it started the war holding')
console.log('  Pact taken = Misak-ı Millî provinces prised off Turkey per game, any of the thirty')
