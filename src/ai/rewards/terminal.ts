import type Game from '../../game/game'
import type Faction from '../../game/faction'
import { NATIONAL_PACT } from '../../game/campaign-data'
import { AIMS } from './objectives'
import { aimHeld, coalitionShare, homeHeld, ultimateHeld } from './metrics'

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
  'overlay.defeat.title': -1, // wiped off the map
}

/**
 * Turkey's reward below the full Pact, CONTINUOUS in provinces held.
 *
 * The displayed ending stays a ladder — poor / partial / near, see gameOutcome —
 * but grading the MODEL on those flat rungs stranded it. A Turkey that clawed back
 * fourteen Pact provinces and one that held only four both scored the same flat
 * "their terms" −0.5, so across the entire 0–14 band — which is exactly where a
 * losing Turkey lives, eval has it ending on ~10 of 30 — there was no gradient to
 * climb and nothing pulling the model to defend one more province. The next rung
 * up (partial, +0.1) then arrived all at once at fifteen, a five-province cliff.
 *
 * This fills the flats with slope while PINNING the ladder's own thresholds: the
 * curve passes through +0.1 at the partial line (15) and +0.5 at the near line
 * (27), the same values the staircase had, so nothing about the tiers changes —
 * only that every province held now pays on the way, turning the dead basin into
 * a ramp toward the Pact. A stronger net Turkey is the point twice over: it is a
 * better opponent for the human, and in self-play it is a harder sparring partner,
 * which is the whole mechanism by which the occupiers get stronger too.
 */
const turkeyHeldReward = (held: number, total: number): number => {
  const partialAt = Math.floor(total / 2) // 15 of 30 — the truncated-peace line
  const nearAt = total - 3 // 27 of 30 — three provinces short
  if (held >= nearAt) return 0.5 + ((held - nearAt) / (total - nearAt)) * (0.85 - 0.5)
  if (held >= partialAt) return 0.1 + ((held - partialAt) / (nearAt - partialAt)) * (0.5 - 0.1)
  return -0.6 + (held / partialAt) * (0.1 - -0.6)
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
  ultShare = ultimateHeld(game, faction),
): number => {
  // a gentler curve than a square: reaching for the maximum and falling a
  // province short should still be worth more than never trying
  const bonus = ULTIMATE_BONUS * Math.max(0, Math.min(1, ultShare)) ** 1.5
  // Being conquered is a rout. Being scripted out of the war is not: Italy
  // evacuates the southwest and France leaves Cilicia by treaty, handing their
  // provinces over and vanishing from the map. Marking that as a defeat gives
  // them a fixed −1 they cannot avoid, and a constant is not a gradient.
  if (faction.eliminated && !game.campaign.atPeace(faction)) return -1
  if (faction.name === 'Turkey') {
    const total = NATIONAL_PACT.length
    const held = game.pactProgress
    // Routed off the map is a rout; a bad peace is not. Only elimination is the
    // floor — a Turkey that signed holding nothing still did better than one wiped out.
    if (game.humanPlayer.faction.eliminated) return TURKEY_ENDINGS['overlay.defeat.title']
    // Below the war aim the reward is continuous in provinces held (see
    // turkeyHeldReward): the flat "their terms" basin the model used to live in
    // is now a ramp, so defending one more province always pays.
    if (held < total) return turkeyHeldReward(held, total)
    // Past the war aim the ladder has one rung left and twenty provinces between
    // here and it. Paying the map share on a curve that rewards the FIRST steps —
    // rather than only the last — is what makes the march findable at all; a model
    // does not stumble twenty provinces for a flat 0.15. Total conquest (ultShare
    // = the whole map) lands exactly on the ladder top of 1.
    return 0.85 + 0.15 * Math.max(0, Math.min(1, ultShare)) ** 0.6
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
  Greece: { aim: 0.2, home: 0.55 },
}

/** What the whole stretch goal is worth on top of an ordinary good war. */
export const ULTIMATE_BONUS = 0.3
/** What leaving Turkey with nothing is worth to every one of its enemies. */
export const COALITION_BONUS = 0.6
