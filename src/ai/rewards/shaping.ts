import type Game from '../../game/game'
import type Faction from '../../game/faction'
import { NATIONAL_PACT } from '../../game/campaign-data'
import { AIMS, HOME, ULTIMATE } from './objectives'
import { heldDelta, type Snapshot } from './metrics'

/** What a faction earns per Pact province prised off Turkey this turn. */
const COALITION_RATE: Record<string, number> = {
  Greece: 0.05,
  Britain: 0.05,
  France: 0.05,
  Italy: 0.05,
  Armenia: 0.05,
  // Bulgaria is not in the Entente and its quarrel is with Greece; it gains from
  // a weakened Turkey but is not part of the same war effort
  Bulgaria: 0.02,
}

type Shaper = (before: Snapshot, after: Snapshot, game: Game, faction: Faction) => number

/**
 * Per-turn shaping. Keep the numbers small — a turn that goes well should be
 * worth a fraction of what winning the war is worth, or the model learns to
 * farm the shaping and never close the game out.
 */
export const SHAPING: Record<string, Shaper> = {
  // The National Pact, province by province, and nothing outside it. Losses of
  // Pact ground hurt more than gains help: the war is lost by giving it up.
  Turkey: (before, after) => {
    const pact = after.pactHeld - before.pactHeld
    const outside = after.territories - before.territories - pact
    // ground outside the Pact is a cost even when it comes with men on it: the
    // restraint rule is the war aim, and the model must not learn around it
    return pact * (pact > 0 ? 0.06 : 0.09) - Math.abs(outside) * 0.06 + (after.troops - before.troops) * 0.002
  },

  // Greece is paid for the occupation, not for square mileage: holding western
  // Anatolia is the campaign, and the army wasting away is how it ended.
  Greece: (before, after, game, faction) => {
    const aim = heldDelta(before, after, AIMS.Greece) * 0.12
    const lost = Math.min(0, after.troops - before.troops) * 0.004
    // an army that has wasted away cannot hold anything, but do not pile a
    // standing penalty on top of the ground it is already losing
    const dying = faction.troopTotal < 8 ? -0.03 : 0
    return aim + lost + dying
  },

  // Post-war demobilisation: London will hold the Straits and will not spend
  // divisions on Anatolia. Casualties are what Britain most wants to avoid.
  // Post-war demobilisation: London will hold the Straits and will not spend
  // divisions on Anatolia. Casualties are what Britain most wants to avoid —
  // but the penalty for ground outside its own aim exempts the Pact, or it
  // would be paid by the coalition for pushing north out of Mosul and fined
  // for it in the same breath, which is why it never did.
  Britain: (before, after) => {
    const aim = heldDelta(before, after, AIMS.Britain)
    const pactGained = Math.max(0, after.pactHeld - before.pactHeld)
    const wandering = Math.max(0, after.territories - before.territories - aim - pactGained)
    return aim * 0.1 + Math.min(0, after.troops - before.troops) * 0.012 - wandering * 0.03
  },

  // France wants Cilicia cheaply and is looking for the exit the whole time.
  France: (before, after) =>
    heldDelta(before, after, AIMS.France) * 0.09 + Math.min(0, after.troops - before.troops) * 0.014,

  // Italy fought nobody. Holding its concession is worth something; losing men
  // for anything at all is worth less than nothing.
  Italy: (before, after) =>
    heldDelta(before, after, AIMS.Italy) * 0.08 + Math.min(0, after.troops - before.troops) * 0.02,

  // The eastern claim, and a government that signs once the army is spent.
  Armenia: (before, after) =>
    heldDelta(before, after, AIMS.Armenia) * 0.09 + Math.min(0, after.troops - before.troops) * 0.01,

  // Bulgaria's war is with Greece over Thrace and Macedonia. Taking Turkish
  // ground is not a win for it — there is no quarrel there to settle.
  Bulgaria: (before, after) => {
    const aim = heldDelta(before, after, AIMS.Bulgaria) * 0.11
    // Turkish ground is not its quarrel — EXCEPT Edirne and the City, which it
    // claims for itself. Those are the maximum, and the penalty must not fight
    // the bonus that pays for them.
    const pact = after.pactHeld - before.pactHeld
    const claimed = heldDelta(before, after, ['edirne', 'istanbul'])
    return aim + Math.min(0, after.troops - before.troops) * 0.006 - Math.max(0, pact - claimed) * 0.02
  },
}

/**
 * What a province of your own country is worth, per turn, either way — and for
 * Greece, enough to outbid Anatolia. An Anatolian province pays Athens 0.12 from
 * its own shaper plus 0.05 from the coalition; a home province lost has to cost
 * more than that or the trade is always worth making. At 0.25, with the 1.5×
 * that losing ground carries, a home province lost costs 0.375 — better than
 * twice what an Anatolian one pays, so a Greece with armies to spare garrisons
 * Macedonia rather than throwing the surplus at the front. See TERMINAL_WEIGHT.
 */
export const HOME_RATE = 0.07
const HOME_RATE_BY_FACTION: Record<string, number> = { Greece: 0.25 }

/** Immediate reward for the turn that just ended. */
export const shape = (game: Game, faction: Faction, before: Snapshot, after: Snapshot): number => {
  const shaper = SHAPING[faction.name]
  const base = shaper ? shaper(before, after, game, faction) : 0
  // The shared war: ground prised off ANKARA pays every one of them, whatever
  // else they were sent to do. Measured on Turkey's holdings, not on "a Pact
  // province changed hands" — Antalya and Isparta are Pact provinces held by
  // Italy, and paying for those turned the shared war against Turkey into six
  // powers taking turns eating Italy.
  const coalition = (before.turkeyPact - after.turkeyPact) * (COALITION_RATE[faction.name] ?? 0)
  // ground you started the war holding: losing it costs more than taking it
  // back pays, because a country given away is not usually got back
  const homeSwing = heldDelta(before, after, HOME[faction.name] ?? [])
  const homeRate = HOME_RATE_BY_FACTION[faction.name] ?? HOME_RATE
  const home = homeSwing * (homeSwing < 0 ? homeRate * 1.5 : homeRate)
  // A breadcrumb towards the stretch goal. Without it the bonus is all-or-
  // nothing at the end of a 20-turn game and nothing would ever stumble into
  // it; with it, ground that serves the maximum is worth a little on the way.
  // Turkey's maximum is the whole map, but it may not reach for it until the
  // Pact is complete — that is the restraint rule, and a breadcrumb that paid
  // for foreign ground before then would teach the model to walk around it
  const chasing = faction.name !== 'Turkey' || game.pactProgress === NATIONAL_PACT.length
  const goal = faction.name === 'Turkey' ? game.territories.map((t) => t.slug) : (ULTIMATE[faction.name] ?? [])
  // Turkey's march past the Pact is the longest stretch goal on the board, so
  // its breadcrumb is the biggest: twenty provinces is a lot of turns to cross
  // on a signal that only arrives at the end
  const crumb = faction.name === 'Turkey' ? 0.08 : 0.04
  const stretch = chasing ? heldDelta(before, after, goal) * crumb : 0

  // a small standing cost for time, so nothing learns to sit still forever
  return base + coalition + home + stretch - 0.004
}
