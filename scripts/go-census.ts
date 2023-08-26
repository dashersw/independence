// A census of Turkey's army at the Great Offensive, for tuning the levy.
//
//   npx tsx scripts/go-census.ts --games 50
//
// Plays the trained models against each other (the same loop as eval-ai) and,
// per game, counts every soldier Turkey fields from the first turn until the
// moment the Great Offensive fires — split into the draft (levy + card trades
// + reinforcement events, all of which arrive through placeReinforcements) and
// direct rule grants (liberation militia, entrenchment musters, event writes).
// The instant the offensive fires it takes a headcount of Turkey's standing
// army. Transfers between provinces are movement, not recruitment, and are
// never counted.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

import Game from '../src/game/game'
import { NetJSON } from '../src/ai/net'
import { chooseMove, decisionMoves, playTurn, makeScorer, makeSelector } from '../src/ai/policy'
import { AiTurnController } from '../src/ai/turn-controller'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const MODEL_DIR = join(ROOT, 'src/ai/models')
const FACTIONS = ['Turkey', 'Greece', 'Britain', 'France', 'Italy', 'Armenia', 'Bulgaria']

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1 || i === process.argv.length - 1) return fallback
  const n = Number(process.argv[i + 1])
  return Number.isFinite(n) ? n : fallback
}
const GAMES = arg('games', 50)

// The pre-landing models were trained on a 51-wide vector; the current one is
// 54 wide because three decision features were appended to the MOVE block —
// in the middle of the vector, ahead of the 17 lookahead deltas. Padding the
// first layer with zero-weight columns at that exact spot makes an old model
// bit-identical to its trained self on the new layout (it scores every
// campaign decision equally and takes the first, but plays the war as trained).
const DECISION_FEATURES_AT = 34
const loadModel = (name: string): NetJSON => {
  const json: NetJSON = JSON.parse(readFileSync(join(MODEL_DIR, `${name.toLowerCase()}.json`), 'utf8'))
  if (json.sizes[0] === 51) {
    for (const row of json.weights[0]) row.splice(DECISION_FEATURES_AT, 0, 0, 0, 0)
    json.sizes[0] = 54
  }
  return json
}
const models: Record<string, NetJSON> = Object.fromEntries(FACTIONS.map((n) => [n, loadModel(n)]))

interface FactionAtGo {
  territories: number
  troops: number
}

interface Census {
  draft: number
  grants: number
  standingAtGo: number
  startingArmy: number
  goRound: number | null
  endRound: number
  board: Record<string, FactionAtGo>
}

const greatOffensiveRound = (game: Game): number => {
  const go = (game.campaign.variables as Record<string, { round?: unknown } | undefined>).greatOffensive
  return typeof go?.round === 'number' ? go.round : 0
}

const playOne = (): Census => {
  const game = new Game()
  const ai = new AiTurnController(game, { scorer: makeScorer(models), selector: makeSelector(models) })
  const turkey = game.humanPlayer.faction
  const startingArmy = turkey.territories.reduce((sum, t) => sum + t.troops, 0)

  let draft = 0
  let grants = 0
  let counting = true

  // Every soldier enters the board through a territory's troop count. Watch the
  // writes and attribute each increase on a Turkish province by its call site:
  // the draft arrives through placeReinforcements, rule grants through the
  // campaign-events host. Anything else (advances, fortifies, convoys) is a
  // transfer and cancels itself out.
  for (const territory of game.territories) {
    let value = territory.troops
    Object.defineProperty(territory, 'troops', {
      configurable: true,
      get: () => value,
      set: (next: number) => {
        const delta = next - value
        value = next
        if (!counting || delta <= 0 || territory.faction !== turkey) return
        const stack = new Error().stack ?? ''
        if (stack.includes('placeReinforcements')) draft += delta
        else if (stack.includes('campaign-events')) grants += delta
      },
    })
  }

  let standingAtGo = 0
  let goRound: number | null = null
  const board: Record<string, FactionAtGo> = {}
  let guard = 0
  while (game.turn.phase !== 'gameover' && game.turn.round <= 28 && guard++ < 4000) {
    if (counting && greatOffensiveRound(game) > 0) {
      goRound = greatOffensiveRound(game)
      standingAtGo = turkey.territories.reduce((sum, t) => sum + t.troops, 0)
      for (const faction of game.factions)
        board[faction.name] = {
          territories: faction.territories.length,
          troops: faction.territories.reduce((sum, t) => sum + t.troops, 0),
        }
      counting = false
    }
    if (game.campaign.pendingDecision) {
      const q = game.campaign.pendingDecision
      const faction = game.turn.currentPlayer.faction
      const move = chooseMove(game, faction, decisionMoves(q), models[faction.name])
      if (move?.choiceKey) game.campaign.resolveDecision(move.choiceKey)
    }
    game.campaign.clearCards()
    if (game.turn.isGameOver) break
    ai.beginTurn()
    while (ai.attackStep()) {
      /* one attack per step, as the UI paces them */
    }
    ai.finishTurn()
    if (game.turn.currentPlayer.isHuman) playTurn(game, models[game.turn.currentPlayer.faction.name])
  }

  return { draft, grants, standingAtGo, startingArmy, goRound, endRound: game.turn.round, board }
}

const results: Census[] = []
for (let n = 0; n < GAMES; n++) results.push(playOne())

const fired = results.filter((r) => r.goRound !== null)
const stat = (values: number[]) => {
  const sorted = [...values].sort((a, b) => a - b)
  const mean = sorted.reduce((s, v) => s + v, 0) / sorted.length
  return {
    mean: mean.toFixed(1),
    median: String(sorted[Math.floor(sorted.length / 2)]),
    min: String(sorted[0]),
    max: String(sorted[sorted.length - 1]),
  }
}

console.log(`\n${GAMES} games, trained models, no exploration`)
console.log(`Turkey starts the war with ${results[0].startingArmy} armies`)
console.log(`the Great Offensive fired in ${fired.length}/${GAMES} games\n`)

if (fired.length) {
  console.log('  game   GO round   draft   grants   recruited   standing at GO')
  for (const [n, r] of fired.entries()) {
    const recruited = r.draft + r.grants
    console.log(
      `  ${String(n + 1).padStart(4)}   ${String(r.goRound).padStart(8)}   ${String(r.draft).padStart(5)}   ` +
        `${String(r.grants).padStart(6)}   ${String(recruited).padStart(9)}   ${String(r.standingAtGo).padStart(14)}`,
    )
  }

  const rows: [string, number[]][] = [
    ['GO round', fired.map((r) => r.goRound!)],
    ['draft (levy+cards+events)', fired.map((r) => r.draft)],
    ['rule grants (militia etc.)', fired.map((r) => r.grants)],
    ['total recruited', fired.map((r) => r.draft + r.grants)],
    ['standing at GO', fired.map((r) => r.standingAtGo)],
  ]
  console.log(
    `\n  ${'measure'.padEnd(28)} ${'mean'.padStart(7)} ${'median'.padStart(7)} ${'min'.padStart(6)} ${'max'.padStart(6)}`,
  )
  for (const [label, values] of rows) {
    const s = stat(values)
    console.log(
      `  ${label.padEnd(28)} ${s.mean.padStart(7)} ${s.median.padStart(7)} ${s.min.padStart(6)} ${s.max.padStart(6)}`,
    )
  }
}

if (fired.length) {
  console.log('\nthe board on the day of the offensive, everyone counted')
  console.log(
    `\n  ${'faction'.padEnd(10)} ${'terr mean'.padStart(9)} ${'median'.padStart(7)} ${'min'.padStart(5)} ${'max'.padStart(5)}` +
      `   ${'army mean'.padStart(9)} ${'median'.padStart(7)} ${'min'.padStart(5)} ${'max'.padStart(5)}`,
  )
  for (const name of FACTIONS) {
    const terr = stat(fired.map((r) => r.board[name]?.territories ?? 0))
    const troops = stat(fired.map((r) => r.board[name]?.troops ?? 0))
    console.log(
      `  ${name.padEnd(10)} ${terr.mean.padStart(9)} ${terr.median.padStart(7)} ${terr.min.padStart(5)} ${terr.max.padStart(5)}` +
        `   ${troops.mean.padStart(9)} ${troops.median.padStart(7)} ${troops.min.padStart(5)} ${troops.max.padStart(5)}`,
    )
  }
}

const missed = results.filter((r) => r.goRound === null)
if (missed.length)
  console.log(
    `\nno offensive in ${missed.length} games (war over or conditions unmet by round 28); ` +
      `they recruited ${stat(missed.map((r) => r.draft + r.grants)).mean} on average by the end`,
  )
