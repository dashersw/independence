import en from './i18n/en.json'
import tr from './i18n/tr.json'

// Minimal i18n: no framework dependency, works from both React (via useLang)
// and plain modules (game.ts imports t()/tFaction()/tTerritory() directly).
// Territory/faction/decor display names are looked up by their STABLE slug or
// English name — the underlying game data (Territory.name, Faction.name)
// never changes with language, only what's rendered from it does.

export type Lang = 'en' | 'tr'

const STORAGE_KEY = 'independence.lang'

const detectInitial = (): Lang => {
  try {
    const saved = typeof localStorage !== 'undefined' ? localStorage.getItem(STORAGE_KEY) : null
    if (saved === 'en' || saved === 'tr') return saved
  } catch {
    // localStorage unavailable (private mode etc.) — fall through to detection
  }
  if (typeof navigator !== 'undefined' && /^tr\b/i.test(navigator.language || '')) return 'tr'
  return 'en'
}

let lang: Lang = detectInitial()
const listeners = new Set<() => void>()

export const getLang = (): Lang => lang

export const setLang = (l: Lang) => {
  if (l === lang) return
  lang = l
  try {
    localStorage.setItem(STORAGE_KEY, l)
  } catch {
    // ignore — language just won't persist across reloads
  }
  // keeps CSS text-transform locale-correct: uppercasing "Takviye" only yields
  // "TAKVİYE" (dotted İ) when the document language is Turkish
  if (typeof document !== 'undefined') document.documentElement.lang = l
  listeners.forEach((fn) => fn())
}

/**
 * A list the way the language writes one: the last item joined by a word, not
 * a comma. "Halep ve Bağdat", not "Halep, Bağdat".
 */
export const tList = (items: string[]): string => {
  if (items.length < 2) return items[0] ?? ''
  const conjunction = lang === 'tr' ? 've' : 'and'
  return `${items.slice(0, -1).join(', ')} ${conjunction} ${items[items.length - 1]}`
}

export const onLangChange = (fn: () => void): (() => void) => {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

// ---- UI copy ----
export const TRANSLATIONS: Record<Lang, Record<string, string>> = { en, tr }

export const t = (key: string, vars?: Record<string, string | number>): string => {
  let s = TRANSLATIONS[lang][key] ?? TRANSLATIONS.en[key] ?? key
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

// ---- Turkish case suffixes ----
// Turkish agglutinates case endings onto proper nouns after an apostrophe, and
// the ending must obey vowel harmony (and take a buffer -y- after a vowel, or
// harden to -t- after a voiceless consonant). Hard-coding "'e"/"'ye" produced
// "Ermenistan'e", "Kars'ye" — wrong for every back-vowel name on the map.
const BACK = 'aıou'
const ROUNDED = 'ouöü'
const VOWELS = 'aeıioöuü'
const VOICELESS = 'fstkçşhp'

const lastVowel = (w: string): string => {
  for (let i = w.length - 1; i >= 0; i--)
    if (VOWELS.includes(w[i].toLocaleLowerCase('tr'))) return w[i].toLocaleLowerCase('tr')
  return 'e'
}

export type TrCase = 'dat' | 'acc' | 'loc' | 'abl'

// Suffix a Turkish proper noun: dative (-a/-e), accusative (-ı/-i/-u/-ü),
// locative (-da/-de/-ta/-te) or ablative (-dan/-den/-tan/-ten).
export const trSuffix = (word: string, kase: TrCase): string => {
  const v = lastVowel(word)
  const back = BACK.includes(v)
  const endsVowel = VOWELS.includes(word[word.length - 1].toLocaleLowerCase('tr'))
  const hard = VOICELESS.includes(word[word.length - 1].toLocaleLowerCase('tr'))
  if (kase === 'dat') return `${word}'${endsVowel ? 'y' : ''}${back ? 'a' : 'e'}`
  if (kase === 'acc') {
    const vowel = back ? (ROUNDED.includes(v) ? 'u' : 'ı') : ROUNDED.includes(v) ? 'ü' : 'i'
    return `${word}'${endsVowel ? 'y' : ''}${vowel}`
  }
  const d = hard ? 't' : 'd'
  const a = back ? 'a' : 'e'
  return kase === 'loc' ? `${word}'${d}${a}` : `${word}'${d}${a}n`
}

// language-aware: English needs no case marking, so the plain name comes back
export const tCase = (name: string, kase: TrCase): string => (lang === 'tr' ? trSuffix(name, kase) : name)

// A year takes its suffix from how it is SPOKEN, not from its final digit:
// 1921 is "…bir" so it takes 'de, but 1923 is "…üç" so it takes 'te.
const UNITS = ['sıfır', 'bir', 'iki', 'üç', 'dört', 'beş', 'altı', 'yedi', 'sekiz', 'dokuz']
const TENS = ['', 'on', 'yirmi', 'otuz', 'kırk', 'elli', 'altmış', 'yetmiş', 'seksen', 'doksan']

const yearWord = (year: number): string => {
  const unit = year % 10
  if (unit) return UNITS[unit]
  const ten = Math.floor(year / 10) % 10
  return ten ? TENS[ten] : 'yüz'
}

// "Ağustos 1921" -> "Ağustos 1921'de". English dates are returned unchanged so
// the same call site works in both languages ("in August 1921" reads from copy).
export const tDateLoc = (date: string): string => {
  if (lang !== 'tr') return date
  const year = parseInt(date.split(' ').pop() ?? '', 10)
  if (!year) return date
  const spoken = trSuffix(yearWord(year), 'loc')
  return date + spoken.slice(spoken.indexOf("'"))
}

// ---- faction display names (keyed by the STABLE English faction.name used
// throughout game logic — never translate the key itself) ----
const FACTION_TR: Record<string, string> = {
  Turkey: 'Türkiye',
  Greece: 'Yunanistan',
  Bulgaria: 'Bulgaristan',
  Armenia: 'Ermenistan',
  Italy: 'İtalya',
  Britain: 'İngiltere',
  France: 'Fransa',
  Iraq: 'Irak',
}
export const tFaction = (name: string): string => (lang === 'tr' ? (FACTION_TR[name] ?? name) : name)

// ---- territory display names (keyed by slug — the stable identifier used
// everywhere in game-data/geometry; Territory.name itself is untouched) ----
const TERRITORY_TR: Record<string, string> = {
  salonica: 'Selanik',
  kozani: 'Kozani',
  'western-thrace': 'Batı Trakya',
  lesbos: 'Midilli',
  rhodes: 'Rodos',
  sofia: 'Sofya',
  plovdiv: 'Filibe',
  burgas: 'Burgaz',
  gyumri: 'Gümrü',
  yerevan: 'Erivan',
  aleppo: 'Halep',
  mosul: 'Musul',
  baghdad: 'Bağdat',
}
export const tTerritory = (slug: string, fallback: string): string =>
  lang === 'tr' ? (TERRITORY_TR[slug] ?? fallback) : fallback

// ---- decorative sea/country labels (keyed by DECOR_DEFS slug) ----
const DECOR_TR: Record<string, string> = {
  'black-sea': 'Karadeniz',
  'mediterranean-sea': 'Akdeniz',
  'aegean-sea': 'Ege Denizi',
  russia: 'Rusya',
  georgia: 'Gürcistan',
  iran: 'İran',
  serbia: 'Sırbistan',
  romania: 'Romanya',
  cyprus: 'Kıbrıs',
  crete: 'Girit',
  greece: 'Yunanistan',
  macedonia: 'Makedonya',
  azerbaijan: 'Azerbaycan',
}
export const tDecor = (slug: string, fallback: string): string =>
  lang === 'tr' ? (DECOR_TR[slug] ?? fallback) : fallback
