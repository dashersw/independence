// Shared fixtures. The engine has no browser dependencies, so it imports
// straight into Node — these helpers only exist to make the intent of each
// test readable rather than to work around anything.
import Game from '../src/game/game'
import { NATIONAL_PACT } from '../src/game/campaign-data'
import { CAMPAIGN_EVENTS, HISTORICAL_EVENTS } from '../src/game/campaign-events'
import Faction from '../src/game/faction'
import { AiTurnController, playAiTurn } from '../src/ai/turn-controller'

export const PACT = NATIONAL_PACT

export const ASSEMBLY_SEATS = ['ankara', 'sivas']

/** A fresh game with the human seated, ready for fireEvents at any round. */
export const fresh = (): Game => {
  const g = new Game()
  g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
  return g
}

export const turkey = (g: Game): Faction => g.humanPlayer.faction
export const faction = (g: Game, name: string): Faction => g.factions.find((f) => f.name === name) as Faction

/** Read and write engine-owned campaign state without adding named fields to Game. */
export const variable = <Value = unknown>(g: Game, path: string) => CAMPAIGN_EVENTS.variable<Value>(g, path)
export const setVariable = (g: Game, path: string, value: unknown) => CAMPAIGN_EVENTS.setVariable(g, path, value)

/** Exercise declarations through the generic engine API. */
export const applyEvent = (g: Game, eventId: string) => CAMPAIGN_EVENTS.apply(eventId, g)
export const conditionsPass = (g: Game, eventId: string, attempts = 0) =>
  CAMPAIGN_EVENTS.conditionsPass(eventId, g, g.turn.round, attempts)
export const eventAvailable = (g: Game, eventId: string, attempts = 0) =>
  g.turn.round >= CAMPAIGN_EVENTS.round(eventId) && conditionsPass(g, eventId, attempts)
export const attackAllowed = (g: Game, attacker: Faction, target: Game['territories'][number]) =>
  !g.campaign.frontClosed(attacker, target)
export const landingPowersAlive = (g: Game) => {
  const names = CAMPAIGN_EVENTS.value<string[]>('event.conference', 'landingPowers')
  return CAMPAIGN_EVENTS.select(g, 'factions').some(
    (entity) => names.includes(String(entity.name)) && !entity.eliminated,
  )
}
export const group = <Value extends string = string>(name: string) => CAMPAIGN_EVENTS.group<Value>(name)
export const chooseEvent = (g: Game, eventId: string, choiceKey: string) =>
  CAMPAIGN_EVENTS.resolveChoice(CAMPAIGN_EVENTS.event(eventId), choiceKey, g, g.turn.round)
export const upkeep = (g: Game) => CAMPAIGN_EVENTS.fireRules('round.upkeep', g)

/** Inspect the actual serialized landing selector instead of duplicating it in tests. */
export const landingSites = (g: Game) => {
  const rule = CAMPAIGN_EVENTS.document.rules?.find((candidate) => candidate.id === 'rule.conference.landings')
  const where = rule?.then.battles?.[0]?.target.where
  return CAMPAIGN_EVENTS.select(g, 'territories', where).map((entity) => entity.$source as Game['territories'][number])
}

/** Hand a province to a faction without going through combat. */
export const give = (g: Game, slug: string, to: Faction, round = g.turn.round) => {
  g.board.changeControl(g.bySlug[slug], to, round)
  return g.bySlug[slug]
}

type Answer = 'requisition' | 'decline' | 'accept' | 'reject'

/** Pick a valid answer: the caller's if the question offers it, else a default
 *  that keeps the timeline running (refuse terms rather than end the war). */
const answerFor = (question: { id: string; choices?: { key: string }[] }, wanted: Answer) =>
  question.choices?.some((c) => c.key === wanted) ? wanted : question.id === 'event.conference' ? 'reject' : 'decline'

/** Run the event pass for one round and return the notices it queued. */
export const fireAt = (g: Game, round: number, answer: Answer = 'decline'): string[] => {
  g.turn.configure({ round: round })
  g.turn.configure({ phase: 'reinforce' })
  g.campaign.pendingCards.length = 0
  g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
  g.campaign.dispatch()
  const seen: string[] = []
  if (g.campaign.pendingDecision) {
    const question = g.campaign.pendingDecision
    seen.push(question.id)
    g.campaign.resolveDecision(answerFor(question, answer))
  }
  seen.push(...g.campaign.pendingCards)
  return seen
}

/** Play the event pass across a span of rounds, collecting everything raised. */
export const fireThrough = (g: Game, from: number, to: number, answer: Answer = 'decline') => {
  const all: { round: number; key: string }[] = []
  for (let r = from; r <= to; r++) for (const key of fireAt(g, r, answer)) all.push({ round: r, key })
  return all
}

/** The round an event is scheduled for, straight off the table. */
export const roundOfEvent = (eventId: string): number => {
  const ev = HISTORICAL_EVENTS.find((event) => event.id === eventId)
  if (!ev) throw new Error(`no such event: ${eventId}`)
  return ev.round
}

/** Every event key in table order. */
export const eventKeys = () => HISTORICAL_EVENTS.map((event) => event.id)

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
  g.turn.configure({ phase: 'attack' })
  g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
  return { from, to }
}

/** First province adjacent to Turkey that satisfies a predicate. */
export const findBorder = (g: Game, pred: (slug: string) => boolean) => {
  for (const own of turkey(g).territories)
    for (const next of own.adjacent) if (next.faction !== turkey(g) && pred(next.slug)) return { from: own, to: next }
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
  opts: { orders?: boolean; terms?: 'accept' | 'reject'; aiFights?: boolean; onRound?: (g: Game) => void } = {},
) => {
  const fired: Fired[] = []
  const ai = new AiTurnController(g)
  const collect = () => {
    for (const key of g.campaign.pendingCards) fired.push({ round: g.turn.round, key })
    g.campaign.clearCards()
  }
  let guard = 0
  let lastRound = g.turn.round
  collect()
  while (g.turn.phase !== 'gameover' && g.turn.round <= upTo && guard++ < 6000) {
    if (g.turn.round !== lastRound) {
      lastRound = g.turn.round
      opts.onRound?.(g)
    }
    if (g.campaign.pendingDecision) {
      const question = g.campaign.pendingDecision
      fired.push({ round: g.turn.round, key: question.id })
      const answer =
        question.id === 'event.conference' ? (opts.terms ?? 'accept') : opts.orders ? 'requisition' : 'decline'
      g.campaign.resolveDecision(answer)
    }
    collect()
    if (g.turn.currentPlayer.isHuman) {
      let inner = 0
      while (g.turn.phase === 'reinforce' && g.turn.reinforcementsLeft > 0 && inner++ < 500)
        g.reinforcements.autoPlace()
      if (g.turn.phase === 'reinforce') g.turn.advancePhase()
      if (g.turn.phase === 'attack') g.turn.advancePhase()
      if (g.turn.phase === 'fortify') g.turn.advancePhase()
    } else if (opts.aiFights) {
      playAiTurn(g)
    } else {
      // The AI holds position by default. A scenario is measuring a timeline —
      // which event fires, on which round, under which condition — and a real
      // AI turn puts dice in the middle of that: Bulgaria may perfectly legally
      // chase Greece out of Anatolia, and İnönü and Sakarya then have no Greek
      // army left to fight. Pass aiFights to let them off the leash.
      ai.beginTurn()
      ai.finishTurn()
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
