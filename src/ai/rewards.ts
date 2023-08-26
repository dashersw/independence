// What each faction is actually playing for.
//
// This is where the personalities live. Every faction shares one network shape
// and one feature vector; what makes Britain garrison the Straits and Bulgaria
// chase Greece out of Thrace is that they are paid for different things. A
// reward that just said "hold more ground" would train seven identical
// conquerors and throw away the war being modelled.
//
// Each function scores the CHANGE across one turn, from that faction's side,
// and is deliberately small: shaping nudges, with the real signal coming from
// the terminal reward at the end of the game.

import Game, { NATIONAL_PACT } from '../game/game'
import Faction from '../game/faction'
import factionData from '../game/factions.json'

export interface Snapshot {
  territories: number
  troops: number
  pactHeld: number
  // what ANKARA holds — the coalition is paid for ground prised off Turkey,
  // and Turkey is not the only faction sitting on Pact provinces
  turkeyPact: number
  holds: Record<string, boolean>
  round: number
}

const PACT = new Set(NATIONAL_PACT)

/** Everything a reward function needs to compare one turn against the next. */
export const snapshot = (game: Game, faction: Faction): Snapshot => {
  const holds: Record<string, boolean> = {}
  for (const t of faction.territories) holds[t.slug] = true
  return {
    territories: faction.territories.length,
    // men aboard ship count: a crossing is not a casualty, and a shaper that
    // reads it as one fines a faction for using its own navy
    troops: faction.troopTotal + game.troopsAtSea(faction),
    pactHeld: faction.territories.filter(t => PACT.has(t.slug)).length,
    turkeyPact: game.pactProgress,
    holds,
    round: game.round
  }
}

const heldDelta = (before: Snapshot, after: Snapshot, slugs: string[]) =>
  slugs.reduce((n, slug) => n + ((after.holds[slug] ? 1 : 0) - (before.holds[slug] ? 1 : 0)), 0)

/** Provinces that define each occupier's war aim. */
export const AIMS: Record<string, string[]> = {
  // the occupation of western Anatolia, which is what the Greek army was there for
  Greece: ['izmir', 'aydin', 'balikesir', 'usak', 'kutahya', 'eskisehir', 'sakarya'],
  // the Straits and the capital: the only things London actually cared to hold
  Britain: ['istanbul', 'izmit', 'gelibolu', 'canakkale'],
  // Cilicia
  France: ['adana', 'maras', 'hatay'],
  // the southwest concession
  Italy: ['antalya', 'isparta'],
  // the eastern provinces claimed in 1919
  Armenia: ['kars', 'igdir', 'erzurum', 'van'],
  // Thrace and Macedonia — the quarrel is with Greece, not with Ankara
  Bulgaria: ['western-thrace', 'salonica', 'kozani'],
  Turkey: NATIONAL_PACT
}

/**
 * The stretch goal. Every faction has a war it was sent to fight (AIMS) and a
 * war it would rather have fought — the one its maximalists wanted. These pay
 * far more than the ordinary aim, and pay almost nothing until they are nearly
 * complete, so they stay a gamble rather than a second job.
 *
 * The engine already makes them a real branch rather than a fantasy: Italy and
 * France are scripted to hand their provinces over and leave, but a power that
 * has broken the peace does not withdraw. Going for the maximum means staying
 * in the war, which means the whole rest of the campaign is different.
 */
export const ULTIMATE: Record<string, string[]> = {
  // Megali: the occupation zone, the City and Thrace — AND Macedonia, which is
  // not a bonus but part of the definition. You do not achieve the Great Idea
  // by trading Salonica for Smyrna; a Greece that has lost Macedonia to Sofia
  // has lost the thing the Idea was about. Leaving home ground out of the
  // maximum is what let Bulgaria — whose maximum names those same provinces —
  // walk into a homeland nobody was paid to defend.
  Greece: [
    ...['izmir', 'aydin', 'balikesir', 'usak', 'kutahya', 'eskisehir', 'sakarya'],
    'istanbul',
    'edirne',
    'salonica',
    'kozani',
    'western-thrace'
  ],
  // the Straits and Mesopotamia both — the whole eastern position in one hand
  Britain: ['istanbul', 'izmit', 'gelibolu', 'canakkale', 'mosul', 'baghdad'],
  // out of Cilicia, through Ankara, to the Black Sea
  France: ['adana', 'maras', 'hatay', 'konya', 'ankara', 'kastamonu'],
  // the Anatolia promised at Sèvres: the southwest up to the Marmara, and the islands
  Italy: ['antalya', 'isparta', 'aydin', 'izmir', 'usak', 'kutahya', 'balikesir', 'canakkale', 'lesbos', 'rhodes'],
  // Wilsonian Armenia: the six eastern provinces, Erzurum and Elazığ included
  Armenia: ['kars', 'igdir', 'erzurum', 'van', 'elazig', 'diyarbakir', 'trabzon'],
  // San Stefano: Thrace and Macedonia, Edirne back after 1913, and the City
  // itself — the army reached Çatalca in 1912 and never stopped wanting it
  Bulgaria: ['western-thrace', 'salonica', 'kozani', 'edirne', 'istanbul'],
  // Turkey's is the whole map, handled separately: every province, not a list
  Turkey: []
}

/** How much of its stretch goal a faction holds now, as a fraction. */
export const ultimateHeld = (game: Game, faction: Faction): number => {
  if (faction.name === 'Turkey') return faction.territories.length / game.territories.length
  const goal = ULTIMATE[faction.name] ?? []
  if (!goal.length) return 0
  return goal.filter(slug => game.bySlug[slug]?.faction === faction).length / goal.length
}

/**
 * What the occupiers share.
 *
 * They are allies, and none of them has to be the one who wins: every province
 * Ankara does not end the war holding is worth something to all of them. Without
 * this only Greece was paid for taking Turkish ground at all — the others were
 * indifferent to it and Bulgaria was actively discouraged — so Turkey could walk
 * over them one at a time while each minded its own corner.
 */
export const coalitionShare = (game: Game) => 1 - game.pactProgress / NATIONAL_PACT.length

/** What a faction earns per Pact province prised off Turkey this turn. */
const COALITION_RATE: Record<string, number> = {
  Greece: 0.05,
  Britain: 0.05,
  France: 0.05,
  Italy: 0.05,
  Armenia: 0.05,
  // Bulgaria is not in the Entente and its quarrel is with Greece; it gains from
  // a weakened Turkey but is not part of the same war effort
  Bulgaria: 0.02
}

/**
 * What each faction started the war holding — its own country.
 *
 * Separate from AIMS, and needed alongside it. Five of the six occupiers have a
 * war aim made entirely of Misak-ı Millî provinces, which is ground Turkey is
 * fighting to take back; none of them had any reason to defend the country they
 * came FROM. Greece was paid for İzmir and not a lira for Salonica, so Bulgaria
 * — whose whole aim is Macedonia and Thrace — could walk into it unopposed.
 * Holding your own is not the same objective as taking somebody else's, and it
 * has to be paid for separately or it does not happen.
 */
export const HOME: Record<string, string[]> = Object.fromEntries(
  factionData.factions.map(f => [f.name, f.territories.map(t => t.slug)])
)

/** How much of its own country a faction still holds. */
export const homeHeld = (game: Game, faction: Faction): number => {
  const home = HOME[faction.name] ?? []
  if (!home.length) return 0
  return home.filter(slug => game.bySlug[slug]?.faction === faction).length / home.length
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
  }
}

/** How much of its war aim a faction holds right now, as a fraction. */
export const aimHeld = (game: Game, faction: Faction): number => {
  const aim = AIMS[faction.name] ?? []
  if (!aim.length) return 0
  return aim.filter(slug => game.bySlug[slug]?.faction === faction).length / aim.length
}

/**
 * Turkey is scored on the ending it actually got — the same ladder the overlay
 * shows the player, so the model is playing for the endings the game has rather
 * than for a number invented alongside them.
 */
export const TURKEY_ENDINGS: Record<string, number> = {
  'overlay.total.title': 1, // nothing on the map that is not Turkish
  'overlay.beyond.title': 0.92, // the border met and passed, but not everything taken
  'overlay.victory.title': 0.85, // the Pact held and the peace signed on its terms
  'overlay.lausanne.near.title': 0.5, // three provinces short
  'overlay.lausanne.partial.title': 0.1, // a truncated peace
  'overlay.lausanne.poor.title': -0.5, // peace on their terms
  'overlay.defeat.title': -1 // wiped off the map
}

/** The ending Turkey is heading for, whether or not the war has stopped yet. */
const turkeyGrade = (game: Game): number => {
  const key = game.outcome?.titleKey
  if (key && key in TURKEY_ENDINGS) return TURKEY_ENDINGS[key]
  const held = game.pactProgress
  const total = NATIONAL_PACT.length
  if (game.humanPlayer.faction.eliminated) return TURKEY_ENDINGS['overlay.defeat.title']
  if (held === total)
    return game.humanPlayer.faction.territories.length > total
      ? TURKEY_ENDINGS['overlay.beyond.title']
      : TURKEY_ENDINGS['overlay.victory.title']
  if (held >= total - 3) return TURKEY_ENDINGS['overlay.lausanne.near.title']
  if (held >= total / 2) return TURKEY_ENDINGS['overlay.lausanne.partial.title']
  return TURKEY_ENDINGS['overlay.lausanne.poor.title']
}

/**
 * The end of the war, from each faction's point of view.
 *
 * Turkey is graded on the ending it reached. Everyone else on how much of its
 * aim it held and for HOW LONG — not on the final map. Several of them leave by
 * script: Italy evacuates, France comes to terms, Armenia signs at Gümrü.
 * Scoring those on the last frame would hand them a fixed loss they cannot
 * affect, which is no gradient at all — the model would learn nothing because
 * nothing it did changed the number.
 *
 * On top of either sits the stretch goal, paid on the SQUARE of how much of it
 * was reached: half of it is worth a quarter of the bonus, so chasing it and
 * failing is a bad trade, and only something close to the whole thing pays.
 *
 * @param heldShare average fraction of its aim the faction held across the war
 * @param ultShare  how much of its stretch goal it holds when the war stops —
 *                  measured at the END, not at its peak, because several of
 *                  them start already holding the whole thing. Britain begins
 *                  the war on the Straits and in Mesopotamia; for it the
 *                  maximum is not a conquest but keeping all of it to the
 *                  finish, against a Turkey that is coming for both.
 */
export const terminal = (
  game: Game,
  faction: Faction,
  heldShare = aimHeld(game, faction),
  ultShare = ultimateHeld(game, faction)
): number => {
  // a gentler curve than a square: reaching for the maximum and falling a
  // province short should still be worth more than never trying
  const bonus = ULTIMATE_BONUS * Math.max(0, Math.min(1, ultShare)) ** 1.5
  // Being conquered is a rout. Being scripted out of the war is not: Italy
  // evacuates the southwest and France leaves Cilicia by treaty, handing their
  // provinces over and vanishing from the map. Marking that as a defeat gives
  // them a fixed −1 they cannot avoid, and a constant is not a gradient.
  if (faction.eliminated && !game.atPeace(faction)) return -1
  if (faction.name === 'Turkey') {
    // The ladder tops out at the whole map, but between "the Pact is secure"
    // and "there is nothing left to take" the ladder says nothing, and a model
    // will not stumble twenty provinces further for a flat 0.15. Once the war
    // aim is met, the rest of the map is paid for on the way.
    const grade = turkeyGrade(game)
    if (game.pactProgress < NATIONAL_PACT.length) return grade
    // Past the war aim the ladder has one rung left and twenty provinces
    // between here and it. Paying the map share on a curve that rewards the
    // FIRST steps — rather than only the last — is what makes the march
    // findable at all; a model does not stumble twenty provinces for 0.15.
    return Math.max(grade, 0.85 + 0.15 * Math.max(0, Math.min(1, ultShare)) ** 0.6)
  }
  if (!(AIMS[faction.name] ?? []).length) return 0
  // Three things, and the shared one is the biggest: how much of its own war it
  // held, how small it left Turkey, and whether it reached for the maximum.
  // None of them has to be the winner — a war that ends with Ankara holding
  // eight provinces is a good war for all of them.
  const weight = TERMINAL_WEIGHT[faction.name] ?? TERMINAL_WEIGHT.default
  const own =
    -0.5 +
    weight.aim * Math.max(0, Math.min(1, heldShare)) +
    weight.home * Math.max(0, Math.min(1, homeHeld(game, faction)))
  const team = COALITION_BONUS * coalitionShare(game)
  return Math.max(-1, Math.min(1, own + team + bonus))
}

/**
 * How a faction's final score divides between the war it was sent to fight and
 * the country it came from.
 *
 * The default leans on the war aim, which is right for five of the six: their
 * homelands are off the map or nowhere near the fighting, and a Britain that
 * "held Britain" has achieved nothing.
 *
 * Greece is the exception and it took a long time to see it. Its home is a real
 * front — Bulgaria's whole war aim names those provinces — so Athens has to
 * choose between Smyrna and Macedonia every turn, and the default told it
 * Smyrna was worth nearly twice as much. It believed us: trained Greece ends
 * the war holding Salonica one game in eight, having sold Macedonia to buy
 * Anatolia. Six rule changes were tried against this — a levy, the Neuilly cap,
 * the San Remo line, a tonnage limit, the occupied-ground rule, the Great Idea
 * rewritten to include home — and none moved it more than a few points, because
 * none of them touched the price. A balance sweep with no models at all holds
 * Salonica about half the time, which is the proof: the rules allow Macedonia
 * to be held. The reward is what sells it.
 *
 * History runs the other way round. Greece kept Macedonia from 1913 to the end
 * and beyond; what it lost was Anatolia.
 *
 * A first reversal — home 0.4 against aim 0.3 — moved home defence conditional
 * on survival but not the unconditional number: Greece still spent its army
 * forward, because the shaper's coalition pay for taking Turkish ground kept
 * offence attractive turn by turn. Then the reinforcement fix gave it MORE
 * army, and it spent the surplus on the front too — Salonica went backwards.
 * So home is pushed harder still: at 0.55 against 0.2 it is nearly three times
 * the war aim, enough that garrisoning Macedonia has to beat marching on Smyrna
 * even with a full treasury of men to spend.
 */
const TERMINAL_WEIGHT: Record<string, { aim: number; home: number }> = {
  default: { aim: 0.45, home: 0.25 },
  Greece: { aim: 0.2, home: 0.55 }
}

/** What the whole stretch goal is worth on top of an ordinary good war. */
export const ULTIMATE_BONUS = 0.3
/** What leaving Turkey with nothing is worth to every one of its enemies. */
export const COALITION_BONUS = 0.6
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
  const goal = faction.name === 'Turkey' ? game.territories.map(t => t.slug) : (ULTIMATE[faction.name] ?? [])
  // Turkey's march past the Pact is the longest stretch goal on the board, so
  // its breadcrumb is the biggest: twenty provinces is a lot of turns to cross
  // on a signal that only arrives at the end
  const crumb = faction.name === 'Turkey' ? 0.08 : 0.04
  const stretch = chasing ? heldDelta(before, after, goal) * crumb : 0

  // a small standing cost for time, so nothing learns to sit still forever
  return base + coalition + home + stretch - 0.004
}
