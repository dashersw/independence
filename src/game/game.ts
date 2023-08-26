import Faction, { Alliance, Card } from './faction'
import Territory from './territory'
import Player from './player'
import factionData from './factions.json'
import territoriesData from './territories.json'
import playerData from './db.json'
import { t, tFaction, tTerritory, tCase, tDateLoc, tList, getLang } from '../i18n'

export type Phase = 'reinforce' | 'attack' | 'fortify' | 'gameover'

/** Troops in the middle of a sea crossing. See SEA_LANES. */
export type Convoy = {
  faction: string
  from: string
  to: string
  troops: number
  /** the round they come ashore */
  arrives: number
}

// A move an AI faction is weighing up. The engine enumerates what is legal and
// asks a scorer which of them is worth doing; 'end' is always among them, so a
// faction can decide that doing nothing beats every move available to it.
export interface AiMove {
  kind: 'reinforce' | 'attack' | 'fortify' | 'sail' | 'end'
  from?: Territory
  to?: Territory
}
// Injected rather than imported: the learned models live in src/ai, which reads
// the engine, and the engine must not read back or the modules form a cycle.
export type AiScorer = (game: Game, faction: Faction, move: AiMove) => number
// Picks from a set of candidates outright, rather than scoring them one by one.
// Set alongside the scorer when the models look more than one move ahead: the
// second ply needs to play a candidate on the board to see what it opens, which
// is a decision about the whole set rather than a score for one of them.
export type AiSelector = (game: Game, faction: Faction, moves: AiMove[]) => AiMove | null

export interface BattleRound {
  attackerDice: number[]
  defenderDice: number[]
  attackerLosses: number
  defenderLosses: number
}

export interface BattleResult {
  from: Territory
  to: Territory
  attacker: Faction
  defender: Faction
  rounds: BattleRound[]
  conquered: boolean
  attackerLosses: number
  defenderLosses: number
  troopsMoved: number
  eliminatedFaction: Faction | null
  // true when the battle can still continue (both sides have troops and the
  // attacker has more than one) — the human may press on or pull back
  pending: boolean
}

export const SAVE_VERSION = 1

export interface GameSnapshot {
  v: number
  round: number
  phase: Phase
  currentPlayerIndex: number
  reinforcementsLeft: number
  fortifiesUsed: number
  conqueredThisTurn: boolean
  // a homeland province has already drawn its garrison this turn
  liberatedThisTurn?: boolean
  tradeCount: number
  humanDefeated: boolean
  winner: string | null
  // event textKeys already announced. v1 saves stored round numbers instead —
  // see restore() for the migration.
  announcedEvents: (number | string)[]
  // event popups not yet dismissed, and the unanswered decision if any
  pendingCards?: string[]
  pendingDecision?: string | null
  // a won battle still waiting on how many advance into it
  pendingAdvance?: { from: string; to: string; min: number; max: number } | null
  // last round of the Tekalif-i Milliye window
  requisitionUntil?: number
  sevresRound?: number
  sakaryaRound?: number
  karsTreatySigned?: boolean
  pactHeldTurns?: number
  rejectedAt?: number
  landedOn?: string[]
  assemblyOpened?: boolean
  assemblyEverOpened?: boolean
  assemblySeatTurns?: number
  gateRetries?: Record<string, number>
  gateCheckedOn?: Record<string, number>
  britainStoodDown?: boolean
  greeceCollapsed?: boolean
  venizelosFell?: boolean
  fortifyBonus?: number
  convoys?: Convoy[]
  grantsTaken: string[]
  withdrawalsDone: string[]
  territories: Record<string, { faction: string; troops: number }>
  entrench?: Record<string, [number, number]>
  heldSince?: Record<string, number>
  raidedOn?: Record<string, number>
  factions: Record<string, { hand: Card[]; grudges: string[]; peaceBroken: boolean }>
  log: LogEntry[]
}

export interface LogEntry {
  round: number
  faction: string
  color: string
  text: string
  event?: boolean
}

// Misak-ı Millî: the territories Turkey must control to win the War of Independence.
export const NATIONAL_PACT = [
  'edirne',
  'istanbul',
  'izmit',
  'gelibolu',
  'canakkale',
  'sakarya',
  'balikesir',
  'usak',
  'eskisehir',
  'kutahya',
  'ankara',
  'konya',
  'sivas',
  'kastamonu',
  'samsun',
  'trabzon',
  'erzurum',
  'van',
  'elazig',
  'diyarbakir',
  'izmir',
  'aydin',
  'antalya',
  'isparta',
  'adana',
  'maras',
  'hatay',
  'kars',
  'igdir',
  'mosul'
]

// The provinces the Erzurum Congress spoke for — the Vilâyât-ı Şarkiye, i.e.
// the eastern half its delegates were actually sent by.
const EASTERN_PROVINCES = ['erzurum', 'van', 'elazig', 'diyarbakir', 'sivas', 'trabzon', 'kars', 'igdir']

// Where Çerkes Ethem's Kuvâ-yi Seyyare mutinied against the regular army, in
// western Anatolia around Kütahya and Eskişehir.
const WESTERN_PROVINCES = ['balikesir', 'usak', 'eskisehir', 'kutahya', 'sakarya', 'izmir', 'aydin']

// The eastern border the Treaty of Kars fixed. Once signed, the Caucasus front
// is shut and its garrisons are free to march west.
const KARS_TREATY_PROVINCES = ['kars', 'igdir', 'erzurum', 'van', 'trabzon']

const ALLIANCES: Record<string, Alliance> = {
  Turkey: 'turkey',
  Greece: 'entente',
  Britain: 'entente',
  France: 'entente',
  Italy: 'entente',
  Armenia: 'entente',
  Bulgaria: 'neutral', // defeated in WWI; no love lost with Greece, none with the Entente either
  // enters play in 1924 when the League settles the Mosul question; it has no
  // player and never takes a turn — it simply holds what it was awarded
  Iraq: 'neutral'
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
]
const MONTHS_TR = [
  'Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran',
  'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'
]

// round 1 = May 1919; each round advances MONTHS_PER_ROUND months, so the
// whole 1919-23 war fits in a playable number of turns. month is 0-based
// (May = 4). roundOf rounds UP so an event never fires before its date.
const MONTHS_PER_ROUND = 3
const roundOf = (month: number, year: number) =>
  Math.ceil(((year - 1919) * 12 + month - 4) / MONTHS_PER_ROUND) + 1

// A specific month rendered in the active language, for events that want to
// quote their real historical date rather than the round they landed on.
const formatMonth = (month: number, year: number, day?: number) =>
  `${day ? `${day} ` : ''}${(getLang() === 'tr' ? MONTHS_TR : MONTHS)[month]} ${year}`

// Rounds the rules key off. Named rather than indexed into HISTORICAL_EVENTS:
// several rules read these, and an array index silently points at the wrong
// event the moment the list is reordered.
const VENIZELOS_ROUND = roundOf(10, 1920) // Nov 1920
const ALEXANDROPOL_ROUND = roundOf(11, 1920) // Dec 1920
const ITALY_WITHDRAW_ROUND = roundOf(5, 1921) // Jun 1921
const ANKARA_AGREEMENT_ROUND = roundOf(9, 1921) // Oct 1921
const EXHAUSTION_ROUND = roundOf(7, 1922) // Aug 1922
const ISTANBUL_OCCUPIED_ROUND = roundOf(2, 1920) // 16 Mar 1920
// Britain keeps reasserting its hold on the City through 1920 and no further.
// Bounded by DATE rather than by attempts alone: `attempts` counts the rounds
// the gate was actually looked at, which in a game that skips rounds would let
// the card lie in wait for years and snatch the City back the moment Turkey
// first took it. The occupation is a period, not an ambush.
const ISTANBUL_ATTEMPTS = 3
const ISTANBUL_LAST_ROUND = ISTANBUL_OCCUPIED_ROUND + ISTANBUL_ATTEMPTS - 1 // through Nov 1920
const SAN_REMO_ROUND = roundOf(3, 1920) // 19–26 Apr 1920
const SEVRES_ROUND = roundOf(7, 1920) // 10 Aug 1920
const ETHEM_ROUND = roundOf(11, 1920) // Dec 1920
const INONU_ROUND = roundOf(3, 1921) // İkinci İnönü, Mar–Apr 1921
const GREEK_OFFENSIVE_ROUND = roundOf(6, 1921) // Kütahya–Eskişehir, Jul 1921
const SAKARYA_ROUND = roundOf(8, 1921) // 23 Aug – 13 Sep 1921
const KARS_ROUND = roundOf(9, 1921) // 13 Oct 1921
const MUDANYA_ROUND = roundOf(9, 1922) // 11 Oct 1922
const LLOYD_GEORGE_ROUND = roundOf(9, 1922) // 19 Oct 1922
const SULTANATE_ROUND = roundOf(10, 1922) // 1 Nov 1922
const GREEK_COLLAPSE_ROUND = roundOf(0, 1923) // the purge and the king's death
const MUBADELE_ROUND = roundOf(0, 1923) // 30 Jan 1923
const CALIPHATE_ROUND = roundOf(2, 1924) // 3 Mar 1924
const MOSUL_QUESTION_ROUND = roundOf(9, 1924) // Brussels line, Oct 1924
const SHEIKH_SAID_ROUND = roundOf(1, 1925) // 13 Feb 1925
// one government instead of two: the Assembly's writ runs everywhere
const SULTANATE_FORTIFY_BONUS = 1
// the Aegean provinces resettled by the population exchange
const MUBADELE_TURKISH = ['izmir', 'aydin', 'balikesir', 'canakkale']
const MUBADELE_GREEK = ['salonica', 'kozani', 'western-thrace']
// where Sheikh Said's rising broke out
const SHEIKH_SAID_PROVINCES = ['diyarbakir', 'elazig', 'erzurum', 'van']
// what the League awarded to the new Kingdom of Iraq
const IRAQ_AWARD = ['baghdad', 'mosul']
// Sèvres halves the levy while the shock lasts, then leaves a standing bonus
const SEVRES_SHOCK_ROUNDS = 2
// how long the Greek army is unable to attack after Sakarya
const SAKARYA_FREEZE_ROUNDS = 2
// Greece attacks with 2 dice instead of 3 once Sakarya breaks its offensive
const GREECE_BROKEN_DICE = 2
// İnönü: what the Greek army loses in front of Eskişehir when the line holds
const INONU_GREEK_LOSSES = 3
// men the 1921 summer offensive puts onto each Greek frontline province
const GREEK_OFFENSIVE_SURGE = 2
// Mudanya keys off the Straits and the Marmara approaches: hold all three and
// İstanbul is cut off by land and sea alike
const MUDANYA_GATE = ['izmit', 'gelibolu', 'canakkale']
const TBMM_ROUND = roundOf(3, 1920) // 23 April 1920
// how many turns a lost Ankara may postpone the Assembly before it is lost
const TBMM_ATTEMPTS = 3
const ERZURUM_CONGRESS_ROUND = roundOf(6, 1919) // 23 Jul – 7 Aug 1919
const SIVAS_CONGRESS_ROUND = roundOf(8, 1919) // 4 – 11 Sep 1919
// The Conference of Lausanne ran into 1923, but the war only truly closes when
// the last occupier leaves; the deadline sits in late 1925 so a long game still
// has room to resolve rather than being cut off mid-campaign.
const LAUSANNE_ROUND = roundOf(9, 1925) // Oct 1925 — the outer limit
// 24 July 1923: the conference sits. Before this the war is still being fought;
// after it, history stops being negotiable.
const CONFERENCE_ROUND = roundOf(6, 1923)
// The Pact must be HELD, not merely reached: three consecutive turns.
const PACT_HOLD_TURNS = 3
// Refusing terms brings the powers back. They come by sea, in force.
const LANDING_POWERS = ['Britain', 'France', 'Greece']
const LANDINGS_PER_TURN = 2
const LANDING_FIRST_WAVE = 30
const LANDING_WAVE = 10
// Where a fleet can put troops ashore. Samsun and Trabzon are absent for good:
// Russia is not an Ally, so the Black Sea is shut.
const LANDING_SITES = [
  'lesbos', 'rhodes', 'izmir', 'aydin', 'balikesir', 'canakkale', 'gelibolu',
  'edirne', 'antalya', 'adana', 'maras', 'hatay', 'aleppo'
]
// İstanbul opens only if the Allies hold both sides of the Dardanelles; İzmit
// only once İstanbul itself is out of Turkish hands.
const STRAITS = ['gelibolu', 'canakkale']
// How long a province stays a legitimate target after firing on you.
const RETALIATION_WINDOW = 3

// A congress only happens if the nationalists actually hold the city it was
// held in — an occupied Sivas has no Sivas Congress.
const heldByTurkey = (g: Game, slug: string) => g.bySlug[slug].faction.alliance === 'turkey'

// Where the Assembly can convene. Ankara was chosen for being central and far
// from the coast, but it was never sacred: with the Greeks on the Sakarya in
// 1921 the deputies debated moving east, and Sivas had already hosted the
// congress that made the movement national. Ankara first, Sivas as the retreat.
// Everything the Ankara government did as a government — the treaties it
// signed, the laws it passed, the regular army it fielded — presupposes that it
// exists. If the Assembly never convened, none of it happens.
// How much land each power began with, read straight off the setup data.
const STARTING_TERRITORIES: Record<string, number> = Object.fromEntries(
  factionData.factions.map(f => [f.name, f.territories.length])
)

// A power that has doubled the territory it started with is not exhausted, not
// suing for peace and not about to lose its government — it is winning. Its
// collapse waits, and is re-checked every turn: push it back below the line and
// history resumes, late.
const ascendant = (g: Game, name: string) => {
  const f = g.factions.find(x => x.name === name)
  return !!f && f.territories.length >= 2 * (STARTING_TERRITORIES[name] ?? Infinity)
}
const OCCUPIERS = ['Greece', 'Britain', 'France', 'Italy', 'Armenia']

// Still a belligerent — which is stricter than "not eliminated". A Greece that
// has collapsed, made peace or been driven out of Anatolia entirely is not an
// enemy you can fight a battle against, even though it still holds Selanik.
const stillFighting = (g: Game, name: string) => {
  const f = g.factions.find(x => x.name === name)
  if (!f || f.eliminated || g.isPassive(f)) return false
  return f.territories.some(t => NATIONAL_PACT.includes(t.slug))
}
const anyOccupierAscendant = (g: Game) => OCCUPIERS.some(n => ascendant(g, n))
// Is there still an occupier sitting on the homeland? The Great Offensive is
// the army that threw one out; with the Misak-ı Millî already clear there is
// nothing left to launch it at.
const occupierInHomeland = (g: Game) =>
  OCCUPIERS.some(name => {
    const f = g.factions.find(x => x.name === name)
    return !!f && !f.eliminated && f.territories.some(t => NATIONAL_PACT.includes(t.slug))
  })
// gates that wait indefinitely rather than being consumed on one failed look
const ALWAYS_RETRY = Number.POSITIVE_INFINITY
// a battle can slip a turn or two waiting for its precondition, but İnönü in
// 1924 is not İnönü — these give up rather than drift out of their era
const BATTLE_ATTEMPTS = 3

const assemblyConvened = (g: Game) => g.assemblyOpened

// The Assembly needs a seat. Ankara first; Sivas is the retreat, as it was the
// seat of the congress that made the movement national.
const ASSEMBLY_SEATS = ['ankara', 'sivas']
const holdsAnySeat = (g: Game) => ASSEMBLY_SEATS.some(slug => heldByTurkey(g, slug))
// Re-establishing a government that has been driven out is slower than opening
// one in a city you already hold: the first sitting is immediate, a second
// takes this many consecutive turns.
const ASSEMBLY_RECONVENE_TURNS = 3

const assemblySeat = (g: Game) => (heldByTurkey(g, 'ankara') ? 'ankara' : 'sivas')

// Historical turning points. `gate` suppresses the event entirely when its
// precondition fails; `effect` runs once when it fires; `card` raises it as a
// popup instead of a quiet log line; `choices` makes it a player decision.
export interface HistoricalEvent {
  round: number
  faction: string
  textKey: string
  gate?: (g: Game) => boolean
  // how many turns running a failing gate is re-checked before the event is
  // abandoned for good. Default 1: one look, then it never happened.
  attempts?: number
  effect?: (g: Game) => void
  card?: boolean
  choices?: { key: string; effect: (g: Game) => void }[]
  // fill-ins for the event's copy, resolved when it fires
  vars?: (g: Game) => Record<string, string | number>
}

export const HISTORICAL_EVENTS: HistoricalEvent[] = [
  {
    round: ERZURUM_CONGRESS_ROUND,
    faction: 'Turkey',
    textKey: 'event.erzurumCongress',
    card: true,
    // regional in scope: it spoke for the eastern provinces only
    gate: g => heldByTurkey(g, 'erzurum'),
    effect: g => g.congressPulse(EASTERN_PROVINCES)
  },
  {
    round: SIVAS_CONGRESS_ROUND,
    faction: 'Turkey',
    textKey: 'event.sivasCongress',
    card: true,
    // Sivas made the movement national — every province it holds answers
    gate: g => heldByTurkey(g, 'sivas'),
    effect: g => g.congressPulse(null)
  },
  {
    // 16 Mar 1920 — the Allies formally occupy the capital and dissolve the
    // Ottoman parliament, which is what made Ankara the real seat of power
    round: ISTANBUL_OCCUPIED_ROUND,
    faction: 'Britain',
    textKey: 'event.istanbulOccupied',
    card: true,
    // The occupation ran without a break from March 1920 to October 1923, so a
    // single quarter's window would make it a matter of when the player happened
    // to arrive. This covers the whole of 1920 — the year Ankara could not have
    // held the capital under any circumstances. After that the card retires and
    // the City becomes a real objective, which is also when the war turned.
    gate: g => g.round <= ISTANBUL_LAST_ROUND && heldByTurkey(g, 'istanbul'),
    attempts: ISTANBUL_ATTEMPTS,
    effect: g => g.occupyIstanbul()
  },
  {
    round: TBMM_ROUND, // 23 April 1920 — the Grand National Assembly opens
    faction: 'Turkey',
    textKey: 'event.tbmm',
    card: true,
    // the Assembly convened where the movement was strong; an occupied Ankara
    // postpones it rather than cancelling it, for up to three turns
    // Ankara for three turns; if it is still occupied the Assembly falls back
    // to Sivas for three more. Lose both and it never convenes at all.
    gate: g =>
      heldByTurkey(g, 'ankara') ||
      ((g.gateRetries['event.tbmm'] ?? 0) >= TBMM_ATTEMPTS && heldByTurkey(g, 'sivas')),
    attempts: ALWAYS_RETRY,
    vars: g => {
      const seat = assemblySeat(g)
      // roundOf rounds up so an event never fires early, which puts turn 5 in
      // May. On schedule the card should still say 23 April 1920, the real date;
      // only a delayed Assembly quotes the round it actually convened on.
      const onSchedule = g.round === TBMM_ROUND
      return {
        date: tDateLoc(onSchedule ? formatMonth(3, 1920, 23) : g.date),
        city: tCase(tTerritory(seat, g.bySlug[seat].name), 'loc')
      }
    },
    effect: g => {
      g.assemblyOpened = true
      g.assemblyEverOpened = true
    }
  },
  {
    round: SEVRES_ROUND, // 10 Aug 1920
    faction: '',
    textKey: 'event.sevres',
    card: true,
    vars: () => ({ n: SEVRES_SHOCK_ROUNDS }),
    effect: g => g.sevresShock()
  },
  {
    round: ETHEM_ROUND, // Dec 1920 – Jan 1921
    faction: 'Turkey',
    textKey: 'event.ethem',
    card: true,
    gate: g => assemblyConvened(g) && g.westernProvincesHeld().length > 0,
    effect: g => g.ethemRevolt()
  },
  {
    // İkinci İnönü, 31 Mar – 1 Apr 1921 — the stand that held the line
    round: INONU_ROUND,
    faction: 'Turkey',
    textKey: 'event.inonu',
    card: true,
    gate: g => assemblyConvened(g) && stillFighting(g, 'Greece') && heldByTurkey(g, 'eskisehir'),
    attempts: BATTLE_ATTEMPTS,
    effect: g => g.inonuStand()
  },
  {
    // The Greek summer offensive, July 1921: from the Milne line the army drove
    // east through Kütahya and Eskişehir toward the Sakarya, the deepest it ever
    // reached. Months AFTER Venizelos fell, under the royalist government — the
    // political defeat had not yet become a military one, and 1921 was the peak
    // of the Megali Idea on the ground, not its ebb.
    round: GREEK_OFFENSIVE_ROUND,
    faction: 'Greece',
    textKey: 'event.greekOffensive',
    // it has to still be a war Greece is fighting on Anatolian soil
    gate: g => stillFighting(g, 'Greece') && !g.greeceCollapsed,
    attempts: BATTLE_ATTEMPTS,
    card: true,
    effect: g => g.greekSummerOffensive()
  },
  {
    round: SAKARYA_ROUND, // 23 Aug – 13 Sep 1921
    faction: 'Turkey',
    textKey: 'event.sakarya',
    card: true,
    gate: g => assemblyConvened(g) && stillFighting(g, 'Greece') && heldByTurkey(g, 'ankara'),
    attempts: BATTLE_ATTEMPTS,
    vars: () => ({ n: SAKARYA_FREEZE_ROUNDS }),
    effect: g => g.sakaryaStand()
  },
  {
    round: KARS_ROUND, // 13 Oct 1921
    faction: 'Turkey',
    textKey: 'event.karsTreaty',
    card: true,
    gate: assemblyConvened,
    attempts: ALWAYS_RETRY,
    effect: g => g.signKarsTreaty()
  },
  {
    round: MUDANYA_ROUND, // 11 Oct 1922
    faction: 'Britain',
    textKey: 'event.mudanya',
    card: true,
    gate: g => assemblyConvened(g) && MUDANYA_GATE.every(slug => heldByTurkey(g, slug)) && !heldByTurkey(g, 'istanbul'),
    attempts: ALWAYS_RETRY,
    effect: g => g.mudanyaArmistice()
  },
  {
    // 19 Oct 1922 — Chanak brought the government down precisely because
    // Britain would not fight Turkey a second time
    round: LLOYD_GEORGE_ROUND,
    faction: 'Britain',
    textKey: 'event.lloydGeorge',
    card: true,
    gate: g => !ascendant(g, 'Britain'),
    attempts: ALWAYS_RETRY,
    effect: g => g.britainStandsDown()
  },
  {
    round: SULTANATE_ROUND, // 1 Nov 1922
    faction: 'Turkey',
    textKey: 'event.sultanate',
    card: true,
    gate: assemblyConvened,
    attempts: ALWAYS_RETRY,
    effect: g => g.abolishSultanate()
  },
  {
    round: GREEK_COLLAPSE_ROUND,
    faction: 'Greece',
    textKey: 'event.greekCollapse',
    card: true,
    gate: g => !ascendant(g, 'Greece'),
    attempts: ALWAYS_RETRY,
    effect: g => g.greekArmyCollapses()
  },
  {
    round: MUBADELE_ROUND, // 30 Jan 1923
    faction: '',
    textKey: 'event.mubadele',
    card: true,
    gate: assemblyConvened,
    attempts: ALWAYS_RETRY,
    effect: g => g.populationExchange()
  },
  {
    round: CALIPHATE_ROUND, // 3 Mar 1924
    faction: 'Turkey',
    textKey: 'event.caliphate',
    card: true,
    gate: assemblyConvened,
    attempts: ALWAYS_RETRY,
    effect: g => g.drawCard(g.humanPlayer.faction)
  },
  {
    round: MOSUL_QUESTION_ROUND, // Brussels line, Oct 1924
    faction: '',
    textKey: 'event.mosulQuestion',
    card: true,
    gate: g => IRAQ_AWARD.some(slug => g.bySlug[slug].faction.name === 'Britain'),
    effect: g => g.settleMosulQuestion()
  },
  {
    round: SHEIKH_SAID_ROUND, // 13 Feb 1925
    faction: 'Turkey',
    textKey: 'event.sheikhSaid',
    card: true,
    gate: g => g.easternProvincesHeld().length > 0,
    effect: g => g.sheikhSaidRevolt()
  },
  {
    round: VENIZELOS_ROUND,
    faction: 'Greece',
    textKey: 'event.venizelos',
    card: true,
    // He lost in Nov 1920 while Greece was winning battles — the platform against
    // him was eight years of mobilization, not the front. But a war that looks
    // WON is different: with Ankara taken the movement is decapitated, the boys
    // come home victorious, and the opposition has nothing to run on. Same if the
    // Assembly never convened at all.
    gate: g => !(g.bySlug['ankara'].faction.name === 'Greece' || !g.assemblyOpened),
    attempts: ALWAYS_RETRY,
    effect: g => {
      g.venizelosFell = true
    }
  },
  {
    round: ALEXANDROPOL_ROUND,
    faction: 'Armenia',
    textKey: 'event.alexandropol',
    card: true,
    gate: g => !ascendant(g, 'Armenia'),
    attempts: ALWAYS_RETRY
  },
  { round: ITALY_WITHDRAW_ROUND, faction: 'Italy', textKey: 'event.italyWithdraws', card: true },
  {
    round: ANKARA_AGREEMENT_ROUND,
    faction: 'France',
    textKey: 'event.ankaraAgreement',
    card: true,
    gate: assemblyConvened,
    attempts: ALWAYS_RETRY
  },
  {
    round: EXHAUSTION_ROUND,
    faction: '',
    textKey: 'event.exhaustion',
    card: true,
    // the occupation is only untenable while no occupier is winning
    gate: g => !anyOccupierAscendant(g),
    attempts: ALWAYS_RETRY
  },
  {
    round: roundOf(8, 1920), // Sep 1920 — first Soviet gold and arms
    faction: 'Turkey',
    textKey: 'event.sovietAid1',
    card: true
  },
  {
    round: roundOf(2, 1921), // 16 March 1921 — Treaty of Moscow, the bulk arrives
    faction: 'Turkey',
    textKey: 'event.sovietAid2',
    card: true
  },
  {
    // 7-8 Aug 1921 — the National Tax Orders. The one event that asks the
    // player a question instead of handing them a modifier.
    round: roundOf(7, 1921),
    faction: 'Turkey',
    textKey: 'event.tekalif',
    card: true,
    gate: g => assemblyConvened(g) && heldByTurkey(g, 'ankara'),
    attempts: ALWAYS_RETRY,
    vars: () => ({ n: REQUISITION_ROUNDS, cost: REQUISITION_LEVY_PENALTY }),
    choices: [
      { key: 'requisition', effect: g => g.requisition() },
      { key: 'decline', effect: () => {} }
    ]
  },
  {
    round: roundOf(7, 1922), // 26 August 1922 — the Great Offensive
    faction: 'Turkey',
    textKey: 'event.greatOffensive',
    card: true,
    // The offensive that broke the Greek army in Anatolia. It needs a
    // government to order it, and it needs somebody to be thrown out: with the
    // homeland already clear there is no offensive to launch.
    //
    // Deliberately "any occupier" rather than "Greece". Büyük Taarruz is not
    // only an event, it is the army — full mobilization, three attack dice, a
    // homeland that defends with three. Keyed to Greece alone, a player who
    // cleared the Aegean early would be denied the army they still need for
    // İstanbul, and beating Greece would be punished. It waits, so an occupier
    // who comes back later — a power landing after Lausanne is refused — brings
    // the mobilization with them.
    gate: g => assemblyConvened(g) && occupierInHomeland(g),
    attempts: ALWAYS_RETRY
  },
  {
    // 24 July 1923 — terms are offered. You may refuse only while somebody is
    // still able to make you regret it.
    round: CONFERENCE_ROUND,
    faction: '',
    textKey: 'event.conference',
    card: true,
    gate: g => g.conferenceOpen,
    attempts: ALWAYS_RETRY,
    vars: g => ({ held: g.pactProgress, total: NATIONAL_PACT.length }),
    choices: [
      { key: 'accept', effect: g => g.settleAtLausanne() },
      { key: 'reject', effect: g => g.refuseTerms() }
    ]
  },
  {
    round: LAUSANNE_ROUND,
    faction: '',
    textKey: 'event.lausanne',
    card: true,
    effect: g => g.settleAtLausanne()
  }
]
// The guerrilla dice cap models the irregular Kuvâ-yi Milliye phase: invaders
// Invaders pushing into the homeland fight harassed supply lines and roll at
// most 2 attack dice, right up until Büyük Taarruz (Aug 1922) decides the war
// in the open field. Turkey is likewise limited to 2 while the resistance is
// irregular, and only the Great Offensive puts a regular army in the field
// that attacks with a full 3.
const LIMITED_ATTACK_DICE = 2
// The round from which Turkish defenders in the homeland roll 3 dice instead
// of the usual 2. This lands with the Great Offensive, not the Assembly: the
// extra defensive die and Turkey's third attack die arrive together, so the
// whole 1919-21 stretch stays a 2v2 holding war.
const TBMM_DEFENDER_DICE = 3
// Soviet aid in two stages: the September 1920 gold and first arms lift the
// standing mobilization bonus, and the Treaty of Moscow (16 Mar 1921) lands a
// one-off shipment of rifles, machine guns and artillery.
const SOVIET_AID_1_ROUND = roundOf(8, 1920) // September 1920
const SOVIET_AID_2_ROUND = roundOf(2, 1921) // March 1921
const SOVIET_AID_2_TROOPS = 5
// Büyük Taarruz: the army massed for the Great Offensive of 26 August 1922
const GREAT_OFFENSIVE_ROUND = roundOf(7, 1922) // August 1922
// Historical withdrawals: Italy evacuated the southwest (Antalya) through
// 1921 without a fight, and the Ankara Agreement handed France's Cilician
// occupation back to Ankara — France kept Syria, so Aleppo stays French. The
// ceded provinces pass to Turkey with a single token garrison each: the land
// changes hands, but no army comes with it.
const WITHDRAWALS: { faction: string; round: number; keep: string[]; textKey: string }[] = [
  { faction: 'Italy', round: roundOf(5, 1921), keep: [], textKey: 'log.italyConcedes' },
  { faction: 'France', round: roundOf(9, 1921), keep: ['aleppo'], textKey: 'log.franceConcedes' }
]

// Occupation entrenchment: a Misak-ı Millî province held by an occupier and
// left uncontested digs in — every ENTRENCH_EVERY quiet rounds it draws one
// free garrison troop, up to ENTRENCH_MAX in its lifetime. Any attack on it
// resets the clock, so passivity costs the player exactly where it matters.
// It stops once the occupation collapses politically (Aug 1922).
const ENTRENCH_EVERY = 2
const ENTRENCH_MAX = 6

// The mirror image for Turkey: a province the occupiers leave alone raises and
// drills its own militia. Same cap, but a slower clock than the occupiers' —
// arming and training irregulars takes longer than garrisoning a town.
const TR_ENTRENCH_EVERY = 4
const TR_ENTRENCH_MAX = 4

// How many rounds the Tekâlif-i Milliye window stays open. Four rounds from
// Aug 1921 runs out exactly as the Great Offensive lifts the caps anyway, so
// it is a real deadline rather than an early start on the endgame.
const REQUISITION_ROUNDS = 3
// What the requisition costs while it lasts: the countryside is stripped, so
// fewer men come forward and no province raises militia. Burst offensive power
// now, paid for with sustained growth.
const REQUISITION_LEVY_PENALTY = 3
// how many exchanges of each homeland battle the requisition presses at full
// strength before the assault spends itself
const REQUISITION_EXCHANGES = 2

// Neuilly left Bulgaria a volunteer army of twenty thousand men. It is the one
// occupier whose ceiling is written into a treaty rather than into its politics.
const BULGARIAN_ARMY_CAP = 2

// Sea lanes: a pair of ports a fleet can run between, and the point in open
// water where a convoy making the crossing is drawn. Provinces that face each
// other across a strait — Lesbos and İzmir, Rhodes and Antalya — already touch
// on the map and need no lane. A lane is for a crossing the map has no border
// for.
//
// The Aegean was never a wall. The Greek army in Anatolia was landed out of
// Salonica, supplied from it for three years and finally taken off through it,
// and moving a division that way took weeks — long enough that a general who
// committed troops to one theatre had given them up in the other for the better
// part of a season. A game in which that sea cannot be crossed at all forces
// Athens to choose Macedonia or Smyrna once, in 1919, and live with it.
export const SEA_LANES: { ports: [string, string]; at: [number, number] }[] = [
  { ports: ['salonica', 'izmir'], at: [285, 330] }
]

// Who had a fleet to do it with. The Greek navy held the Aegean from the first
// day of the war to the last, and the Royal Navy went where it pleased. The
// nationalists had nothing: every man and every rifle they moved went overland,
// and the one consignment that came by sea — the Soviet shipments into İnebolu
// — arrived on somebody else's hulls.
const NAVIES = new Set(['Greece', 'Britain', 'Italy', 'France'])

// Loaded this round, at sea through the next, ashore on the one after.
const CROSSING_ROUNDS = 2

// What one crossing can carry. Tonnage was finite: the Anatolian army was
// supplied by sea for three years but a division took weeks to move, and no
// amount of will put a whole garrison on the water at once. Without a ceiling
// the lane is a teleporter — half of Salonica arrives in Smyrna in one order —
// and stripping one theatre to feed the other costs nothing.
const CROSSING_CAPACITY = 6

// Ankara is the seat of the national movement: while Turkey holds it,
// volunteers arrive there every round. An occupied Ankara raises nobody.
const ANKARA_LEVY = 1
// Salonica levies for Greece the way Ankara does for Turkey, while Venizelos
// is still in power — see salonicaLevy.
const SALONICA_LEVY = 1

// Liberating a Misak-ı Millî province during the resistance rallies local
// Kuvâ-yi Milliye to it: Turkey taking a homeland province before the Great
// Offensive plants extra troops there. Rewards active reconquest without
// touching the turtle (which conquers nothing early).
const LIBERATION_TROOPS = 1

// Once the regular army is in the field the militia distinction stops mattering:
// every liberated homeland province is garrisoned the same, whether it fell
// last turn or years ago — but only the FIRST province freed each turn draws
// one, so a single turn's offensive cannot fund itself province by province.
const POST_OFFENSIVE_LIBERATION = 1

// The Great Offensive grants no troops: what it brings is capability — the
// dice caps lift — and a handful of units on top of that was too small to
// measure anyway.
const ONE_OFF_GRANTS = [{ key: 'sovietAid2', round: SOVIET_AID_2_ROUND, troops: SOVIET_AID_2_TROOPS }]

// Escalating Risk-style card trade bonuses.
const TRADE_BONUSES = [4, 6, 8, 10, 12, 15]
export const tradeBonusAt = (n: number) =>
  n < TRADE_BONUSES.length ? TRADE_BONUSES[n] : TRADE_BONUSES[TRADE_BONUSES.length - 1] + 5 * (n - TRADE_BONUSES.length + 1)

const CARD_TYPES: Card[] = ['infantry', 'cavalry', 'cannon']

// How willing each AI is to actually fight: attacks per turn, and the troop
// advantage it demands first. The post-WWI Entente was exhausted — Greece
// carried the campaign while the others mostly garrisoned what they held.
const AGGRESSION: Record<string, { maxAttacks: number; minEdge: number }> = {
  Greece: { maxAttacks: 6, minEdge: 3 },
  Armenia: { maxAttacks: 6, minEdge: 2 },
  France: { maxAttacks: 4, minEdge: 3 },
  Bulgaria: { maxAttacks: 4, minEdge: 3 },
  Britain: { maxAttacks: 2, minEdge: 5 },
  Italy: { maxAttacks: 1, minEdge: 6 },
  Turkey: { maxAttacks: 8, minEdge: 2 }
}

// Being attacked overrides a faction's natural reluctance. Britain and Italy
// garrison rather than campaign (minEdge 5-6), which meant a player could chip
// away at them for free — so against a faction it holds a grudge against, any
// AI presses with a much smaller edge and gets extra attacks to do it with.
const RETALIATION = { maxAttacks: 4, minEdge: 2 }

// How strongly the AI prefers Ankara and Sivas over an equally soft province.
// Applied to target choice only — it does not lower the edge the AI demands.
const SEAT_PRIORITY = 8
// How many reinforcements a model-driven faction places before scoring the
// board again. One at a time is the same question asked a dozen times.
const REINFORCE_BATCH = 3
// How many attacks a model-driven faction may make in a turn. Generous on
// purpose: the brake is the model choosing to stop, not a number typed here.
const MODEL_ATTACK_BUDGET = 10

// Exact expected losses for ONE exchange at each dice pairing, enumerated over
// every outcome. Our TBMM rule gives defenders 3 dice, which standard Risk
// tables don't cover, so this is computed rather than hard-coded.
const EXCHANGE_ODDS: Record<string, { attacker: number; defender: number }> = (() => {
  const table: Record<string, { attacker: number; defender: number }> = {}
  const rolls = (n: number): number[][] =>
    n === 0 ? [[]] : rolls(n - 1).flatMap(rest => [1, 2, 3, 4, 5, 6].map(v => [v, ...rest]))
  for (let a = 1; a <= 3; a++)
    for (let d = 1; d <= 3; d++) {
      let aLoss = 0
      let dLoss = 0
      let n = 0
      for (const av of rolls(a))
        for (const dv of rolls(d)) {
          const A = [...av].sort((x, y) => y - x)
          const D = [...dv].sort((x, y) => y - x)
          for (let i = 0; i < Math.min(a, d); i++) {
            if (A[i] > D[i]) dLoss++
            else aLoss++
          }
          n++
        }
      table[`${a}v${d}`] = { attacker: aLoss / n, defender: dLoss / n }
    }
  return table
})()

const rollDice = (count: number) =>
  Array.from({ length: count }, () => Math.floor(Math.random() * 6) + 1).sort((a, b) => b - a)

export default class Game {
  factions: Faction[]
  players: Player[]
  territories: Territory[]
  bySlug: Record<string, Territory>
  currentPlayerIndex: number
  round: number
  phase: Phase
  reinforcementsLeft: number
  fortifiesUsed: number
  conqueredThisTurn: boolean
  // a homeland province has already drawn its garrison this turn (post-offensive)
  liberatedThisTurn = false
  tradeCount: number
  log: LogEntry[]
  winner: Faction | null
  humanDefeated: boolean
  // last round of the Tekâlif-i Milliye window (0 = never proclaimed)
  requisitionUntil = 0
  // the round Sèvres landed (0 = not yet): halves the Turkish levy for
  // SEVRES_SHOCK_ROUNDS, then leaves a standing +1
  sevresRound = 0
  // the round Sakarya was won (0 = never): freezes Greece briefly and breaks
  // its offensive dice permanently
  sakaryaRound = 0
  // the Grand National Assembly is SITTING. Not a latch: lose every seat and it
  // is suspended, taking the levy divisor, the exhaustion multiplier and every
  // Assembly-gated event with it until it can reconvene.
  assemblyOpened = false
  // it has convened at least once — the card only ever fires the first time
  assemblyEverOpened = false
  // consecutive turns holding a seat while suspended
  assemblySeatTurns = 0
  // per-event count of failed gate checks, for events that wait
  gateRetries: Record<string, number> = {}
  // the round each of those was last counted on, so a retry costs one round
  // rather than one per player seat
  gateCheckedOn: Record<string, number> = {}
  // consecutive turns holding the whole National Pact
  pactHeldTurns = 0
  // the round terms were refused (0 = never). Landings begin the round after.
  rejectedAt = 0
  // provinces the Allies have put troops ashore on — legitimate targets after
  landedOn: string[] = []
  // Kars shut the Caucasus front for good
  karsTreatySigned = false
  // Lloyd George's fall: Britain garrisons but will not start a war
  britainStoodDown = false
  // the Greek army is finished as a fighting force
  greeceCollapsed = false
  // the November 1920 election: the royalists take the war over
  venizelosFell = false
  // extra fortify moves Turkey has earned (the Sultanate's abolition)
  fortifyBonus = 0
  // troops in the middle of a sea crossing, in neither theatre until they land
  convoys: Convoy[] = []
  // the round the war ended on. Stored as a NUMBER, not a formatted date: the
  // ending copy is re-rendered on a language switch, and a baked "Şubat 1922"
  // would survive into the English text.
  endedRound = 0
  grantsTaken: Set<string>
  withdrawalsDone: Set<string>
  // the battle currently being resolved round-by-round, or null
  private activeBattle: {
    from: Territory
    to: Territory
    attackerLosses: number
    defenderLosses: number
    // how many exchanges of this battle have already spent the Tekâlif die
    equippedUsed?: number
  } | null
  private announcedEvents: Set<string>
  // event textKeys waiting to be shown as popup cards, oldest first
  pendingCards: string[] = []
  // a decision card the player must answer before play continues
  pendingDecision: HistoricalEvent | null = null
  // a won battle waiting for the player to say how many advance into it
  pendingAdvance: { from: string; to: string; min: number; max: number } | null = null

  constructor() {
    this.factions = factionData.factions.map(f => new Faction(f.name, f.color, ALLIANCES[f.name] ?? 'neutral'))
    const nameBySlug: Record<string, string> = {}
    territoriesData.territories.forEach(t => {
      nameBySlug[t.slug] = t.name
    })

    this.bySlug = {}
    factionData.factions.forEach((f, i) => {
      f.territories.forEach(({ slug, troops }) => {
        const territory = new Territory(slug, nameBySlug[slug] ?? slug, this.factions[i])
        territory.troops = troops
        this.factions[i].territories.push(territory)
        this.bySlug[slug] = territory
      })
    })
    this.territories = Object.values(this.bySlug)

    territoriesData.territories.forEach(t => {
      const territory = this.bySlug[t.slug]
      t.adjacentTerritories.forEach(slug => {
        const adjacent = this.bySlug[slug]
        if (adjacent && !territory.adjacent.includes(adjacent)) territory.adjacent.push(adjacent)
      })
    })

    this.players = playerData.players.map(p => {
      const faction = this.factions.find(f => f.name === p.faction) as Faction
      return new Player(p.name, faction, p.type === 'Human')
    })

    this.currentPlayerIndex = 0
    this.round = 1
    this.phase = 'reinforce'
    this.reinforcementsLeft = 0
    this.fortifiesUsed = 0
    this.conqueredThisTurn = false
    this.liberatedThisTurn = false
    this.tradeCount = 0
    this.log = []
    this.winner = null
    this.humanDefeated = false
    this.grantsTaken = new Set()
    this.withdrawalsDone = new Set()
    this.activeBattle = null
    this.announcedEvents = new Set()
    this.startTurn()
    this.record(null, t('log.gameStart'))
  }

  get currentPlayer() {
    return this.players[this.currentPlayerIndex]
  }

  get humanPlayer() {
    return this.players.find(p => p.isHuman) as Player
  }

  // Rounds start at May 1919 (the landing at Samsun) and step by
  // MONTHS_PER_ROUND.
  dateAt(round: number) {
    const monthIndex = 4 + (round - 1) * MONTHS_PER_ROUND
    const months = getLang() === 'tr' ? MONTHS_TR : MONTHS
    return `${months[monthIndex % 12]} ${1919 + Math.floor(monthIndex / 12)}`
  }

  get date() {
    return this.dateAt(this.round)
  }

  get pactProgress() {
    const turkey = this.humanPlayer.faction
    return NATIONAL_PACT.filter(slug => this.bySlug[slug].faction === turkey).length
  }

  // Won the war and then some: not a single province anywhere on the map is
  // still in foreign hands, well past what Misak-ı Millî ever claimed.
  get totalConquest() {
    const turkey = this.humanPlayer.faction
    return this.territories.every(t => t.faction === turkey)
  }

  get fortifyLimit() {
    // Fighting on home soil: Turkish forces redeploy on interior lines, and
    // one government instead of two adds another move (Sultanate abolished).
    return this.currentPlayer.faction.name === 'Turkey' ? 2 + this.fortifyBonus : 1
  }

  record(faction: Faction | null, text: string, event = false) {
    this.log.push({ round: this.round, faction: faction?.name ?? '', color: faction?.name ?? '', text, event })
    if (this.log.length > 200) this.log.splice(0, this.log.length - 200)
  }

  /** Men this faction has aboard ship — its army, but nowhere on the map. */
  troopsAtSea(faction: Faction) {
    let n = 0
    for (const convoy of this.convoys) if (convoy.faction === faction.name) n += convoy.troops
    return n
  }

  // ---- faction traits ----

  reinforcementsFor(faction: Faction) {
    // From August 1922 the war is politically lost abroad — nobody reinforces
    // the OCCUPATION. This is deliberately regional, as the event says: what
    // dries up is the levy drawn from occupied Misak-ı Millî provinces, not a
    // power's ability to raise men on its own soil. A faction whose peace was
    // broken mobilizes regardless.
    const exhausted =
      faction.alliance !== 'turkey' && this.round >= EXHAUSTION_ROUND && !faction.peaceBroken
    // occupying powers raise troops from the land they hold at a flat rate;
    // Turkey's own rate improves as the movement builds institutions (below)
    let amount = Math.max(2, Math.floor(faction.territories.length / 3))
    switch (faction.name) {
      case 'Turkey': {
        // The nation's capacity to put men in the field grows in three stages:
        // scattered irregulars in 1919, the Assembly's regular army from April
        // 1920, and full national mobilization at the Great Offensive.
        const divisor =
          this.round >= GREAT_OFFENSIVE_ROUND ? 1.25 : this.assemblyOpened ? 1.5 : 2
        amount = Math.max(2, Math.floor(faction.territories.length / divisor))
        // Kuvâ-yi Milliye, better armed once Soviet rifles land
        amount += this.round >= SOVIET_AID_1_ROUND ? 3 : 2
        // Sèvres: the dictated peace guts recruitment while the shock lasts,
        // then leaves the movement permanently better subscribed
        if (this.sevresRound) {
          amount =
            this.round < this.sevresRound + SEVRES_SHOCK_ROUNDS ? Math.max(2, Math.floor(amount / 2)) : amount + 1
        }
        // Exhaustion: a demobilizing army wastes much of every levy in 1919,
        // far less once the Assembly organizes conscription, and nothing by
        // the time the whole nation is mobilized for the Great Offensive.
        const exhaustion =
          this.round >= GREAT_OFFENSIVE_ROUND ? 1 : this.assemblyOpened ? 0.9 : 0.75
        amount = Math.max(2, Math.floor(amount * exhaustion))
        // the requisition is eating the same countryside the levy recruits
        // from. Applied last so the cost is exactly what the card promises,
        // rather than being scaled down by the exhaustion multiplier.
        if (this.requisitionActive) amount = Math.max(2, amount - REQUISITION_LEVY_PENALTY)
        break
      }
      case 'Britain':
        // Post-war demobilization: London will not raise fresh divisions for Anatolia.
        amount = Math.max(2, amount - 2)
        break
      case 'Bulgaria':
        // Neuilly left Bulgaria a volunteer army of twenty thousand men, no
        // conscription and no air force. However far it marches, it cannot put
        // a real army in the field again.
        amount = Math.min(amount, BULGARIAN_ARMY_CAP)
        break
      case 'Greece': {
        // Greece raises men at home whatever happens in Anatolia. Only the levy
        // drawn from the occupied Misak-ı Millî provinces dries up: Venizelos'
        // defeat costs Allied backing for the campaign, and the army's collapse
        // ends it altogether. Salonica and Thrace go on recruiting either way.
        //
        // One levy off the whole force — the base rate above already is that.
        // The old split flooring each bucket on its own cost Greece an army and
        // dropped it BELOW the flat rate every other power gets: five home and
        // two occupied provinces floored apart raise one, where seven together
        // raise two. That missing army was most of why Greece could not survive
        // a two-front war, so the whole board turned on a rounding artefact.
        const occupied = faction.territories.filter(x => NATIONAL_PACT.includes(x.slug)).length
        const home = faction.territories.length - occupied
        // Collapse leaves only the home recruiting depots. And the occupation
        // levy declines — but at SAKARYA, not at Venizelos' fall. His defeat was
        // political: it stopped the Salonica levy (the base he governed from) and
        // cost the Allied diplomatic backing, but the royalist army kept
        // ADVANCING through 1921 to the Sakarya. Docking the field levy the
        // moment he left was the game treating a political defeat as a military
        // one, and it ground Greece down through the very months it was
        // historically at its strongest. The army thins only once its advance is
        // halted; the terminal collapse still comes with exhaustion above.
        if (this.greeceCollapsed) amount = Math.max(1, Math.floor(home / 3))
        else if (this.round >= SAKARYA_ROUND) amount = Math.max(1, amount - 1)
        break
      }
      case 'Armenia':
        if (this.round >= ALEXANDROPOL_ROUND && !faction.peaceBroken) amount = 0
        break
      case 'Italy':
        if (this.round >= ITALY_WITHDRAW_ROUND && !faction.peaceBroken) amount = 0
        break
      case 'France':
        if (this.round >= ANKARA_AGREEMENT_ROUND && !faction.peaceBroken) amount = Math.floor(amount / 2)
        break
    }
    // the exhaustion caps the levy at what a power can still raise off its own
    // territory — provinces it merely occupies stop contributing entirely
    if (exhausted) {
      const home = faction.territories.filter(x => !NATIONAL_PACT.includes(x.slug)).length
      amount = Math.min(amount, Math.floor(home / 3))
    }
    return amount
  }

  // Note: the Aug 1922 exhaustion does NOT make the occupiers passive. It dries
  // up their reinforcements and ends their entrenchment; they still fight with
  // what they have on the ground.
  isPassive(faction: Faction) {
    if (faction.peaceBroken) return false
    if (faction.name === 'Britain' && this.britainStoodDown) return true
    if (faction.name === 'Greece' && this.greeceCollapsed) return true
    if (faction.name === 'Italy') return this.round >= ITALY_WITHDRAW_ROUND
    if (faction.name === 'France') return this.round >= ANKARA_AGREEMENT_ROUND
    return false
  }

  // Has this faction settled out of the war (treaty event or exhaustion)?
  // Such a faction sits quietly — until someone attacks it and voids the peace.
  atPeace(faction: Faction) {
    if (faction.peaceBroken) return false
    if (faction.name === 'Britain' && this.britainStoodDown) return true
    if (faction.name === 'Greece' && this.greeceCollapsed) return true
    if (faction.name === 'Armenia') return this.round >= ALEXANDROPOL_ROUND
    if (faction.name === 'Italy') return this.round >= ITALY_WITHDRAW_ROUND
    if (faction.name === 'France') return this.round >= ANKARA_AGREEMENT_ROUND
    return false
  }

  // Terms are on the table when the conference has convened, the war aim is not
  // yet met, and at least one power is still standing to punish a refusal.
  get conferenceOpen() {
    if (this.phase === 'gameover' || this.rejectedAt) return false
    if (this.round < CONFERENCE_ROUND) return false
    if (this.pactProgress === NATIONAL_PACT.length) return false
    return this.landersAlive
  }

  get landersAlive() {
    return LANDING_POWERS.some(name => {
      const f = this.factions.find(x => x.name === name)
      return !!f && !f.eliminated
    })
  }

  // The National Pact is the war aim, and Ankara renounced everything beyond it.
  // Attacks outside it are barred until the aim is met — with two exceptions,
  // both earned by enemy action.
  mayAttackOutsidePact(to: Territory) {
    if (NATIONAL_PACT.includes(to.slug)) return true
    if (this.pactProgress === NATIONAL_PACT.length) return true
    if (this.landedOn.includes(to.slug)) return true
    return to.raidedOn > 0 && this.round - to.raidedOn <= RETALIATION_WINDOW
  }

  // Is this particular province off-limits to this attacker? The Treaty of
  // Kars fixed the eastern border: Armenia cannot cross it again.
  frontClosed(attacker: Faction, to: Territory) {
    if (attacker.alliance === 'turkey' && !this.mayAttackOutsidePact(to)) return true
    // Western Thrace was not Greek when the war opened. An Allied administration
    // under General Charpy held it from October 1919 and San Remo handed it to
    // Athens only in the spring of 1920. Whatever Sofia wanted, it was not going
    // to march on a province the Entente was garrisoning — and it did not.
    if (attacker.name === 'Bulgaria' && to.faction.name === 'Greece' && this.round < SAN_REMO_ROUND) return true
    return (
      this.karsTreatySigned &&
      attacker.name === 'Armenia' &&
      to.faction.alliance === 'turkey' &&
      KARS_TREATY_PROVINCES.includes(to.slug)
    )
  }

  // Beaten at Sakarya, the Greek army cannot mount an attack for a while.
  frozen(faction: Faction) {
    return (
      faction.name === 'Greece' && this.sakaryaRound > 0 && this.round < this.sakaryaRound + SAKARYA_FREEZE_ROUNDS
    )
  }

  // May this faction open hostilities against that faction?
  mayAttack(attacker: Faction, defender: Faction) {
    // Iraq is a bystander state, not a belligerent: nobody fights it, and the
    // provinces the League awarded it are settled for good
    if (defender.name === 'Iraq' || attacker.name === 'Iraq') return false
    if (attacker.grudges.has(defender.name)) return true
    if (attacker.alliance === 'turkey') return true
    if (attacker.alliance === 'entente') return defender.alliance === 'turkey'
    // Bulgaria: old scores to settle with Greece over Macedonia and Thrace
    if (attacker.name === 'Bulgaria') return defender.name === 'Greece'
    return false
  }

  traitSummary(faction: Faction): string {
    return t(`trait.${faction.name}`)
  }

  // ---- cards ----

  drawCard(faction: Faction) {
    faction.hand.push(CARD_TYPES[Math.floor(Math.random() * CARD_TYPES.length)])
  }

  // Returns the indexes of a tradable set (3 alike or one of each), preferring the cheapest cards.
  findTradeSet(hand: Card[]): number[] | null {
    for (const type of CARD_TYPES) {
      const idx = hand.map((c, i) => (c === type ? i : -1)).filter(i => i >= 0)
      if (idx.length >= 3) return idx.slice(0, 3)
    }
    const one: number[] = []
    for (const type of CARD_TYPES) {
      const i = hand.findIndex((c, j) => c === type && !one.includes(j))
      if (i === -1) return null
      one.push(i)
    }
    return one
  }

  get pendingTradeBonus() {
    return tradeBonusAt(this.tradeCount)
  }

  tradeCards(faction: Faction): number {
    const set = this.findTradeSet(faction.hand)
    if (!set) return 0
    const bonus = tradeBonusAt(this.tradeCount)
    this.tradeCount++
    faction.hand = faction.hand.filter((_, i) => !set.includes(i))
    if (faction === this.currentPlayer.faction && this.phase === 'reinforce') this.reinforcementsLeft += bonus
    this.record(faction, t('log.tradeCards', { faction: tFaction(faction.name), bonus }))
    return bonus
  }

  // ---- turn flow ----

  startTurn() {
    this.landConvoys()
    // the round upkeep that precedes this can end the war (the Pact held for
    // three turns, the conference settling, the outer limit) — starting the
    // next seat's turn would quietly put the game back on its feet
    if (this.phase === 'gameover') return
    this.phase = 'reinforce'
    this.fortifiesUsed = 0
    this.conqueredThisTurn = false
    this.liberatedThisTurn = false
    this.reinforcementsLeft = this.reinforcementsFor(this.currentPlayer.faction)
    // one-off Turkish windfalls, each granted on the first Turkish turn at or
    // after its round: the Treaty of Moscow shipment and the Great Offensive
    if (this.currentPlayer.faction.name === 'Turkey') {
      for (const grant of ONE_OFF_GRANTS) {
        if (this.round >= grant.round && !this.grantsTaken.has(grant.key)) {
          this.grantsTaken.add(grant.key)
          this.reinforcementsLeft += grant.troops
        }
      }
    }

    // Events first: a power that cedes its last province in the same breath
    // would otherwise be eliminated before its own withdrawal is announced, and
    // the card would be suppressed as news from a dead faction.
    this.fireEvents()

    this.applyWithdrawals()

    // hands of 5+ must trade (classic Risk rule) — applied automatically
    const faction = this.currentPlayer.faction
    while (faction.hand.length >= 5 && this.findTradeSet(faction.hand)) this.tradeCards(faction)
  }

  placeReinforcement(slug: string, count = 1) {
    if (this.phase !== 'reinforce') return
    const territory = this.bySlug[slug]
    if (territory.faction !== this.currentPlayer.faction) return
    const placed = Math.min(count, this.reinforcementsLeft)
    territory.troops += placed
    this.reinforcementsLeft -= placed
    if (this.reinforcementsLeft === 0) this.phase = 'attack'
  }

  autoPlaceReinforcements() {
    if (this.phase !== 'reinforce') return
    const faction = this.currentPlayer.faction
    if (this.reinforcementsLeft === 0) {
      this.phase = 'attack'
      return
    }
    while (this.reinforcementsLeft > 0) {
      const border = faction.territories
        .filter(t => t.adjacent.some(a => a.faction !== faction))
        .sort((a, b) => this.threatOf(b) - this.threatOf(a))[0]
      this.placeReinforcement((border ?? faction.territories[0]).slug, 1)
    }
  }

  threatOf(territory: Territory) {
    // Only borders where war is actually possible count — allies don't threaten each other.
    const enemies = territory.adjacent.filter(
      a =>
        a.faction !== territory.faction &&
        (this.mayAttack(a.faction, territory.faction) || this.mayAttack(territory.faction, a.faction))
    )
    if (enemies.length === 0) return -Infinity
    return enemies.reduce((sum, e) => sum + e.troops, 0) - territory.troops
  }

  // The real dice caps for a given attack, in one place so combat, the AI and
  // any analysis all agree. Returns the MAXIMUM dice each side may roll.
  diceCapsFor(from: Territory, to: Territory): { attacker: number; defender: number } {
    const attacker = from.faction
    const defender = to.faction
    const beforeGreatOffensive = this.round < GREAT_OFFENSIVE_ROUND
    const intoHomeland =
      defender.alliance === 'turkey' && attacker.alliance !== 'turkey' && NATIONAL_PACT.includes(to.slug)
    // Tekâlif-i Milliye: for its window the requisitioned army fights at full
    // strength, but only to retake the homeland — the orders equipped it to
    // win Sakarya, not to campaign abroad
    // ...and only for the opening exchanges of any one battle: the requisition
    // bought a first-rate assault, not an inexhaustible one. Press on past them
    // and the fight reverts to the ordinary cap.
    const sameBattle = this.activeBattle?.from === from && this.activeBattle?.to === to
    const spent = sameBattle ? (this.activeBattle?.equippedUsed ?? 0) : 0
    const equipped = this.requisitionActive && NATIONAL_PACT.includes(to.slug) && spent < REQUISITION_EXCHANGES
    const turkishOffensiveLimited = attacker.alliance === 'turkey' && beforeGreatOffensive && !equipped
    // Sakarya broke the Greek offensive for the rest of the war — but that was
    // the drive INTO Anatolia, toward Ankara. It says nothing about Greece
    // fighting Bulgaria for Macedonia, which is a different front entirely, so
    // the broken dice apply only to attacks into the Misak-ı Millî.
    const greekOffensiveBroken =
      attacker.name === 'Greece' && this.sakaryaRound > 0 && NATIONAL_PACT.includes(to.slug)
    const attackerDice =
      (beforeGreatOffensive && intoHomeland) || turkishOffensiveLimited ? LIMITED_ATTACK_DICE : 3
    return {
      attacker: greekOffensiveBroken ? Math.min(attackerDice, GREECE_BROKEN_DICE) : attackerDice,
      defender: intoHomeland && this.round >= GREAT_OFFENSIVE_ROUND ? TBMM_DEFENDER_DICE : 2
    }
  }

  // Is one more exchange worth it? Uses the REAL caps and exact odds: press
  // only while the expected trade favours the attacker and it can still afford
  // to clear the garrison.
  worthPressing(from: Territory, to: Territory): boolean {
    if (from.troops < 2 || to.troops < 1) return false
    const caps = this.diceCapsFor(from, to)
    const odds = EXCHANGE_ODDS[`${Math.min(caps.attacker, from.troops - 1)}v${Math.min(caps.defender, to.troops)}`]
    if (!odds || odds.defender <= odds.attacker) return false
    // expected own losses to wipe the remaining garrison
    const cost = (to.troops * odds.attacker) / odds.defender
    return from.troops - 1 > cost
  }

  // Stage a battle without rolling — clicking an enemy only sets up the fight;
  // dice are thrown when the player presses. Returns a zero-loss pending
  // result so the UI can show the matchup and its controls.
  // Exactly the orders beginAttack would accept from this province. The UI
  // highlights these, so anything it offers can actually be carried out — a
  // province barred by the restraint rule or a treaty line is not a target.
  attackTargets(fromSlug: string): string[] {
    const from = this.bySlug[fromSlug]
    if (!from || this.phase !== 'attack') return []
    const attacker = from.faction
    if (attacker !== this.currentPlayer.faction || from.troops < 2 || this.frozen(attacker)) return []
    return from.adjacent
      .filter(to => to.faction !== attacker && this.mayAttack(attacker, to.faction) && !this.frontClosed(attacker, to))
      .map(to => to.slug)
  }

  beginAttack(fromSlug: string, toSlug: string): BattleResult | null {
    if (this.phase !== 'attack') return null
    // moving on without answering means the minimum advanced
    if (this.pendingAdvance) this.advance(0)
    const from = this.bySlug[fromSlug]
    const to = this.bySlug[toSlug]
    const attacker = from.faction
    const defender = to.faction
    if (attacker !== this.currentPlayer.faction || defender === attacker) return null
    if (!from.isAdjacentTo(to) || from.troops < 2) return null
    if (!this.mayAttack(attacker, defender)) return null
    if (this.frontClosed(attacker, to) || this.frozen(attacker)) return null

    // switching targets abandons the previous fight (logged as a withdrawal)
    const b = this.activeBattle
    if (b && (b.from !== from || b.to !== to)) this.pullBack()

    if (!this.activeBattle) {
      this.activeBattle = { from, to, attackerLosses: 0, defenderLosses: 0 }
      // a province that fires on the homeland becomes a legitimate target
      if (attacker.alliance !== 'turkey' && defender.alliance === 'turkey') from.raidedOn = this.round
      defender.grudges.add(attacker.name)
      to.quietTurns = 0
      if (this.atPeace(defender)) {
        defender.peaceBroken = true
        this.record(
          defender,
          t('log.peaceBroken', { attacker: tFaction(attacker.name), defender: tFaction(defender.name) }),
          true
        )
      }
    }
    const battle = this.activeBattle
    return {
      from,
      to,
      attacker,
      defender,
      rounds: [],
      conquered: false,
      attackerLosses: battle.attackerLosses,
      defenderLosses: battle.defenderLosses,
      troopsMoved: 0,
      eliminatedFaction: null,
      pending: true
    }
  }

  // One dice exchange. Combat is stepped so the attacker can pull back after a
  // bad round instead of being locked into a blitz to the death. Accumulated
  // losses live in activeBattle; the capture/repel line is logged only when the
  // battle actually ends.
  attackRound(fromSlug: string, toSlug: string): BattleResult | null {
    if (this.phase !== 'attack') return null
    const from = this.bySlug[fromSlug]
    const to = this.bySlug[toSlug]
    const attacker = from.faction
    const defender = to.faction
    if (attacker !== this.currentPlayer.faction || defender === attacker) return null
    if (!from.isAdjacentTo(to) || from.troops < 2) return null
    if (!this.mayAttack(attacker, defender)) return null
    if (this.frontClosed(attacker, to) || this.frozen(attacker)) return null

    // switching targets abandons the previous fight — log it as a withdrawal
    const b = this.activeBattle
    if (b && (b.from !== from || b.to !== to)) this.pullBack()

    if (!this.activeBattle) {
      this.activeBattle = { from, to, attackerLosses: 0, defenderLosses: 0 }
      defender.grudges.add(attacker.name)
      to.quietTurns = 0 // contesting a province stops it digging in
      // Attacking a faction that had settled out of the war voids the peace.
      if (this.atPeace(defender)) {
        defender.peaceBroken = true
        this.record(
          defender,
          t('log.peaceBroken', { attacker: tFaction(attacker.name), defender: tFaction(defender.name) }),
          true
        )
      }
    }
    const battle = this.activeBattle

    const caps = this.diceCapsFor(from, to)
    const attackerDiceCap = caps.attacker
    const defenderDiceCap = caps.defender
    // burn one of the requisition's exchanges if this one used it
    if (this.requisitionActive && NATIONAL_PACT.includes(to.slug)) battle.equippedUsed = (battle.equippedUsed ?? 0) + 1

    const attackerDice = rollDice(Math.min(attackerDiceCap, from.troops - 1))
    const defenderDice = rollDice(Math.min(defenderDiceCap, to.troops))
    let aLoss = 0
    let dLoss = 0
    for (let i = 0; i < Math.min(attackerDice.length, defenderDice.length); i++) {
      if (attackerDice[i] > defenderDice[i]) dLoss++
      else aLoss++
    }
    from.troops -= aLoss
    to.troops -= dLoss
    battle.attackerLosses += aLoss
    battle.defenderLosses += dLoss
    const round: BattleRound = { attackerDice, defenderDice, attackerLosses: aLoss, defenderLosses: dLoss }

    let conquered = false
    let troopsMoved = 0
    let eliminatedFaction: Faction | null = null
    if (to.troops === 0) {
      conquered = true
      this.conqueredThisTurn = true
      // read tenure BEFORE changeControl resets it
      const occupiedFor = this.round - to.heldSince
      to.changeControl(attacker, this.round)
      // Classic Risk: the winner chooses how much of the assault force actually
      // advances. At least as many as the dice just thrown — those men are
      // already across — and at most everything bar the garrison left behind.
      const max = from.troops - 1
      const min = Math.min(attackerDice.length, max)
      troopsMoved = attacker === this.humanPlayer.faction ? min : max
      from.troops -= troopsMoved
      to.troops = troopsMoved
      this.pendingAdvance =
        attacker === this.humanPlayer.faction && max > min ? { from: from.slug, to: to.slug, min, max } : null
      if (attacker.alliance === 'turkey' && NATIONAL_PACT.includes(to.slug)) {
        // before the offensive it is local militia rallying: a province snatched
        // straight back is still organized to fight, one the occupiers have
        // settled into gives up less. After it, the regular army garrisons every
        // liberated province alike.
        if (this.round < GREAT_OFFENSIVE_ROUND) {
          to.troops += occupiedFor <= 1 ? LIBERATION_TROOPS + 1 : LIBERATION_TROOPS
        } else if (!this.liberatedThisTurn) {
          to.troops += POST_OFFENSIVE_LIBERATION
          this.liberatedThisTurn = true
        }
      }
      if (defender.eliminated) {
        eliminatedFaction = defender
        attacker.hand.push(...defender.hand)
        defender.hand = []
        this.record(defender, t('log.knockedOut', { faction: tFaction(defender.name) }))
      }
    }

    const pending = !conquered && from.troops > 1 && to.troops > 0
    const totalA = battle.attackerLosses
    const totalD = battle.defenderLosses
    // log once, when the battle ends: conquered here, or the attacker is spent
    if (conquered) {
      this.record(
        attacker,
        t('log.captured', {
          attacker: tFaction(attacker.name),
          territory: tTerritory(to.slug, to.name),
          territoryAcc: tCase(tTerritory(to.slug, to.name), 'acc'),
          defender: tFaction(defender.name),
          atkLoss: totalA,
          defLoss: totalD
        })
      )
      this.activeBattle = null
    } else if (!pending) {
      this.logRepel(attacker, defender, to, totalA, totalD)
      this.activeBattle = null
    }

    this.checkGameEnd()
    return {
      from,
      to,
      attacker,
      defender,
      rounds: [round],
      conquered,
      attackerLosses: totalA,
      defenderLosses: totalD,
      troopsMoved,
      eliminatedFaction,
      pending
    }
  }

  // Send `n` of the assault force forward. Anything below the minimum is the
  // minimum (those men crossed with the winning throw); anything above what the
  // source can spare is capped. Returns how many ended up in the new province.
  advance(n: number) {
    const move = this.pendingAdvance
    if (!move) return 0
    const from = this.bySlug[move.from]
    const to = this.bySlug[move.to]
    this.pendingAdvance = null
    const want = Math.min(Math.max(n, move.min), move.max)
    const extra = want - move.min
    if (extra > 0) {
      from.troops -= extra
      to.troops += extra
    }
    return to.troops
  }

  private logRepel(attacker: Faction, defender: Faction, to: Territory, atkLoss: number, defLoss: number) {
    this.record(
      attacker,
      t('log.repelled', {
        attacker: tFaction(attacker.name),
        territory: tTerritory(to.slug, to.name),
        territoryDat: tCase(tTerritory(to.slug, to.name), 'dat'),
        defender: tFaction(defender.name),
        atkLoss,
        defLoss
      })
    )
  }

  // Stop the current battle and hold; the attacker keeps its surviving troops.
  pullBack() {
    const b = this.activeBattle
    if (!b) return
    this.activeBattle = null
    // from's owner is the attacker (its territory was never conquered)
    this.logRepel(b.from.faction, b.to.faction, b.to, b.attackerLosses, b.defenderLosses)
  }

  // Blitz: resolve a whole battle at once (AI convenience, and the "blitz"
  // button). Returns the final accumulated result.
  attack(fromSlug: string, toSlug: string): BattleResult | null {
    let last: BattleResult | null = null
    let step = this.attackRound(fromSlug, toSlug)
    while (step) {
      last = step
      if (!step.pending) break
      step = this.attackRound(fromSlug, toSlug)
    }
    return last
  }

  // How many men a province can release in one move. A garrison holds its
  // ground; what is left over can march — but only half of it moves out of
  // occupied ground.
  //
  // Moving inside somebody else's country is not moving inside your own. Across
  // the Misak-ı Millî the occupation had to run its columns past a population
  // that was not helping and irregulars who cut the road and the telegraph
  // behind them; concentrating a force took weeks. Ankara felt none of it,
  // because it was home, and that interior line was a real advantage.
  //
  // This used to read "Greece moves half", which put the drag on a nationality
  // rather than on the ground — and charged Athens for the Aegean a second time
  // on marches between Salonica and Kozani that never touched water.
  movable(from: Territory) {
    const spare = from.troops - 1
    const occupied = from.faction.alliance !== 'turkey' && NATIONAL_PACT.includes(from.slug)
    return occupied ? Math.floor(spare / 2) : spare
  }

  fortify(fromSlug: string, toSlug: string, count: number) {
    if (this.phase !== 'fortify' || this.fortifiesUsed >= this.fortifyLimit) return false
    const from = this.bySlug[fromSlug]
    const to = this.bySlug[toSlug]
    const faction = this.currentPlayer.faction
    if (from.faction !== faction || to.faction !== faction || !from.isAdjacentTo(to)) return false
    const moved = Math.min(count, this.movable(from))
    if (moved <= 0) return false
    from.troops -= moved
    to.troops += moved
    this.fortifiesUsed++
    return true
  }

  // The ports this province can ship to. Both ends must be held: a crossing is
  // a transfer between your own harbours, not an amphibious assault — nobody
  // in this war put an army ashore against opposition, and the one power that
  // tried it at Gallipoli had learned better.
  seaTargets(fromSlug: string): string[] {
    const from = this.bySlug[fromSlug]
    if (!from || this.phase !== 'fortify' || this.fortifiesUsed >= this.fortifyLimit) return []
    const faction = this.currentPlayer.faction
    if (from.faction !== faction || !NAVIES.has(faction.name) || this.movable(from) <= 0) return []
    return SEA_LANES.flatMap(lane => {
      const other = lane.ports[0] === fromSlug ? lane.ports[1] : lane.ports[1] === fromSlug ? lane.ports[0] : null
      return other && this.bySlug[other]?.faction === faction ? [other] : []
    })
  }

  /** What this province can put aboard: what it can spare, up to a hull's worth. */
  shippable(from: Territory) {
    return Math.min(this.movable(from), CROSSING_CAPACITY)
  }

  // Put men aboard. They leave the province at once and are at sea until the
  // crossing is done — which is the whole cost of the thing: for two rounds
  // they are in neither theatre and can defend nothing.
  embark(fromSlug: string, toSlug: string, count: number) {
    if (!this.seaTargets(fromSlug).includes(toSlug)) return false
    const from = this.bySlug[fromSlug]
    const faction = this.currentPlayer.faction
    const moved = Math.min(count, this.shippable(from))
    if (moved <= 0) return false
    from.troops -= moved
    this.convoys.push({
      faction: faction.name,
      from: fromSlug,
      to: toSlug,
      troops: moved,
      arrives: this.round + CROSSING_ROUNDS
    })
    this.fortifiesUsed++
    this.record(
      faction,
      t('log.embark', {
        faction: tFaction(faction.name),
        n: moved,
        from: tTerritory(fromSlug, from.name),
        to: tTerritory(toSlug, this.bySlug[toSlug].name)
      })
    )
    return true
  }

  // Convoys come ashore at the top of their owner's turn, so an army that has
  // finished its crossing can be used the round it lands. A port lost while the
  // ships were at sea turns them around; a fleet with nowhere left to put in
  // has made the crossing for nothing.
  landConvoys() {
    if (!this.convoys.length) return
    const faction = this.currentPlayer.faction
    const stillAtSea: Convoy[] = []
    for (const convoy of this.convoys) {
      if (convoy.faction !== faction.name || this.round < convoy.arrives) {
        stillAtSea.push(convoy)
        continue
      }
      const to = this.bySlug[convoy.to]
      const home = this.bySlug[convoy.from]
      const port = to.faction === faction ? to : home.faction === faction ? home : null
      if (!port) {
        this.record(faction, t('log.convoyLost', { faction: tFaction(faction.name), n: convoy.troops }))
        continue
      }
      port.troops += convoy.troops
      this.record(
        faction,
        t(port === to ? 'log.convoyLanded' : 'log.convoyTurnedBack', {
          faction: tFaction(faction.name),
          n: convoy.troops,
          territory: tTerritory(port.slug, port.name)
        })
      )
    }
    this.convoys = stillAtSea
  }

  endPhase() {
    if (this.pendingAdvance) this.advance(0)
    this.pullBack()
    if (this.phase === 'reinforce' && this.reinforcementsLeft === 0) this.phase = 'attack'
    else if (this.phase === 'attack') this.phase = 'fortify'
    else if (this.phase === 'fortify') this.endTurn()
  }

  endTurn() {
    if (this.phase === 'gameover') return
    if (this.conqueredThisTurn) this.drawCard(this.currentPlayer.faction)
    const total = this.players.length
    for (let step = 1; step <= total; step++) {
      const nextIndex = (this.currentPlayerIndex + step) % total
      if (!this.players[nextIndex].faction.eliminated) {
        if (nextIndex <= this.currentPlayerIndex) {
          this.round++
          this.entrench()
          this.ankaraLevy()
          this.salonicaLevy()
          this.assemblyUpkeep()
          this.conferenceUpkeep()
        }
        this.currentPlayerIndex = nextIndex
        this.startTurn()
        return
      }
    }
  }

  // AI turns run in three steppable stages so the UI can pace the attacks
  // (one battle every few hundred ms instead of the whole turn in one burst).
  aiAttacksLeft = 0

  // Set to play the AI factions from trained models; left null they fall back
  // to the hand-written heuristics below.
  aiScorer: AiScorer | null = null
  aiSelector: AiSelector | null = null

  /** Best of a set of candidate moves according to the model. */
  private bestMove(faction: Faction, moves: AiMove[]): AiMove | null {
    if (!moves.length) return null
    if (this.aiSelector) return this.aiSelector(this, faction, moves)
    if (!this.aiScorer) return null
    let best = moves[0]
    let bestScore = -Infinity
    for (const move of moves) {
      const score = this.aiScorer(this, faction, move)
      if (score > bestScore) {
        bestScore = score
        best = move
      }
    }
    return best
  }

  aiBeginTurn() {
    if (this.phase === 'gameover' || this.currentPlayer.isHuman) return
    const faction = this.currentPlayer.faction
    while (this.findTradeSet(faction.hand)) this.tradeCards(faction)
    if (this.aiScorer) {
      // Scoring is the hot loop — thousands of forward passes a turn — and
      // adding ONE unit barely moves the board, so re-picking every unit costs
      // a dozen evaluations to answer the same question a dozen times. Score
      // once, then send that batch there before looking again.
      let guard = 0
      while (this.phase === 'reinforce' && this.reinforcementsLeft > 0 && guard++ < 400) {
        const move = this.bestMove(
          faction,
          faction.territories.map(from => ({ kind: 'reinforce' as const, from }))
        )
        if (!move?.from) break
        for (let i = 0; i < REINFORCE_BATCH && this.reinforcementsLeft > 0; i++)
          this.placeReinforcement(move.from.slug)
      }
    }
    this.autoPlaceReinforcements()
    this.phase = 'attack'
    // The per-faction attack caps below are the hand-written AI's personality —
    // Britain gets two strikes a turn, Italy one, because a written AI has no
    // other way to be told that London will not campaign in Anatolia. A trained
    // one does: stopping is a move it scores like any other, and it is paid for
    // its casualties. Leaving the cap on top of that gagged it — Britain sat on
    // Mosul with six provinces behind it and was allowed two attacks a turn, so
    // it could never make anything of the position. Under a model, the budget
    // is uniform and the model decides when it has done enough.
    const base = this.aiScorer || this.aiSelector
      ? MODEL_ATTACK_BUDGET
      : (AGGRESSION[faction.name] ?? { maxAttacks: 4, minEdge: 3 }).maxAttacks
    // a faction with a score to settle fights even if it would otherwise sit
    // out the round, and gets enough attacks to actually hit back
    this.aiAttacksLeft = this.frozen(faction)
      ? 0
      : faction.grudges.size
        ? Math.max(base, RETALIATION.maxAttacks)
        : this.isPassive(faction)
          ? 0
          : base
  }

  /** Every attack the rules would accept from this faction, plus stopping. */
  private aiAttackOptions(faction: Faction): AiMove[] {
    const moves: AiMove[] = [{ kind: 'end' }]
    for (const from of faction.territories) {
      if (from.troops < 2) continue
      for (const slug of this.attackTargets(from.slug)) moves.push({ kind: 'attack', from, to: this.bySlug[slug] })
    }
    return moves
  }

  // Performs ONE attack; returns true if it attacked (more may follow).
  aiAttackStep(): boolean {
    if (this.phase !== 'attack' || this.currentPlayer.isHuman || this.aiAttacksLeft <= 0) return false
    const faction = this.currentPlayer.faction
    if (this.aiScorer) {
      const move = this.bestMove(faction, this.aiAttackOptions(faction))
      if (!move || move.kind === 'end' || !move.from || !move.to) {
        this.aiAttacksLeft = 0
        return false
      }
      if (!this.beginAttack(move.from.slug, move.to.slug)) {
        this.aiAttacksLeft = 0
        return false
      }
      let step = this.attackRound(move.from.slug, move.to.slug)
      while (step && step.pending) {
        if (!this.worthPressing(move.from, move.to)) {
          this.pullBack()
          break
        }
        step = this.attackRound(move.from.slug, move.to.slug)
      }
      if (this.pendingAdvance) this.advance(this.pendingAdvance.max)
      this.aiAttacksLeft--
      return true
    }
    const aggression = AGGRESSION[faction.name] ?? { maxAttacks: 4, minEdge: 3 }
    const options: { from: Territory; to: Territory; score: number }[] = []
    faction.territories.forEach(from => {
      if (from.troops < 3) return
      from.adjacent.forEach(to => {
        if (to.faction === faction || !this.mayAttack(faction, to.faction)) return
        if (this.frontClosed(faction, to)) return
        // strike back at whoever attacked us before pursuing anyone else
        const avenging = faction.grudges.has(to.faction.name)
        const minEdge = avenging ? Math.min(aggression.minEdge, RETALIATION.minEdge) : aggression.minEdge
        // a seat of government is worth far more than its province count: taking
        // it suspends the Assembly and everything that depends on it
        const seat = to.faction.alliance === 'turkey' && ASSEMBLY_SEATS.includes(to.slug) ? SEAT_PRIORITY : 0
        const edge = from.troops - to.troops
        if (edge >= minEdge) options.push({ from, to, score: (avenging ? edge + 100 : edge) + seat })
      })
    })
    if (options.length === 0) {
      this.aiAttacksLeft = 0
      return false
    }
    options.sort((a, b) => b.score - a.score)
    const { from, to } = options[0]
    // press round by round, retreating the moment the edge is gone rather than
    // blitzing into a losing fight
    let step = this.attackRound(from.slug, to.slug)
    while (step && step.pending) {
      if (!this.worthPressing(from, to)) {
        this.pullBack()
        break
      }
      step = this.attackRound(from.slug, to.slug)
    }
    this.aiAttacksLeft--
    return true
  }

  aiFinishTurn() {
    if (this.phase === 'gameover' || this.currentPlayer.isHuman) return
    const faction = this.currentPlayer.faction
    this.phase = 'fortify'
    if (this.aiScorer) {
      const moves: AiMove[] = [{ kind: 'end' }]
      for (const from of faction.territories) {
        if (from.troops < 2) continue
        for (const to of from.adjacent) if (to.faction === faction) moves.push({ kind: 'fortify', from, to })
        for (const slug of this.seaTargets(from.slug)) moves.push({ kind: 'sail', from, to: this.bySlug[slug] })
      }
      const move = this.bestMove(faction, moves)
      if (move?.from && move.to) {
        if (move.kind === 'fortify') this.fortify(move.from.slug, move.to.slug, this.movable(move.from))
        else if (move.kind === 'sail') this.embark(move.from.slug, move.to.slug, this.movable(move.from))
      }
      this.endTurn()
      return
    }
    // ship first, if a port across the water is in more trouble than the one
    // that would be sending the men — a fleet is worth having only if something
    // reaches for it
    if (!this.shipReinforcements(faction)) {
      const interior = faction.territories
        .filter(t => t.troops > 1 && t.adjacent.every(a => a.faction === faction))
        .sort((a, b) => b.troops - a.troops)[0]
      if (interior) {
        const border = interior.adjacent
          .filter(t => t.faction === faction)
          .sort((a, b) => this.threatOf(b) - this.threatOf(a))[0]
        if (border && this.threatOf(border) > -Infinity) this.fortify(interior.slug, border.slug, this.movable(interior))
      }
    }
    this.endTurn()
  }

  // The heuristic's use of a sea lane: send men from the quiet port to the one
  // under pressure. Deliberately plain — a faction with a fleet that never
  // sails makes the whole mechanic invisible to anything that is not a trained
  // model, including the balance sweep.
  shipReinforcements(faction: Faction) {
    for (const from of faction.territories) {
      if (this.shippable(from) <= 0) continue
      for (const slug of this.seaTargets(from.slug)) {
        const to = this.bySlug[slug]
        if (this.threatOf(to) <= this.threatOf(from)) continue
        if (to.troops >= from.troops) continue
        if (this.embark(from.slug, slug, this.shippable(from))) return true
      }
    }
    return false
  }

  // Plays the current AI player's entire turn at once (console sims / tests).
  playAiTurn() {
    this.aiBeginTurn()
    while (this.aiAttackStep()) {}
    this.aiFinishTurn()
  }

  // Ankara's standing levy, applied once per round while Turkey holds it.
  ankaraLevy() {
    const ankara = this.bySlug['ankara']
    if (ankara && ankara.faction.alliance === 'turkey') ankara.troops += ANKARA_LEVY
  }

  // Salonica did for Greece what Ankara does for Turkey: it was Venizelos's own
  // base, where he ran the National Defence government while the king held
  // Athens, and the second city of the kingdom. It levies while he is in power —
  // and stops the moment he loses the election, which is when the royalists took
  // the war over and the Anatolian effort began to come apart.
  salonicaLevy() {
    const salonica = this.bySlug['salonica']
    if (!salonica || salonica.faction.name !== 'Greece') return
    if (this.venizelosFell || this.greeceCollapsed) return
    salonica.troops += SALONICA_LEVY
  }

  // Called once per round (not per turn) so the clock is in game time.
  entrench() {
    for (const territory of this.territories) {
      const turkish = territory.faction.alliance === 'turkey'
      // Turkey's militia growth ends when the regular army takes the field at
      // the Great Offensive; occupier entrenchment only ever applied to the
      // homeland and lapsed at the political collapse.
      if (turkish && this.round >= GREAT_OFFENSIVE_ROUND) continue
      // a requisitioned province has nothing left to arm a militia with
      if (turkish && this.requisitionActive) continue
      if (!turkish && (!NATIONAL_PACT.includes(territory.slug) || this.round >= EXHAUSTION_ROUND)) continue
      const every = turkish ? TR_ENTRENCH_EVERY : ENTRENCH_EVERY
      const max = turkish ? TR_ENTRENCH_MAX : ENTRENCH_MAX
      territory.quietTurns++
      if (territory.entrenched >= max || territory.quietTurns < every) continue
      territory.quietTurns = 0
      territory.entrenched++
      territory.troops++
    }
  }

  // ---- historical events ----

  // Raise every event whose round has arrived and whose gate passes. Events
  // marked `card` queue a popup; the rest are quiet log lines. A decision
  // (an event with `choices`) blocks further events until the player answers,
  // so two cards never fight over the screen.
  fireEvents() {
    for (const event of HISTORICAL_EVENTS) {
      if (this.pendingDecision) return
      // keyed by textKey, not round: two events can share a round (the Great
      // Offensive and the exhaustion notice both land on Aug 1922) and both
      // must be reported
      if (this.round < event.round || this.announcedEvents.has(event.textKey)) continue
      // a gate that fails skips the event permanently — an occupied Sivas
      // means the Sivas Congress simply never happened
      if (event.gate && !event.gate(this)) {
        // a gate with attempts left waits for its precondition instead of
        // being consumed — losing Ankara delays the Assembly, it doesn't
        // cancel it — but only for so long
        // count one attempt per ROUND, not per player turn: fireEvents runs at
        // the start of every seat's turn, so a raw counter would burn through
        // seven attempts a round
        if (this.gateCheckedOn[event.textKey] !== this.round) {
          this.gateCheckedOn[event.textKey] = this.round
          const tried = (this.gateRetries[event.textKey] ?? 0) + 1
          this.gateRetries[event.textKey] = tried
          if (tried >= (event.attempts ?? 1)) this.announcedEvents.add(event.textKey)
        }
        continue
      }
      // a faction the player has already knocked out has no news to make —
      // suppress its announcement rather than reporting it makes peace
      const actor = this.factions.find(f => f.name === event.faction) ?? null
      if (actor?.eliminated) {
        this.announcedEvents.add(event.textKey)
        continue
      }
      // a decision belongs to the player: if the round rolled over on an AI
      // seat, leave it unannounced so it surfaces on the human's own turn
      if (event.choices && !this.currentPlayer.isHuman) continue
      this.announcedEvents.add(event.textKey)
      this.record(actor, t(event.textKey, event.vars?.(this)), true)
      if (event.choices) {
        // its effect runs from resolveDecision once the player answers
        this.pendingDecision = event
        return
      }
      event.effect?.(this)
      if (event.card) this.pendingCards.push(event.textKey)
    }
  }

  // The player answered a decision card. Applies the chosen branch.
  resolveDecision(choiceKey: string) {
    const event = this.pendingDecision
    if (!event) return
    // validate BEFORE clearing: an unrecognised answer must leave the question
    // standing rather than silently dismissing it
    const choice = event.choices?.find(c => c.key === choiceKey)
    if (!choice) return
    this.pendingDecision = null
    this.record(this.currentPlayer.faction, t(`${event.textKey}.${choiceKey}.log`), true)
    choice.effect(this)
    // a decision held up the rest of the round's news — let it through now
    this.fireEvents()
  }

  // The UI shows every queued notice as one card, so dismissing clears the lot.
  // Decisions never land here — they halt fireEvents and wait in pendingDecision.
  clearEventCards() {
    this.pendingCards.length = 0
  }

  // A congress puts the movement's own organization behind the provinces that
  // answered it: each advances its militia clock one step immediately.
  congressPulse(scope: string[] | null) {
    const turkey = this.humanPlayer.faction
    for (const territory of this.territories) {
      if (territory.faction !== turkey) continue
      if (scope && !scope.includes(territory.slug)) continue
      if (territory.entrenched >= TR_ENTRENCH_MAX) continue
      territory.entrenched++
      territory.quietTurns = 0
      territory.troops++
    }
  }

  // The Allies take the capital by force. Turkey loses İstanbul if it holds it,
  // but the occupation is what drove the movement to Ankara — so it draws a card.
  occupyIstanbul() {
    const britain = this.factions.find(f => f.name === 'Britain')
    const istanbul = this.bySlug['istanbul']
    if (!britain || britain.eliminated) return
    const turkey = istanbul.faction
    // The garrison is lost — the men in the City are interned or slip out to
    // Anatolia — but what marches in is an occupation force, not the army that
    // was standing there. Handing Britain the whole Turkish garrison intact
    // punished the player twice: the province AND the men, now pointed back at
    // him. Half is what the occupation is worth.
    const occupiers = Math.max(1, Math.floor(istanbul.troops / 2))
    istanbul.changeControl(britain, this.round)
    istanbul.troops = occupiers
    this.drawCard(turkey)
    this.checkGameEnd()
  }

  // Sèvres: a dictated peace that gutted morale, then hardened it. The levy is
  // halved while the shock lasts and stands permanently higher afterwards.
  sevresShock() {
    this.sevresRound = this.round
  }

  westernProvincesHeld() {
    const turkey = this.humanPlayer.faction
    return WESTERN_PROVINCES.map(slug => this.bySlug[slug]).filter(t => t.faction === turkey && t.troops > 1)
  }

  // Çerkes Ethem's irregulars turn on the regular army: one western province
  // loses half its garrison and whatever it had dug in.
  ethemRevolt() {
    const candidates = this.westernProvincesHeld()
    if (!candidates.length) return
    // half the western provinces go over, chosen at random — shuffle and take
    // the first half (rounded up, so a single eligible province still revolts)
    const shuffled = [...candidates]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const risen = shuffled.slice(0, Math.ceil(shuffled.length / 2))
    let lost = 0
    for (const territory of risen) {
      const gone = Math.floor(territory.troops / 2)
      territory.troops -= gone
      territory.entrenched = 0
      territory.quietTurns = 0
      lost += gone
    }
    this.record(
      risen[0].faction,
      t('log.ethemRevolt', {
        territories: risen.map(r => tTerritory(r.slug, r.name)).join(', '),
        n: lost
      }),
      true
    )
  }

  // İnönü: holding the line in front of Eskişehir costs the Greek army dearly
  // and wins the movement its first recognition.
  inonuStand() {
    const turkey = this.humanPlayer.faction
    const greece = this.factions.find(f => f.name === 'Greece')
    if (!greece || greece.eliminated) return
    // bleed the strongest Greek force threatening Eskişehir
    const front = this.bySlug['eskisehir'].adjacent
      .filter(a => a.faction === greece)
      .sort((a, b) => b.troops - a.troops)[0]
    if (front) front.troops = Math.max(1, front.troops - INONU_GREEK_LOSSES)
    this.drawCard(turkey)
  }

  // The Greek summer offensive of 1921 — the counterweight to İnönü and Sakarya,
  // and the thing that keeps Greece a going concern through 1921 rather than
  // being ground down the moment Venizelos leaves. The royalist army was still
  // advancing: this reinforces and digs in the Greek spearhead, the Pact
  // provinces on the Turkish front, one last push before Sakarya halts it.
  greekSummerOffensive() {
    const greece = this.factions.find(f => f.name === 'Greece')
    if (!greece || greece.eliminated || this.greeceCollapsed) return
    const front = greece.territories.filter(
      t => NATIONAL_PACT.includes(t.slug) && t.adjacent.some(a => a.faction.alliance === 'turkey')
    )
    if (!front.length) return
    let landed = 0
    for (const territory of front) {
      territory.troops += GREEK_OFFENSIVE_SURGE
      if (territory.entrenched < ENTRENCH_MAX) territory.entrenched++
      territory.quietTurns = 0
      landed += GREEK_OFFENSIVE_SURGE
    }
    this.record(greece, t('log.greekOffensive', { n: landed }), true)
  }

  // Sakarya: twenty-two days that ended the Greek advance for good.
  sakaryaStand() {
    this.sakaryaRound = this.round
  }

  signKarsTreaty() {
    this.karsTreatySigned = true
  }

  // Mudanya: with the city encircled, Britain gives up İstanbul rather than
  // fight for it, and pulls its garrison back to what it still holds.
  mudanyaArmistice() {
    const britain = this.factions.find(f => f.name === 'Britain')
    const turkey = this.humanPlayer.faction
    const istanbul = this.bySlug['istanbul']
    if (!britain || istanbul.faction !== britain) return
    // the garrison isn't destroyed — it redeploys evenly across Britain's
    // remaining provinces, so the concession costs it position, not strength
    const garrison = istanbul.troops
    const rest = britain.territories.filter(x => x !== istanbul)
    if (rest.length) {
      const each = Math.floor(garrison / rest.length)
      let spare = garrison - each * rest.length
      for (const territory of rest) {
        territory.troops += each + (spare-- > 0 ? 1 : 0)
      }
    }
    istanbul.changeControl(turkey, this.round)
    istanbul.troops = 1
    this.record(
      britain,
      t('log.mudanyaRedeploy', { n: garrison, territories: rest.length }),
      true
    )
    this.checkGameEnd()
  }

  // Everything that decides when and how the war ends, once per round.
  conferenceUpkeep() {
    if (this.phase === 'gameover') return
    const complete = this.pactProgress === NATIONAL_PACT.length
    this.pactHeldTurns = complete ? this.pactHeldTurns + 1 : 0

    // the outer limit: the powers stop waiting
    if (this.round >= LAUSANNE_ROUND) return this.settleAtLausanne()

    // the war aim is never met by touching all thirty for a moment: the Pact has
    // to be HELD for three turns, before the conference or after refusing it
    if (complete && this.pactHeldTurns >= PACT_HOLD_TURNS) return this.settleAtLausanne()

    // terms are dictated rather than offered when nobody can enforce a refusal
    if (this.round >= CONFERENCE_ROUND && !this.rejectedAt && !this.landersAlive)
      return this.settleAtLausanne()

    if (this.rejectedAt && this.round > this.rejectedAt) this.runLandings()
  }

  // Refusing terms restarts the war. The powers come back by sea.
  refuseTerms() {
    this.rejectedAt = this.round
    this.pactHeldTurns = 0
    this.record(null, t('log.termsRefused'), true)
  }

  // Every beach the fleets can reach, whoever holds it. The Straits open
  // İstanbul once both sides of the Dardanelles are theirs, and İstanbul in
  // turn opens İzmit.
  landingSites() {
    const open = [...LANDING_SITES]
    if (STRAITS.every(slug => this.bySlug[slug].faction.alliance !== 'turkey')) open.push('istanbul')
    if (this.bySlug['istanbul'].faction.alliance !== 'turkey') open.push('izmit')
    return open.map(slug => this.bySlug[slug])
  }

  runLandings() {
    const powers = LANDING_POWERS.map(name => this.factions.find(f => f.name === name)).filter(
      (f): f is Faction => !!f && !f.eliminated
    )
    if (!powers.length) return
    const first = this.round === this.rejectedAt + 1
    const strength = first ? LANDING_FIRST_WAVE : LANDING_WAVE
    const sites = this.landingSites()
    if (!sites.length) return
    // two beaches, picked at random and independently — the same one twice is a
    // second wave onto the same sand, which is fine
    for (let n = 0; n < LANDINGS_PER_TURN; n++) {
      const site = sites[Math.floor(Math.random() * sites.length)]
      const power = powers[Math.floor(Math.random() * powers.length)]
      this.landOn(power, site, strength)
    }
  }

  // A fair fight — unless the beach is already theirs, in which case the wave
  // simply comes ashore and joins the beachhead. Getting those men inland is
  // the power's own business, on its own turn, like any other garrison.
  landOn(power: Faction, site: Territory, strength: number) {
    const defender = site.faction
    if (defender.alliance === power.alliance) {
      site.troops += strength
      this.record(power, t('log.landingUnopposed', {
        faction: tFaction(power.name),
        territory: tTerritory(site.slug, site.name),
        n: strength
      }), true)
      return
    }
    let attackers = strength
    let defenders = site.troops
    const homeland = NATIONAL_PACT.includes(site.slug)
    while (attackers > 0 && defenders > 0) {
      const attackDice = rollDice(Math.min(3, attackers))
      const defenceDice = rollDice(Math.min(homeland && this.round >= GREAT_OFFENSIVE_ROUND ? 3 : 2, defenders))
      for (let i = 0; i < Math.min(attackDice.length, defenceDice.length); i++)
        if (attackDice[i] > defenceDice[i]) defenders--
        else attackers--
    }
    if (defenders > 0) {
      site.troops = defenders
      this.record(power, t('log.landingRepelled', {
        faction: tFaction(power.name),
        territory: tTerritory(site.slug, site.name),
        n: strength
      }), true)
      return
    }
    site.changeControl(power, this.round)
    site.troops = Math.max(1, attackers)
    site.raidedOn = this.round
    if (!this.landedOn.includes(site.slug)) this.landedOn.push(site.slug)
    defender.grudges.add(power.name)
    power.peaceBroken = true
    this.record(power, t('log.landing', {
      faction: tFaction(power.name),
      territory: tTerritory(site.slug, site.name),
      n: site.troops
    }), true)
    this.checkGameEnd()
  }

  // The Assembly stands while Turkey holds Ankara or Sivas. Lose both and it is
  // driven out; hold one again for three consecutive turns and it reconvenes.
  // What it already did — treaties signed, laws passed — is not undone.
  assemblyUpkeep() {
    if (!this.assemblyEverOpened) return
    if (!holdsAnySeat(this)) {
      this.assemblySeatTurns = 0
      if (this.assemblyOpened) {
        this.assemblyOpened = false
        this.record(this.humanPlayer.faction, t('log.assemblySuspended'), true)
      }
      return
    }
    if (this.assemblyOpened) return
    this.assemblySeatTurns++
    if (this.assemblySeatTurns < ASSEMBLY_RECONVENE_TURNS) return
    this.assemblyOpened = true
    this.assemblySeatTurns = 0
    const where = assemblySeat(this)
    this.record(
      this.humanPlayer.faction,
      t('log.assemblyReconvened', { city: tCase(tTerritory(where, this.bySlug[where].name), 'loc') }),
      true
    )
  }

  // Chanak brought down the government that had backed the Greek campaign.
  // Britain will garrison what it holds but will not start another war.
  britainStandsDown() {
    this.britainStoodDown = true
  }

  // One government instead of two: the Assembly's writ now runs everywhere,
  // and forces move on interior lines under a single command.
  abolishSultanate() {
    this.fortifyBonus += SULTANATE_FORTIFY_BONUS
  }

  // The army revolts, the king abdicates, the ministers who lost Anatolia are
  // shot. Greece will field no more men.
  greekArmyCollapses() {
    this.greeceCollapsed = true
  }

  // The exchange of populations: the Aegean is resettled on both sides of it.
  populationExchange() {
    const turkey = this.humanPlayer.faction
    for (const slug of MUBADELE_TURKISH) {
      const territory = this.bySlug[slug]
      if (territory.faction === turkey) territory.troops++
    }
    for (const slug of MUBADELE_GREEK) {
      const territory = this.bySlug[slug]
      if (territory.faction.name === 'Greece') territory.troops = Math.max(1, territory.troops - 1)
    }
  }

  easternProvincesHeld() {
    const turkey = this.humanPlayer.faction
    return SHEIKH_SAID_PROVINCES.map(slug => this.bySlug[slug]).filter(t => t.faction === turkey && t.troops > 1)
  }

  // Sheikh Said's rising in the east — the mirror of Çerkes Ethem, and partly
  // a reaction to abolishing the Caliphate a year earlier.
  sheikhSaidRevolt() {
    // the whole east rises at once, not one province of it
    const risen = this.easternProvincesHeld()
    if (!risen.length) return
    let lost = 0
    for (const territory of risen) {
      const gone = Math.floor(territory.troops / 2)
      territory.troops -= gone
      territory.entrenched = 0
      territory.quietTurns = 0
      lost += gone
    }
    this.record(
      risen[0].faction,
      t('log.sheikhSaid', {
        territories: risen.map(r => tTerritory(r.slug, r.name)).join(', '),
        n: lost
      }),
      true
    )
  }

  // The League settles the Mosul question: Britain's Mesopotamian provinces
  // pass to the new Kingdom of Iraq. Mosul only goes if Turkey has not taken
  // it — holding it militarily is exactly what keeps it.
  settleMosulQuestion() {
    const iraq = this.factions.find(f => f.name === 'Iraq')
    if (!iraq) return
    const ceded: Territory[] = []
    for (const slug of IRAQ_AWARD) {
      const territory = this.bySlug[slug]
      if (territory.faction.name !== 'Britain') continue
      territory.changeControl(iraq, this.round)
      ceded.push(territory)
    }
    if (!ceded.length) return
    this.record(
      null,
      t('log.mosulCeded', { territories: ceded.map(c => tTerritory(c.slug, c.name)).join(', ') }),
      true
    )
    this.checkGameEnd()
  }

  // Tekâlif-i Milliye. The orders conscripted nobody — they requisitioned food,
  // cloth, boots and transport, and what they bought was an army able to march
  // and fight one decisive battle. So the levy grants no troops: it opens a
  // window in which the existing army attacks the homeland at full strength.
  requisition() {
    this.requisitionUntil = this.round + REQUISITION_ROUNDS - 1
    this.record(
      this.humanPlayer.faction,
      t('log.tekalifWindow', { n: REQUISITION_ROUNDS, until: this.dateAt(this.requisitionUntil) }),
      true
    )
  }

  // Is the Tekâlif-i Milliye window open this round?
  get requisitionActive() {
    return this.round <= this.requisitionUntil
  }

  // Lausanne closes the war: whoever holds the National Pact when the
  // conference settles keeps it. No more campaigning after this.
  settleAtLausanne() {
    const turkey = this.humanPlayer.faction
    const held = NATIONAL_PACT.filter(slug => this.bySlug[slug].faction === turkey).length
    if (held === NATIONAL_PACT.length) this.winner = turkey
    else this.humanDefeated = true
    this.phase = 'gameover'
    this.endedRound = this.round
    this.record(
      null,
      held === NATIONAL_PACT.length
        ? t('log.victory', { date: tDateLoc(this.date) })
        : t('log.lausanneShort', { held, total: NATIONAL_PACT.length })
    )
  }

  // Hand a withdrawing power's occupied provinces to Turkey. Skipped if the
  // peace was broken — attack them and they fight on instead of conceding.
  applyWithdrawals() {
    const turkey = this.factions.find(f => f.name === 'Turkey')
    if (!turkey) return
    for (const w of WITHDRAWALS) {
      if (this.round < w.round || this.withdrawalsDone.has(w.faction)) continue
      const faction = this.factions.find(f => f.name === w.faction)
      if (!faction) continue
      this.withdrawalsDone.add(w.faction)
      if (faction.peaceBroken) continue
      const ceded = faction.territories.filter(t => !w.keep.includes(t.slug))
      if (!ceded.length) continue
      for (const territory of ceded) {
        territory.changeControl(turkey, this.round)
        territory.troops = 1
      }
      this.record(
        faction,
        t(w.textKey, {
          faction: tFaction(faction.name),
          territories: ceded.map(c => tTerritory(c.slug, c.name)).join(', ')
        }),
        true
      )
      this.checkGameEnd()
    }
  }

  // ---- save / load ----
  // A snapshot is plain JSON: territory ownership and garrisons, per-faction
  // hands/grudges, and the turn state. Static data (shapes, adjacency, names)
  // is never saved — it comes from the bundle, so saves stay small and survive
  // map edits.
  serialize(): GameSnapshot {
    return {
      v: SAVE_VERSION,
      round: this.round,
      phase: this.phase,
      currentPlayerIndex: this.currentPlayerIndex,
      reinforcementsLeft: this.reinforcementsLeft,
      fortifiesUsed: this.fortifiesUsed,
      conqueredThisTurn: this.conqueredThisTurn,
      liberatedThisTurn: this.liberatedThisTurn,
      tradeCount: this.tradeCount,
      humanDefeated: this.humanDefeated,
      winner: this.winner ? this.winner.name : null,
      announcedEvents: [...this.announcedEvents],
      pendingCards: [...this.pendingCards],
      pendingDecision: this.pendingDecision?.textKey ?? null,
      pendingAdvance: this.pendingAdvance ? { ...this.pendingAdvance } : null,
      requisitionUntil: this.requisitionUntil,
      sevresRound: this.sevresRound,
      sakaryaRound: this.sakaryaRound,
      karsTreatySigned: this.karsTreatySigned,
      pactHeldTurns: this.pactHeldTurns,
      rejectedAt: this.rejectedAt,
      landedOn: [...this.landedOn],
      assemblyOpened: this.assemblyOpened,
      assemblyEverOpened: this.assemblyEverOpened,
      assemblySeatTurns: this.assemblySeatTurns,
      gateRetries: { ...this.gateRetries },
      gateCheckedOn: { ...this.gateCheckedOn },
      britainStoodDown: this.britainStoodDown,
      greeceCollapsed: this.greeceCollapsed,
      venizelosFell: this.venizelosFell,
      fortifyBonus: this.fortifyBonus,
      convoys: this.convoys.map(c => ({ ...c })),
      grantsTaken: [...this.grantsTaken],
      withdrawalsDone: [...this.withdrawalsDone],
      territories: Object.fromEntries(
        this.territories.map(t => [t.slug, { faction: t.faction.name, troops: t.troops }])
      ),
      // sparse [quietTurns, entrenched] — omitted when both are zero
      entrench: Object.fromEntries(
        this.territories
          .filter(t => t.quietTurns || t.entrenched)
          .map(t => [t.slug, [t.quietTurns, t.entrenched] as [number, number]])
      ),
      // sparse: only provinces that have actually changed hands since round 1
      heldSince: Object.fromEntries(
        this.territories.filter(t => t.heldSince > 1).map(t => [t.slug, t.heldSince])
      ),
      raidedOn: Object.fromEntries(this.territories.filter(t => t.raidedOn > 0).map(t => [t.slug, t.raidedOn])),
      factions: Object.fromEntries(
        this.factions.map(f => [f.name, { hand: [...f.hand], grudges: [...f.grudges], peaceBroken: f.peaceBroken }])
      ),
      log: this.log.map(e => ({ ...e }))
    }
  }

  restore(s: GameSnapshot) {
    if (!s || s.v !== SAVE_VERSION) throw new Error('incompatible save')
    const byName = new Map(this.factions.map(f => [f.name, f]))
    this.factions.forEach(f => {
      f.territories = []
    })
    for (const t of this.territories) {
      const rec = s.territories[t.slug]
      const owner = rec && byName.get(rec.faction)
      if (!owner) throw new Error(`save is missing territory ${t.slug}`)
      t.faction = owner
      t.troops = rec.troops
      const dug = s.entrench && s.entrench[t.slug]
      t.quietTurns = dug ? dug[0] : 0
      t.entrenched = dug ? dug[1] : 0
      // pre-heldSince saves: treat everything as long-settled rather than
      // handing out swift-recapture bonuses the original game never granted
      t.heldSince = s.heldSince?.[t.slug] ?? 1
      t.raidedOn = s.raidedOn?.[t.slug] ?? 0
      owner.territories.push(t)
    }
    for (const f of this.factions) {
      const rec = s.factions[f.name]
      if (!rec) continue
      f.hand = [...rec.hand]
      f.grudges = new Set(rec.grudges)
      f.peaceBroken = rec.peaceBroken
    }
    this.round = s.round
    this.phase = s.phase
    this.currentPlayerIndex = s.currentPlayerIndex
    this.reinforcementsLeft = s.reinforcementsLeft
    this.fortifiesUsed = s.fortifiesUsed
    this.conqueredThisTurn = s.conqueredThisTurn
    this.liberatedThisTurn = s.liberatedThisTurn ?? false
    this.tradeCount = s.tradeCount
    this.humanDefeated = s.humanDefeated
    this.winner = s.winner ? (byName.get(s.winner) ?? null) : null
    // v1 saves recorded announced events by round number; map those forward to
    // textKeys so a loaded game doesn't replay news it has already shown
    this.announcedEvents = new Set(
      s.announcedEvents.flatMap(entry =>
        typeof entry === 'number'
          ? HISTORICAL_EVENTS.filter(e => e.round === entry).map(e => e.textKey)
          : [entry]
      )
    )
    this.requisitionUntil = s.requisitionUntil ?? 0
    this.sevresRound = s.sevresRound ?? 0
    this.sakaryaRound = s.sakaryaRound ?? 0
    this.karsTreatySigned = s.karsTreatySigned ?? false
    this.pactHeldTurns = s.pactHeldTurns ?? 0
    this.rejectedAt = s.rejectedAt ?? 0
    this.landedOn = [...(s.landedOn ?? [])]
    // pre-flag saves: infer from the calendar so a loaded game keeps its economy
    this.assemblyOpened = s.assemblyOpened ?? s.round >= TBMM_ROUND
    this.assemblyEverOpened = s.assemblyEverOpened ?? this.assemblyOpened
    this.assemblySeatTurns = s.assemblySeatTurns ?? 0
    this.gateRetries = { ...(s.gateRetries ?? {}) }
    this.gateCheckedOn = { ...(s.gateCheckedOn ?? {}) }
    this.britainStoodDown = s.britainStoodDown ?? false
    this.greeceCollapsed = s.greeceCollapsed ?? false
    this.venizelosFell = s.venizelosFell ?? false
    this.fortifyBonus = s.fortifyBonus ?? 0
    this.convoys = (s.convoys ?? []).map(c => ({ ...c }))
    this.pendingCards = [...(s.pendingCards ?? [])]
    this.pendingDecision = s.pendingDecision
      ? (HISTORICAL_EVENTS.find(e => e.textKey === s.pendingDecision) ?? null)
      : null
    this.pendingAdvance = s.pendingAdvance ? { ...s.pendingAdvance } : null
    this.grantsTaken = new Set(s.grantsTaken)
    this.withdrawalsDone = new Set(s.withdrawalsDone ?? [])
    this.log = s.log.map(e => ({ ...e }))
  }

  checkGameEnd() {
    const turkey = this.humanPlayer.faction
    if (turkey.eliminated) {
      this.humanDefeated = true
      this.phase = 'gameover'
      this.endedRound = this.round
      this.record(null, t('log.turkeyFallen'))
      return
    }
    // Completing the Pact no longer ends the war by itself — it has to be HELD,
    // and the peace is signed at the conference (see conferenceUpkeep). But a
    // map with no enemy left on it has nothing further to decide.
    if (this.totalConquest) {
      this.winner = turkey
      this.phase = 'gameover'
      this.endedRound = this.round
      this.record(turkey, t('log.victory', { date: tDateLoc(this.date) }))
    }
  }

  // Every ending in one place. Returns the copy keys and their fill-ins so the
  // overlay never has to re-derive which of the five outcomes happened.
  get outcome(): { titleKey: string; bodyKey: string; vars: Record<string, string | number> } | null {
    if (this.phase !== 'gameover') return null
    const turkey = this.humanPlayer.faction
    const date = tDateLoc(this.dateAt(this.endedRound || this.round))
    // Mutlak Zafer is total domination: nothing on the map that is not yours.
    if (this.winner && this.totalConquest)
      return { titleKey: 'overlay.total.title', bodyKey: 'overlay.total.body', vars: { date } }
    if (this.winner) {
      // Between the border met and the map taken sits the war that went past
      // the Pact without swallowing everything — it names what it annexed,
      // because those provinces are what Ankara carries to Lausanne.
      const beyond = turkey.territories.filter(t => !NATIONAL_PACT.includes(t.slug))
      if (beyond.length)
        return {
          titleKey: 'overlay.beyond.title',
          bodyKey: 'overlay.beyond.body',
          vars: { date, named: tList(beyond.map(t => tTerritory(t.slug, t.name))) }
        }
      return { titleKey: 'overlay.victory.title', bodyKey: 'overlay.victory.body', vars: { date } }
    }
    if (turkey.eliminated) return { titleKey: 'overlay.defeat.title', bodyKey: 'overlay.defeat.body', vars: { date } }
    // ran out of time at Lausanne: graded by how much of the Pact was recovered
    const held = this.pactProgress
    const missing = NATIONAL_PACT.filter(slug => this.bySlug[slug].faction !== turkey)
    const named = missing.slice(0, 3).map(slug => tTerritory(slug, this.bySlug[slug].name)).join(', ')
    const tier = held >= NATIONAL_PACT.length - 3 ? 'near' : held >= NATIONAL_PACT.length / 2 ? 'partial' : 'poor'
    return {
      titleKey: `overlay.lausanne.${tier}.title`,
      bodyKey: `overlay.lausanne.${tier}.body`,
      vars: { date, held, total: NATIONAL_PACT.length, missing: missing.length, named }
    }
  }
}
