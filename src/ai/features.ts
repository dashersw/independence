// What the network actually sees.
//
// One vector per (position, candidate move), scored by that faction's own net —
// an action-value net rather than a policy head, because a Risk turn offers
// hundreds of from→to pairs and a head with one output per pair would be mostly
// dead weights. Every number is bounded to roughly [0, 1] so no single feature
// can dominate the first layer before any training has happened.
//
// Three parts:
//   the position now  ⊕  the move  ⊕  what the move would CHANGE about it
//
// That last part is one step of lookahead, and it is a difference rather than a
// second copy of the board on purpose. Feeding both the before and after states
// was tried and made the model markedly worse: the two are near-identical
// vectors, so two thirds of the input carried the same information twice and
// the move itself was diluted three to one. The delta is the same lookahead
// with nothing repeated — and it is zero when a move changes nothing, which is
// exactly what "end" means.
//
// The layout is faction-agnostic on purpose: every faction reads the same
// vector, from its own side of the board, and learns its own weights over it.
// Nothing here says "you are Greece" — the behaviour has to come from the
// rewards, not from a label the net can key off.

import Game from '../game/game'
import { NATIONAL_PACT } from '../game/campaign-data'
import Faction from '../game/faction'
import Territory from '../game/territory'

// Experiment switch, so the lookahead can be measured rather than assumed.
// AI_LOOKAHEAD=0 drops the delta block entirely.
const LOOKAHEAD = process.env?.AI_LOOKAHEAD !== '0'

export const STATE_SIZE = 17
export const MOVE_SIZE = 20
export const INPUT_SIZE = STATE_SIZE + MOVE_SIZE + (LOOKAHEAD ? STATE_SIZE : 0)

export type MoveKind = 'reinforce' | 'attack' | 'fortify' | 'sail' | 'decision' | 'end'

export interface Move {
  kind: MoveKind
  from?: Territory
  to?: Territory
  choiceKey?: string
  choiceIndex?: number
  choiceCount?: number
}

const ASSEMBLY_SEATS = ['ankara', 'sivas']
const PACT = new Set(NATIONAL_PACT)
const clamp01 = (x: number) => (x < 0 ? 0 : x > 1 ? 1 : x)
const ratio = (a: number, b: number) => (b <= 0 ? 0 : clamp01(a / b))

/**
 * Rough odds the attacker clears the defender, from the stack sizes alone.
 * Not the engine's exact per-exchange table: this is a feature, and what the
 * net needs is a monotonic, bounded sense of "am I favoured here", which the
 * ratio of effective strengths gives without simulating anything.
 */
export const attackOdds = (attackers: number, defenders: number) => {
  const force = Math.max(0, attackers - 1)
  if (force <= 0) return 0
  // the defender wins ties, so it is worth about 15% more than its count
  return clamp01(force / (force + defenders * 1.15))
}

/** Expected survivors of an assault that succeeds — what would garrison it. */
const expectedSurvivors = (attackers: number, defenders: number) =>
  Math.max(1, Math.round((attackers - 1) * (1 - defenders / Math.max(1, attackers - 1 + defenders))))

interface Posture {
  borders: number
  ownBorder: number
  enemyBorder: number
  biggest: number
  atRisk: number
}

const posture = (faction: Faction): Posture => {
  let borders = 0
  let ownBorder = 0
  let enemyBorder = 0
  let biggest = 0
  let atRisk = 0
  for (const t of faction.territories) {
    if (t.troops > biggest) biggest = t.troops
    let frontier = false
    let threat = 0
    for (const n of t.adjacent)
      if (n.faction !== faction) {
        frontier = true
        enemyBorder += n.troops
        if (n.troops > threat) threat = n.troops
      }
    if (frontier) {
      borders++
      ownBorder += t.troops
      // a province an adjacent enemy could take outright is a province in danger
      if (threat > t.troops) atRisk++
    }
  }
  return { borders, ownBorder, enemyBorder, biggest, atRisk }
}

/** The position, from this faction's side of it. */
export const stateFeatures = (game: Game, faction: Faction, reinforcementFeature?: number): number[] => {
  const all = game.factions.reduce((n, f) => n + f.troopTotal, 0)
  let strongest = 0
  let rivals = 0
  for (const f of game.factions)
    if (f !== faction && !f.eliminated) {
      rivals++
      if (f.troopTotal > strongest) strongest = f.troopTotal
    }
  const held = faction.territories.filter((t) => PACT.has(t.slug)).length
  const p = posture(faction)
  // Men aboard ship are yours and are coming, but they are not on the board
  // this round. Without this the position looks like an army that has simply
  // been destroyed, and nothing would ever choose to embark.
  const atSea = game.movement.troopsAtSea(faction)
  return [
    clamp01(game.turn.round / 27),
    clamp01(faction.territories.length / 45),
    clamp01(faction.troopTotal / 200),
    ratio(faction.troopTotal, all),
    clamp01(atSea / 30),
    clamp01(strongest / 200),
    clamp01(held / NATIONAL_PACT.length),
    clamp01(rivals / 6),
    clamp01(p.borders / 20),
    clamp01(p.ownBorder / 150),
    clamp01(p.enemyBorder / 150),
    clamp01(faction.hand.length / 5),
    game.campaign.isPassive(faction) || game.campaign.frozen(faction) ? 1 : 0,
    // how the shared war against Ankara is going — the same number every
    // occupier is partly paid on, so it is worth being able to see
    clamp01(1 - game.pactProgress / NATIONAL_PACT.length),
    // provinces one enemy stack could take outright: the shape of the danger,
    // not just its size
    ratio(p.atRisk, faction.territories.length),
    // one big stack or many small ones — a different army entirely
    ratio(p.biggest, faction.troopTotal),
    // what next turn's levy will bring, which is what makes a loss affordable
    reinforcementFeature ?? clamp01(game.campaign.reinforcementsFor(faction) / 20),
  ]
}

/** The move under consideration. */
export const moveFeatures = (game: Game, faction: Faction, move: Move): number[] => {
  const { from, to } = move
  const target = to ?? from
  let ownNeighbours = 0
  let enemyFactions = 0
  if (target) {
    const seen = new Set<string>()
    for (const n of target.adjacent) {
      if (n.faction === faction) ownNeighbours++
      else seen.add(n.faction.name)
    }
    enemyFactions = seen.size
  }
  const defenderLoses = !!(to && to.faction !== faction && to.faction.territories.length === 1)
  const odds = move.kind === 'attack' ? attackOdds(from?.troops ?? 0, to?.troops ?? 0) : 0
  return [
    move.kind === 'reinforce' ? 1 : 0,
    move.kind === 'attack' ? 1 : 0,
    move.kind === 'fortify' ? 1 : 0,
    // a crossing is a transfer that costs two rounds of absence, and the net
    // has to be able to tell it apart from a march
    move.kind === 'sail' ? 1 : 0,
    move.kind === 'end' ? 1 : 0,
    clamp01((from?.troops ?? 0) / 30),
    clamp01((to?.troops ?? 0) / 30),
    odds,
    target && PACT.has(target.slug) ? 1 : 0,
    target && target.faction.alliance === 'turkey' ? 1 : 0,
    target && ASSEMBLY_SEATS.includes(target.slug) ? 1 : 0,
    clamp01(ownNeighbours / 6),
    // how deeply the current holder is dug in — a settled occupier is a
    // different proposition from one that arrived last turn
    target ? clamp01((game.turn.round - target.heldSince) / 8) : 0,
    defenderLoses ? 1 : 0,
    // pressure on the province itself: what sits next to it that is not ours
    target ? clamp01(target.adjacent.filter((n) => n.faction !== faction).reduce((n, t) => n + t.troops, 0) / 60) : 0,
    // a province on a seam between several enemies is a different prize from
    // one tucked behind a single front
    clamp01(enemyFactions / 4),
    // what the attack would leave behind if it worked
    move.kind === 'attack' ? clamp01(expectedSurvivors(from?.troops ?? 0, to?.troops ?? 0) / 30) : 0,
    move.kind === 'decision' ? 1 : 0,
    move.kind === 'decision' ? ratio(move.choiceIndex ?? 0, Math.max(1, (move.choiceCount ?? 1) - 1)) : 0,
    move.kind === 'decision' ? clamp01((move.choiceCount ?? 0) / 8) : 0,
  ]
}

/**
 * The position the move would leave, read by playing it on the board and
 * putting the board back. For an attack that means the outcome it is aiming at
 * — the province taken, at the expected cost — which the odds feature alongside
 * it says how much to believe.
 */
export const afterFeatures = (game: Game, faction: Faction, move: Move, reinforcementFeature?: number): number[] => {
  const { kind, from, to } = move
  const readState = () => stateFeatures(game, faction, reinforcementFeature)
  if (kind === 'end' || kind === 'decision' || !from) return readState()

  if (kind === 'reinforce') {
    from.troops++
    try {
      return readState()
    } finally {
      from.troops--
    }
  }

  // Sailing empties the province and puts the men nowhere: for two rounds they
  // hold nothing and defend nothing. That absence IS the move's cost, and it is
  // what the net has to weigh against wherever they are going.
  if (kind === 'sail') {
    const moved = game.movement.shippable(from)
    from.troops -= moved
    try {
      return readState()
    } finally {
      from.troops += moved
    }
  }

  if (kind === 'fortify' && to) {
    const moved = Math.max(1, Math.floor((from.troops - 1) / 2))
    from.troops -= moved
    to.troops += moved
    try {
      return readState()
    } finally {
      from.troops += moved
      to.troops -= moved
    }
  }

  if (kind === 'attack' && to) {
    const survivors = expectedSurvivors(from.troops, to.troops)
    const fromTroops = from.troops
    const owner = to.faction
    const ownerIndex = owner.territories.indexOf(to)
    const toState = {
      troops: to.troops,
      quietTurns: to.quietTurns,
      entrenched: to.entrenched,
      heldSince: to.heldSince,
    }
    game.board.changeControl(to, faction, game.turn.round)
    to.troops = survivors
    from.troops = fromTroops - survivors
    try {
      return readState()
    } finally {
      from.troops = fromTroops
      const factionIndex = faction.territories.indexOf(to)
      if (factionIndex >= 0) faction.territories.splice(factionIndex, 1)
      to.faction = owner
      owner.territories.splice(ownerIndex, 0, to)
      Object.assign(to, toState)
    }
  }

  return readState()
}

/**
 * The vector for one candidate, given the position it is being weighed from.
 *
 * The "before" half is the same for every candidate of a single decision — a
 * faction weighing forty attacks is looking at ONE board — so it is passed in
 * rather than recomputed forty times. That is most of the cost of scoring.
 */
export const featuresFrom = (before: number[], game: Game, faction: Faction, move: Move): number[] => {
  const out = new Array(INPUT_SIZE)
  if (!LOOKAHEAD) {
    for (let i = 0; i < STATE_SIZE; i++) out[i] = before[i]
    const m = moveFeatures(game, faction, move)
    for (let i = 0; i < MOVE_SIZE; i++) out[STATE_SIZE + i] = m[i]
    return out
  }
  const after = afterFeatures(game, faction, move, before[16])
  for (let i = 0; i < STATE_SIZE; i++) out[i] = before[i]
  const move16 = moveFeatures(game, faction, move)
  for (let i = 0; i < MOVE_SIZE; i++) out[STATE_SIZE + i] = move16[i]
  // the change, amplified: a single province moving is a fraction of a percent
  // of a board-wide summary, and unscaled it would sit under the noise floor
  for (let i = 0; i < STATE_SIZE; i++) {
    const d = (after[i] - before[i]) * DELTA_GAIN
    out[STATE_SIZE + MOVE_SIZE + i] = d < -1 ? -1 : d > 1 ? 1 : d
  }
  return out
}

/** How much the lookahead delta is scaled up before the net sees it. */
const DELTA_GAIN = 8

export const features = (game: Game, faction: Faction, move: Move): number[] =>
  featuresFrom(stateFeatures(game, faction), game, faction, move)
