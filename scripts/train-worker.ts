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
import { reinforceMoves, attackMoves, fortifyMoves, chooseTwoPly, REINFORCE_BATCH } from '../src/ai/policy'

const [inPath, outPath] = process.argv.slice(2)
const job = JSON.parse(readFileSync(inPath, 'utf8'))
const { games, explore, seed, factions, weights, pool, hyper } = job
const { LEARNING_RATE, DISCOUNT, BUFFER_MAX, BATCH, MAX_ROUNDS, LEAGUE_RATE, TD_BLEND, TWO_PLY } = hyper

// deterministic per worker, so a run is reproducible from the parent's seed
let rngState = seed >>> 0
const random = () => {
  rngState = (rngState * 1664525 + 1013904223) >>> 0
  return rngState / 4294967296
}
Math.random = random

const nets: Record<string, Net> = {}
const buffers: Record<string, { input: number[]; reward: number }[]> = {}
for (const name of factions) {
  nets[name] = Net.fromJSON(weights[name])
  buffers[name] = []
}

// The league: past versions of every faction, kept by the parent. Each game a
// faction plays either as itself or as one of its own older selves, and only
// the current ones learn from what happened. Without this the seven co-evolve
// against exactly each other and the whole set drifts together — you get a
// Turkey that beats THIS Greece and loses to the one from ten rounds ago.
const league: Record<string, Net[]> = {}
for (const name of factions) league[name] = ((pool ?? []) as Record<string, never>[]).map(p => Net.fromJSON(p[name]))

/** The net a faction plays with this game: itself, or one of its old selves. */
const seatFor = (name: string) => {
  if (!league[name].length || random() >= LEAGUE_RATE) return { net: nets[name], learning: true }
  return { net: league[name][Math.floor(random() * league[name].length)], learning: false }
}

const remember = (name: string, input: number[], reward: number) => {
  const buffer = buffers[name]
  buffer.push({ input, reward })
  if (buffer.length > BUFFER_MAX) buffer.splice(0, buffer.length - BUFFER_MAX)
}

const learn = (name: string) => {
  const buffer = buffers[name]
  if (buffer.length < BATCH) return
  const net = nets[name]
  for (let i = 0; i < BATCH; i++) {
    // prioritised: a turn that mattered is worth revisiting more often
    const a = buffer[Math.floor(random() * buffer.length)]
    const b = buffer[Math.floor(random() * buffer.length)]
    const pick = Math.abs(a.reward) >= Math.abs(b.reward) ? a : b
    net.train(pick.input, Math.max(-1, Math.min(1, pick.reward)), LEARNING_RATE)
  }
}

let seats: Record<string, { net: Net; learning: boolean }> = {}

/** Play a move on the board and hand back the undo — for the second ply. */
const hypothetically = (faction: never, move: any) => {
  if (move.kind !== 'attack' || !move.from || !move.to) return null
  const { from, to } = move
  const survivors = Math.max(1, Math.round((from.troops - 1) * 0.6))
  if (from.troops <= survivors) return null
  const owner = to.faction
  const fromTroops = from.troops
  const toTroops = to.troops
  const idx = owner.territories.indexOf(to)
  if (idx >= 0) owner.territories.splice(idx, 1)
  ;(faction as any).territories.push(to)
  to.faction = faction
  to.troops = survivors
  from.troops = fromTroops - survivors
  return () => {
    from.troops = fromTroops
    to.troops = toTroops
    to.faction = owner
    ;(faction as any).territories.pop()
    if (idx >= 0) owner.territories.splice(idx, 0, to)
  }
}

const choose = (game: Game, faction: { name: string }, moves: any[]) => {
  if (!moves.length) return null
  if (random() < explore) return moves[Math.floor(random() * moves.length)]
  const net = seats[faction.name].net
  // a whole shortlist off one reading of the board AND one pass over the
  // weights: before is hoisted, and the candidates go through the net together
  // so each weight row is applied across the batch while it is hot in cache.
  // Measured at ~2x the per-candidate version, which is most of a turn's cost.
  const scoreMany = (set: any[]) => {
    const before = stateFeatures(game, faction as never)
    return net.runBatch(set.map(move => featuresFrom(before, game, faction as never, move)))
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
  return chooseTwoPly(game, faction as never, moves, scoreMany, move => hypothetically(faction as never, move))
}

const playTurn = (game: Game, taken: { name: string; input: number[] }[]) => {
  const faction = game.currentPlayer.faction
  const record = (move: never) => taken.push({ name: faction.name, input: features(game, faction, move) })

  let guard = 0
  while (game.phase === 'reinforce' && game.reinforcementsLeft > 0 && guard++ < 400) {
    while (game.findTradeSet(faction.hand)) game.tradeCards(faction)
    const move = choose(game, faction, reinforceMoves(faction))
    if (!move?.from) break
    record(move as never)
    for (let i = 0; i < REINFORCE_BATCH && game.reinforcementsLeft > 0; i++)
      game.placeReinforcement(move.from.slug)
  }
  if (game.phase === 'reinforce') game.endPhase()

  let attacks = 0
  while (game.phase === 'attack' && attacks < 12) {
    const move = choose(game, faction, attackMoves(game, faction))
    if (!move) break
    record(move as never)
    if (move.kind === 'end' || !move.from || !move.to) break
    if (!game.beginAttack(move.from.slug, move.to.slug)) break
    attacks++
    let rounds = 0
    while (rounds++ < 60) {
      const step = game.attackRound(move.from.slug, move.to.slug)
      if (!step || !step.pending) break
      if (!game.worthPressing(move.from, move.to)) {
        game.pullBack()
        break
      }
    }
    if (game.pendingAdvance) game.advance(game.pendingAdvance.max)
    if (game.phase === 'gameover') return
  }
  if (game.phase === 'attack') game.endPhase()

  if (game.phase === 'fortify') {
    const move = choose(game, faction, fortifyMoves(game, faction))
    if (move) {
      record(move as never)
      if (move.from && move.to) {
        const n = Math.max(1, Math.floor((move.from.troops - 1) / 2))
        if (move.kind === 'fortify') game.fortify(move.from.slug, move.to.slug, n)
        else if (move.kind === 'sail') game.embark(move.from.slug, move.to.slug, n)
      }
    }
    if (game.phase === 'fortify') game.endPhase()
  }
}

const stats = { turkeyWins: 0, rounds: 0, ends: {} as Record<string, number>, ults: {} as Record<string, number> }
for (const name of factions) {
  stats.ends[name] = 0
  stats.ults[name] = 0
}

for (let g = 0; g < games; g++) {
  seats = Object.fromEntries(factions.map((n: string) => [n, seatFor(n)]))
  const game = new Game()
  const turns: { name: string; moves: { name: string; input: number[] }[]; reward: number }[] = []
  const aimSum: Record<string, number> = {}
  const aimTurns: Record<string, number> = {}
  for (const name of factions) {
    aimSum[name] = 0
    aimTurns[name] = 0
  }
  let guard = 0

  while (game.phase !== 'gameover' && game.round <= MAX_ROUNDS && guard++ < 3000) {
    const faction = game.currentPlayer.faction
    const before = snapshot(game, faction)
    const taken: { name: string; input: number[] }[] = []

    if (game.pendingDecision) {
      const q = game.pendingDecision
      game.resolveDecision(
        q.textKey === 'event.conference'
          ? 'accept'
          : q.choices?.some(c => c.key === 'requisition')
            ? 'requisition'
            : 'decline'
      )
    }
    game.clearEventCards()
    if (game.phase === 'gameover') break

    playTurn(game, taken)
    aimSum[faction.name] += aimHeld(game, faction)
    aimTurns[faction.name]++
    turns.push({ name: faction.name, moves: taken, reward: shape(game, faction, before, snapshot(game, faction)) })
  }

  const ends: Record<string, number> = {}
  for (const name of factions) {
    const faction = game.factions.find(f => f.name === name)!
    const share = aimTurns[name] ? aimSum[name] / aimTurns[name] : 0
    const ult = ultimateHeld(game, faction)
    ends[name] = terminal(game, faction, share, ult)
    stats.ends[name] += ends[name]
    if (ult >= 0.999) stats.ults[name]++
  }
  if (game.winner?.name === 'Turkey') stats.turkeyWins++
  stats.rounds += game.round

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
  for (const name of factions) {
    if (!seats[name].learning) continue
    const net = nets[name]
    const own = turns.filter(t => t.name === name)
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
  for (const name of factions) if (seats[name].learning) learn(name)
}
writeFileSync(
  outPath,
  JSON.stringify({
    weights: Object.fromEntries(factions.map((n: string) => [n, nets[n].toJSON()])),
    stats
  })
)
