// One worker's share of the training.
//
// Plays a batch of self-play games starting from the weights it was handed,
// trains on what it saw, and hands the weights back. The parent averages what
// every worker returns and deals the result out again for the next round —
// local SGD, which is what makes eight cores worth eight cores here: the
// expensive part is playing the games, and games are embarrassingly parallel.
//
// Started by scripts/train-ai.ts; not meant to be run directly.
import { readFileSync, writeFileSync } from 'node:fs'
import Game from '../src/game/game'
import { Net } from '../src/ai/net'
import { features, featuresFrom, stateFeatures } from '../src/ai/features'
import { snapshot, shape, terminal, aimHeld, ultimateHeld } from '../src/ai/rewards'
import {
  reinforceMoves,
  attackMoves,
  fortifyMoves,
  decisionMoves,
  chooseTwoPly,
  planTurn,
  REINFORCE_BATCH,
  type ScoreMany,
} from '../src/ai/policy'
import type { Move } from '../src/ai/features'
import { scriptedTurn, scriptedDecisionKey } from '../src/ai/scripted'
import { ReplayBuffer } from '../src/ai/replay-buffer'

const [inPath, outPath] = process.argv.slice(2)
const job = JSON.parse(readFileSync(inPath, 'utf8'))
const { games, explore, seed, factions, weights, pool, hyper, profile: profileEnabled } = job
const { LEARNING_RATE, DISCOUNT, BUFFER_MAX, BATCH, MAX_ROUNDS, LEAGUE_RATE, TD_BLEND, TWO_PLY, PLAN, PLAN_BUDGET } =
  hyper
// fraction of games anchored to a fixed scripted aggressor on one side, so the
// learning nets face strong play instead of only their own weak selves — half
// of those games script Turkey (the occupiers learn to beat a good Turkey),
// half script the occupiers (Turkey learns to beat good occupiers)
const SCRIPT_RATE: number = hyper.SCRIPT_RATE ?? 0

// deterministic per worker, so a run is reproducible from the parent's seed
let rngState = seed >>> 0
const random = () => {
  rngState = (rngState * 1664525 + 1013904223) >>> 0
  return rngState / 4294967296
}
Math.random = random

const nets: Record<string, Net> = {}
const buffers: Record<string, ReplayBuffer<{ input: number[]; reward: number }>> = {}
for (const name of factions) {
  nets[name] = Net.fromJSON(weights[name])
  buffers[name] = new ReplayBuffer(BUFFER_MAX)
}

// The league: past versions of every faction, kept by the parent. Each game a
// faction plays either as itself or as one of its own older selves, and only
// the current ones learn from what happened. Without this the seven co-evolve
// against exactly each other and the whole set drifts together — you get a
// Turkey that beats THIS Greece and loses to the one from ten rounds ago.
const league: Record<string, Net[]> = {}
for (const name of factions) league[name] = ((pool ?? []) as Record<string, never>[]).map((p) => Net.fromJSON(p[name]))

/** The net a faction plays with this game: itself, or one of its old selves. */
const seatFor = (name: string) => {
  if (!league[name].length || random() >= LEAGUE_RATE) return { net: nets[name], learning: true }
  return { net: league[name][Math.floor(random() * league[name].length)], learning: false }
}

const remember = (name: string, input: number[], reward: number) => {
  buffers[name].add({ input, reward })
}

const learn = (name: string) => {
  const buffer = buffers[name]
  if (buffer.length < BATCH) return
  const net = nets[name]
  for (let i = 0; i < BATCH; i++) {
    // prioritised: a turn that mattered is worth revisiting more often
    const a = buffer.sample(random)!
    const b = buffer.sample(random)!
    const pick = Math.abs(a.reward) >= Math.abs(b.reward) ? a : b
    net.train(pick.input, Math.max(-1, Math.min(1, pick.reward)), LEARNING_RATE)
  }
}

let seats: Record<string, { net: Net; learning: boolean; scripted?: boolean }> = {}

/**
 * Who plays each seat this game. Most games are self-play/league. A SCRIPT_RATE
 * fraction anchor one side to the scripted aggressor (non-learning); the other
 * side then learns from its own current net against strong, consistent play.
 */
const assignSeats = () => {
  if (SCRIPT_RATE > 0 && random() < SCRIPT_RATE) {
    const scriptTurkey = random() < 0.5
    return Object.fromEntries(
      factions.map((n: string) => {
        const scripted = scriptTurkey ? n === 'Turkey' : n !== 'Turkey'
        return [n, { net: nets[n], learning: !scripted, scripted }]
      }),
    )
  }
  return Object.fromEntries(factions.map((n: string) => [n, { ...seatFor(n), scripted: false }]))
}

/** Play a move on the board and hand back the undo — for the second ply. */
const hypothetically = (game: Game, faction: never, move: any) => {
  if (move.kind !== 'attack' || !move.from || !move.to) return null
  const { from, to } = move
  const survivors = Math.max(1, Math.round((from.troops - 1) * 0.6))
  if (from.troops <= survivors) return null
  const owner = to.faction
  const fromTroops = from.troops
  const toTroops = to.troops
  const turn = game.turn.snapshot()
  const idx = owner.territories.indexOf(to)
  if (idx >= 0) owner.territories.splice(idx, 1)
  ;(faction as any).territories.push(to)
  to.faction = faction
  to.troops = survivors
  from.troops = fromTroops - survivors
  game.turn.recordConquest(from.slug, to.slug)
  return () => {
    from.troops = fromTroops
    to.troops = toTroops
    to.faction = owner
    ;(faction as any).territories.pop()
    if (idx >= 0) owner.territories.splice(idx, 0, to)
    game.turn.configure({
      attacks: turn.attacks,
      conqueredTerritory: turn.conqueredTerritory,
    })
  }
}

const choose = (game: Game, faction: { name: string }, moves: any[]) => {
  if (!moves.length) return null
  if (random() < explore) {
    const end = moves.find((move) => move.kind === 'end')
    if (end && random() < 0.15) return end
    const active = end ? moves.filter((move) => move !== end) : moves
    return active[Math.floor(random() * active.length)] ?? end ?? null
  }
  const net = seats[faction.name].net
  // a whole shortlist off one reading of the board AND one pass over the
  // weights: before is hoisted, and the candidates go through the net together
  // so each weight row is applied across the batch while it is hot in cache.
  // Measured at ~2x the per-candidate version, which is most of a turn's cost.
  const scoreMany = (set: any[]) => {
    const before = stateFeatures(game, faction as never)
    return net.runBatch(set.map((move) => featuresFrom(before, game, faction as never, move)))
  }
  if (!TWO_PLY) {
    const values = scoreMany(moves)
    let best = moves[0]
    let bestScore = -Infinity
    for (let i = 0; i < moves.length; i++)
      if (values[i] > bestScore) {
        bestScore = values[i]
        best = moves[i]
      }
    return best
  }
  // per-faction search widths live in policy.ts — the weaker side thinks longer
  return chooseTwoPly(game, faction as never, moves, scoreMany, (move) => hypothetically(game, faction as never, move))
}

// A live-net batch scorer over the current board — the same contract eval-ai
// builds from the shipped JSON, so plan search runs identically in both.
const scoreForTraining =
  (game: Game, faction: { name: string }): ScoreMany =>
  (moves: Move[]) => {
    const before = stateFeatures(game, faction as never)
    return seats[faction.name].net.runBatch(moves.map((m) => featuresFrom(before, game, faction as never, m)))
  }

const playTurn = (game: Game, taken: { name: string; input: number[] }[]) => {
  const faction = game.turn.currentPlayer.faction
  const record = (move: never) => taken.push({ name: faction.name, input: features(game, faction, move) })

  let guard = 0
  while (game.turn.phase === 'reinforce' && game.turn.reinforcementsLeft > 0 && guard++ < 400) {
    while (game.findTradeSet(faction.hand)) game.tradeCards(faction)
    const move = choose(game, faction, reinforceMoves(faction))
    if (!move?.from) break
    record(move as never)
    for (let i = 0; i < REINFORCE_BATCH && game.turn.reinforcementsLeft > 0; i++)
      game.turn.placeReinforcements(move.from.slug)
  }
  if (game.turn.phase === 'reinforce') game.turn.advancePhase()

  let attackGuard = 0
  const attempted = new Set<string>()
  while (game.turn.phase === 'attack' && attackGuard++ < 200) {
    const move = choose(game, faction, attackMoves(game, faction, attempted))
    if (!move) break
    record(move as never)
    if (move.kind === 'end' || !move.from || !move.to) break
    if (!game.combat.begin(move.from.slug, move.to.slug)) break
    attempted.add(`${move.from.slug}>${move.to.slug}`)
    let rounds = 0
    while (rounds++ < 60) {
      const step = game.combat.step(move.from.slug, move.to.slug)
      if (!step || !step.pending) break
      if (!game.combat.worthPressing(move.from, move.to)) {
        game.combat.pullBack()
        break
      }
    }
    if (game.combat.pendingAdvance) game.combat.advance(game.combat.pendingAdvance.max)
    if (game.turn.isGameOver) return
  }
  if (game.turn.phase === 'attack') game.turn.advancePhase()

  if (game.turn.phase === 'fortify') {
    const move = choose(game, faction, fortifyMoves(game, faction))
    if (move) {
      record(move as never)
      if (move.from && move.to) {
        const n = Math.max(1, Math.floor((move.from.troops - 1) / 2))
        if (move.kind === 'fortify') game.movement.fortify(move.from.slug, move.to.slug, n)
        else if (move.kind === 'sail') game.movement.embark(move.from.slug, move.to.slug, n)
      }
    }
    if (game.turn.phase === 'fortify') game.turn.advancePhase()
  }
}

const stats = { turkeyWins: 0, rounds: 0, ends: {} as Record<string, number>, ults: {} as Record<string, number> }
const profile: {
  game: number
  elapsedMs: number
  playMs: number
  creditMs: number
  learnMs: number
  bufferEntries: number
}[] = []
const profileStarted = performance.now()
let playMs = 0
let creditMs = 0
let learnMs = 0
for (const name of factions) {
  stats.ends[name] = 0
  stats.ults[name] = 0
}

for (let g = 0; g < games; g++) {
  const playStarted = performance.now()
  seats = assignSeats()
  const game = new Game()
  const turns: { name: string; moves: { name: string; input: number[] }[]; reward: number }[] = []
  const aimSum: Record<string, number> = {}
  const aimTurns: Record<string, number> = {}
  for (const name of factions) {
    aimSum[name] = 0
    aimTurns[name] = 0
  }
  let guard = 0

  while (game.turn.phase !== 'gameover' && game.turn.round <= MAX_ROUNDS && guard++ < 3000) {
    const faction = game.turn.currentPlayer.faction
    const before = snapshot(game, faction)
    const taken: { name: string; input: number[] }[] = []

    const scripted = seats[faction.name].scripted
    if (game.campaign.pendingDecision) {
      const q = game.campaign.pendingDecision
      if (scripted) {
        // answers by script, learns nothing, records nothing
        const key = scriptedDecisionKey(q.choices?.map((c: { key: string }) => c.key) ?? [])
        if (key) game.campaign.resolveDecision(key)
      } else {
        const move = choose(game, faction, decisionMoves(q))
        if (move?.choiceKey) {
          taken.push({ name: faction.name, input: features(game, faction, move) })
          game.campaign.resolveDecision(move.choiceKey)
        }
      }
    }
    game.campaign.clearCards()
    if (!game.turn.isGameOver) {
      if (scripted) {
        // a fixed strong opponent — plays by script, learns nothing
        scriptedTurn(game, faction)
      } else if (PLAN && random() >= explore) {
        // plan search plays the exploit turns; exploration keeps the per-move
        // random path so early training still discovers lines the plan would not
        planTurn(game, faction, scoreForTraining(game, faction), {
          budget: PLAN_BUDGET,
          record: (m: Move) => taken.push({ name: faction.name, input: features(game, faction, m) }),
        })
      } else {
        playTurn(game, taken)
      }
    }
    aimSum[faction.name] += aimHeld(game, faction)
    aimTurns[faction.name]++
    turns.push({ name: faction.name, moves: taken, reward: shape(game, faction, before, snapshot(game, faction)) })
    if (game.turn.isGameOver) break
  }

  const ends: Record<string, number> = {}
  for (const name of factions) {
    const faction = game.factions.find((f) => f.name === name)!
    const share = aimTurns[name] ? aimSum[name] / aimTurns[name] : 0
    const ult = ultimateHeld(game, faction)
    ends[name] = terminal(game, faction, share, ult)
    stats.ends[name] += ends[name]
    if (ult >= 0.999) stats.ults[name]++
  }
  if (game.winner?.name === 'Turkey') stats.turkeyWins++
  stats.rounds += game.turn.round
  playMs += performance.now() - playStarted

  // Credit assignment.
  //
  // The discount runs over TURNS, not decisions. A faction makes a dozen
  // decisions in a turn, so discounting each one separately raises 0.94 to the
  // power of seventy-five over a game and wipes the verdict out entirely before
  // it reaches anything that happened early — which is exactly what it did:
  // the first version of this learned almost nothing about the war it played.
  //
  // Within a turn the decisions share that turn's return, and each is nudged
  // towards what the net makes of the position it led to. That last part is the
  // TD half, and it is off by default: bootstrapping off a net's own estimates
  // when rewards are this sparse drags every value towards zero and the whole
  // set goes passive. Measured, not assumed — see --td.
  const creditStarted = performance.now()
  for (const name of factions) {
    if (!seats[name].learning) continue
    const net = nets[name]
    const own = turns.filter((t) => t.name === name)
    if (!own.length) continue

    // per-turn Monte-Carlo return, terminal verdict included
    const returns: number[] = new Array(own.length)
    let acc = ends[name]
    for (let i = own.length - 1; i >= 0; i--) {
      acc = own[i].reward + DISCOUNT * acc
      returns[i] = acc
    }

    for (const [i, turn] of own.entries()) {
      for (const [j, move] of turn.moves.entries()) {
        let target = returns[i]
        if (TD_BLEND > 0) {
          const next = j + 1 < turn.moves.length ? turn.moves[j + 1].input : own[i + 1]?.moves[0]?.input
          const td = turn.reward + DISCOUNT * (next ? net.run(next) : ends[name])
          target = TD_BLEND * td + (1 - TD_BLEND) * target
        }
        remember(name, move.input, target)
      }
    }
  }
  creditMs += performance.now() - creditStarted
  const learnStarted = performance.now()
  for (const name of factions) if (seats[name].learning) learn(name)
  learnMs += performance.now() - learnStarted
  if (profileEnabled && ((g + 1) % 10 === 0 || g + 1 === games))
    profile.push({
      game: g + 1,
      elapsedMs: performance.now() - profileStarted,
      playMs,
      creditMs,
      learnMs,
      bufferEntries: factions.reduce((total: number, name: string) => total + buffers[name].length, 0),
    })
}
writeFileSync(
  outPath,
  JSON.stringify({
    weights: Object.fromEntries(factions.map((n: string) => [n, nets[n].toJSON()])),
    stats: { ...stats, profile: profileEnabled ? profile : undefined },
  }),
)
