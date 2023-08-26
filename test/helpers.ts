// Shared fixtures. The engine has no browser dependencies, so it imports
// straight into Node — these helpers only exist to make the intent of each
// test readable rather than to work around anything.
import Game, { NATIONAL_PACT, HISTORICAL_EVENTS } from '../src/game/game'
import Faction from '../src/game/faction'

export const PACT = NATIONAL_PACT

export const ASSEMBLY_SEATS = ['ankara', 'sivas']

/** A fresh game with the human seated, ready for fireEvents at any round. */
export const fresh = (): Game => {
  const g = new Game()
  g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
  return g
}

export const turkey = (g: Game): Faction => g.humanPlayer.faction
export const faction = (g: Game, name: string): Faction => g.factions.find(f => f.name === name) as Faction

/** Hand a province to a faction without going through combat. */
export const give = (g: Game, slug: string, to: Faction, round = g.round) => {
  g.bySlug[slug].changeControl(to, round)
  return g.bySlug[slug]
}

type Answer = 'requisition' | 'decline' | 'accept' | 'reject'

/** Pick a valid answer: the caller's if the question offers it, else a default
 *  that keeps the timeline running (refuse terms rather than end the war). */
const answerFor = (question: { textKey: string; choices?: { key: string }[] }, wanted: Answer) =>
  question.choices?.some(c => c.key === wanted)
    ? wanted
    : question.textKey === 'event.conference'
      ? 'reject'
      : 'decline'

/** Run the event pass for one round and return the notices it queued. */
export const fireAt = (g: Game, round: number, answer: Answer = 'decline'): string[] => {
  g.round = round
  g.phase = 'reinforce'
  g.pendingCards.length = 0
  g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
  g.fireEvents()
  const seen: string[] = []
  if (g.pendingDecision) {
    const question = g.pendingDecision
    seen.push(question.textKey)
    g.resolveDecision(answerFor(question, answer))
  }
  seen.push(...g.pendingCards)
  return seen
}

/** Play the event pass across a span of rounds, collecting everything raised. */
export const fireThrough = (g: Game, from: number, to: number, answer: Answer = 'decline') => {
  const all: { round: number; key: string }[] = []
  for (let r = from; r <= to; r++) for (const key of fireAt(g, r, answer)) all.push({ round: r, key })
  return all
}

/** The round an event is scheduled for, straight off the table. */
export const roundOfEvent = (textKey: string): number => {
  const ev = HISTORICAL_EVENTS.find(e => e.textKey === textKey)
  if (!ev) throw new Error(`no such event: ${textKey}`)
  return ev.round
}

/** Every event key in table order. */
export const eventKeys = () => HISTORICAL_EVENTS.map(e => e.textKey)

/** Deterministic dice: forces every roll to a fixed value for the callback. */
export const withRandom = <T>(value: number, fn: () => T): T => {
  const real = Math.random
  Math.random = () => value
  try {
    return fn()
  } finally {
    Math.random = real
  }
}

/** Stage an attack the human can resolve. */
export const stageAttack = (g: Game, fromSlug: string, toSlug: string, attackers: number, defenders: number) => {
  const from = g.bySlug[fromSlug]
  const to = g.bySlug[toSlug]
  from.troops = attackers
  to.troops = defenders
  g.phase = 'attack'
  g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
  return { from, to }
}

/** First province adjacent to Turkey that satisfies a predicate. */
export const findBorder = (g: Game, pred: (slug: string) => boolean) => {
  for (const own of turkey(g).territories)
    for (const next of own.adjacent)
      if (next.faction !== turkey(g) && pred(next.slug)) return { from: own, to: next }
  throw new Error('no matching border province')
}

export type Fired = { round: number; key: string }

/**
 * Play real turns — startTurn, phases, endTurn — and record every notice as it
 * is raised. This is the whole loop, not fireEvents in isolation.
 */
export const drive = (
  g: Game,
  upTo: number,
  opts: { orders?: boolean; terms?: 'accept' | 'reject'; aiFights?: boolean; onRound?: (g: Game) => void } = {}
) => {
  const fired: Fired[] = []
  const collect = () => {
    for (const key of g.pendingCards) fired.push({ round: g.round, key })
    g.clearEventCards()
  }
  let guard = 0
  let lastRound = g.round
  collect()
  while (g.phase !== 'gameover' && g.round <= upTo && guard++ < 6000) {
    if (g.round !== lastRound) {
      lastRound = g.round
      opts.onRound?.(g)
    }
    if (g.pendingDecision) {
      const question = g.pendingDecision
      fired.push({ round: g.round, key: question.textKey })
      const answer =
        question.textKey === 'event.conference'
          ? opts.terms ?? 'accept'
          : opts.orders
            ? 'requisition'
            : 'decline'
      g.resolveDecision(answer)
    }
    collect()
    if (g.currentPlayer.isHuman) {
      let inner = 0
      while (g.phase === 'reinforce' && g.reinforcementsLeft > 0 && inner++ < 500) g.autoPlaceReinforcements()
      if (g.phase === 'reinforce') g.endPhase()
      if (g.phase === 'attack') g.endPhase()
      if (g.phase === 'fortify') g.endPhase()
    } else if (opts.aiFights) {
      g.playAiTurn()
    } else {
      // The AI holds position by default. A scenario is measuring a timeline —
      // which event fires, on which round, under which condition — and a real
      // AI turn puts dice in the middle of that: Bulgaria may perfectly legally
      // chase Greece out of Anatolia, and İnönü and Sakarya then have no Greek
      // army left to fight. Pass aiFights to let them off the leash.
      g.aiBeginTurn()
      g.aiAttacksLeft = 0
      g.aiFinishTurn()
    }
    collect()
  }
  return fired
}

/** Garrison Turkey so heavily that no AI ever clears its aggression threshold. */
export const entrenchTurkey = (g: Game, troops = 400) => {
  for (const t of turkey(g).territories) t.troops = troops
  return g
}

