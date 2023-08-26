import { NATIONAL_PACT } from '../../game/campaign-data'
import factionData from '../../game/factions.json'

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
  Turkey: NATIONAL_PACT,
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
    'western-thrace',
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
  Turkey: [],
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
  factionData.factions.map((f) => [f.name, f.territories.map((t) => t.slug)]),
)
