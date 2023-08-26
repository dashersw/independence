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
  listeners.forEach(fn => fn())
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
const UI: Record<Lang, Record<string, string>> = {
  en: {
    'boot.subtitle': 'War of Independence · 1919',
    'brand.title': 'Independence',
    'intro.date': '19 May 1919 · Samsun',
    'intro.subtitle': 'A nation under occupation. Independence to be won.',
    'intro.begin': 'Begin the struggle',
    'intro.caption': 'A strategy game of the Turkish War of Independence',
    'hud.dateRound': '{date} · Round {round}',
    'tooltip.territory': '{name} — {faction}, {troops} units',
    'phase.reinforce': 'Reinforce',
    'phase.attack': 'Attack',
    'phase.fortify': 'Fortify',
    'phase.gameover': 'War Over',
    'phase.help.reinforce': 'Click your territories to deploy units.',
    'phase.help.attack': 'Pick your territory, then strike an adjacent enemy. Conquer at least one land to earn a card.',
    'phase.help.fortify': 'Move units between adjacent friendly lands, or end your turn.',
    'hud.advanceHelp': 'The province is taken. How many units march in? The rest hold the ground you attacked from.',
    'hud.left': 'left',
    'hud.moves': 'moves',
    'hud.pact': 'Misak-ı Millî',
    'hud.requisition': 'Tekâlif-i Milliye · {n} rounds',
    'hud.requisitionTitle': 'The first two exchanges of each homeland battle are rolled with 3 dice instead of 2 — at the cost of 3 reinforcements a turn and no militia growth.',
    'hud.trade': 'Trade +{n}',
    'hud.autoDeploy': 'Auto-deploy {n}',
    'hud.endAttacks': 'End attacks',
    'hud.endTurn': 'End turn',
    'hud.skipEndTurn': 'Skip & end turn',
    'hud.halfMax': '(half max)',
    'hud.half': 'Half',
    'hud.all': 'All {n}',
    'hud.aiThinking': '{faction} is on the move…',
    'hud.cardHandTitle': 'Conquer a territory to earn a card. 3 alike or one of each trades for units.',
    'hud.falls': '{territory} falls! −{atkLoss} / −{defLoss}',
    'hud.battleTally': '{from} {fromN} vs {to} {toN} · −{atkLoss} / −{defLoss}',
    'hud.press': 'Press attack',
    'hud.blitz': 'Blitz',
    'hud.pullBack': 'Pull back',
    'hud.repelled': 'Repelled at {territory} −{atkLoss} / −{defLoss}',
    'log.gameStart': 'The War of Independence begins. Reclaim the homeland, Pasha!',
    'log.tradeCards': '{faction} trades a card set for {bonus} extra units',
    'log.peaceBroken': '⚔️ {attacker} broke the peace — {defender} mobilizes for war again!',
    'log.knockedOut': '{faction} has been knocked out of the war!',
    'log.captured': '{attacker} captured {territory} from {defender} (lost {atkLoss}, killed {defLoss})',
    'log.repelled': '{attacker} attacked {territory} of {defender} and was repelled (lost {atkLoss}, killed {defLoss})',
    'log.italyConcedes': '🕊️ Italy evacuates the southwest without a fight — {territories} pass to Ankara.',
    'log.franceConcedes': '🕊️ Under the Ankara Agreement France withdraws from Cilicia — {territories} pass to Ankara.',
    'log.turkeyFallen': 'Turkey has fallen. The occupation is complete.',
    'log.victory': 'The borders of Misak-ı Millî are reached in {date} — the homeland is free. Victory!',
    'event.erzurumCongress':
      '📜 The Erzurum Congress (23 July 1919) — delegates of the eastern provinces declare that the nation will resist partition and accept no mandate. The east organizes: every eastern province Turkey holds raises militia.',
    'event.sivasCongress':
      '📜 The Sivas Congress (4 September 1919) — the regional defence-of-rights societies merge into one national movement under a single committee. Every province Turkey holds raises militia.',
    'event.tekalif':
      '⚖️ The National Tax Orders (August 1921) — the Greek advance is two marches from Ankara. The Assembly may requisition 40% of the nation\u2019s food, cloth, boots and transport to shoe and move the army for one decisive battle. It conscripts no one: for {n} rounds the first two exchanges of each battle in the homeland are pressed with 3 dice instead of 2 — a first-rate opening blow, not an endless one. But the countryside it strips is the same countryside the levy recruits from: while the orders stand, reinforcements fall by {cost} a turn and no province raises militia.',
    'event.tekalif.requisition.log': '⚖️ Tekâlif-i Milliye proclaimed — the nation is stripped to equip the army.',
    'event.tekalif.decline.log': '⚖️ The requisition is declined — the people are spared, and the army fights as it is.',
    'event.conference':
      '📜 The Conference of Lausanne convenes — the powers offer terms on the borders as they stand. You hold {held} of {total} National Pact provinces. Sign, and the war ends there. Refuse, and they will come back for the rest.',
    'event.conference.accept.log': '📜 Terms accepted at Lausanne — the war is over.',
    'event.conference.reject.log': '⚔️ Terms refused — the delegation walks out and the war goes on.',
    'log.termsRefused': '⚔️ Ankara refuses the terms. The powers will return in force.',
    'log.landing': '⚓ {faction} lands {n} units at {territory} and takes it.',
    'log.landingRepelled': '⚓ {faction} attempts a landing at {territory} with {n} units and is thrown back into the sea.',
    'log.landingUnopposed': '⚓ {faction} puts another {n} units ashore at {territory}, unopposed.',
    'log.embark': '⛵ {faction} embarks {n} units at {from} for {to}.',
    'tooltip.convoy': '{faction} — {troops} units at sea, bound for {to} ({rounds} rounds out)',
    'tooltip.convoyLast': '{faction} — {troops} units at sea, bound for {to} (ashore next round)',
    'log.convoyLanded': '⚓ {faction} lands {n} units at {territory}.',
    'log.convoyTurnedBack': '↩︎ The port was lost while they were at sea — {faction} puts its {n} units back ashore at {territory}.',
    'log.convoyLost': '☠︎ {faction} has no harbour left to land in: {n} units are lost at sea.',
    'event.lausanne':
      '📜 The Conference of Lausanne settles the peace — the borders as they now stand become the borders of the Republic. The war is over.',
    'log.assemblySuspended': '⚠️ The Assembly is driven from its seat — the government cannot sit, and everything that depends on it halts.',
    'log.assemblyReconvened': '📜 The Assembly reconvenes in {city} — the government sits again.',
    'log.tekalifWindow': 'The army is equipped and moving — 3 attack dice in the homeland until {until}',
    'log.lausanneShort': 'Lausanne settles with {held} of {total} National Pact provinces in Turkish hands. The rest stay lost.',
    'event.istanbulOccupied':
      '📜 The Allies occupy İstanbul (16 March 1920) — the capital is taken by force and the Ottoman parliament dissolved. The city passes to Britain, and the movement\u2019s centre of gravity shifts to Ankara for good (+1 card).',
    'event.sevres':
      '📜 The Treaty of Sèvres (10 August 1920) — the Porte signs away the partition of the country. The dictated peace guts recruitment for {n} rounds, and then hardens it: what was a resistance becomes a nation in arms (+1 reinforcements from then on).',
    'event.ethem':
      '⚔️ Çerkes Ethem\u2019s revolt (December 1920) — the Kuvâ-yi Seyyare irregulars turn on the regular army. Half the western provinces Turkey holds go over, chosen at random. Each loses half its garrison and everything it had dug in.',
    'event.inonu':
      '⚔️ İnönü (March 1921) — the line in front of Eskişehir holds and the Greek advance is thrown back. The Greek force before the city is broken, and Ankara wins its first recognition abroad (+1 card).',
    'event.sakarya':
      '⚔️ Sakarya (23 August – 13 September 1921) — twenty-two days and nights on the river, and the Greek advance ends for good. Greece cannot attack for {n} rounds and attacks with 2 dice for the rest of the war.',
    'event.greekOffensive':
      '⚔️ The Greek summer offensive (July 1921) — under the royalist government, months after Venizelos fell, the army drives east through Kütahya and Eskişehir toward the Sakarya, the deepest it ever reaches. The Greek front in Anatolia is reinforced and dug in.',
    'event.karsTreaty':
      '📜 The Treaty of Kars (13 October 1921) — the eastern border is fixed with the Soviet republics. The Caucasus front is shut: Armenia can no longer attack Kars, Iğdır, Erzurum, Van or Trabzon, and their garrisons are free to march west.',
    'event.mudanya':
      '📜 The Armistice of Mudanya (11 October 1922) — with the city encircled, Britain gives up İstanbul rather than fight for it. The capital returns without a shot, and the British garrison redeploys to what London still holds.',
    'log.ethemRevolt': 'The revolt costs {n} units and their entrenchments across {territories}',
    'log.greekOffensive': '⚔️ The summer offensive puts {n} units onto the Greek front and digs it in',
    'log.mudanyaRedeploy': 'The British garrison of {n} withdraws from İstanbul, redeployed across {territories} provinces',
    'event.lloydGeorge':
      '📜 Lloyd George falls (19 October 1922) — the Chanak crisis brings down the government that backed the Greek campaign, because Britain will not fight Turkey a second time. British forces will hold what they have and start nothing.',
    'event.sultanate':
      '📜 The Sultanate is abolished (1 November 1922) — there is no longer a rival government in occupied İstanbul. One authority, one command: Turkish forces gain an extra fortify move for the rest of the war.',
    'event.greekCollapse':
      '⚔️ The Greek army collapses — the officers revolt, the king abdicates, and the ministers who lost Anatolia are shot. Greece will field no new units for the rest of the war.',
    'event.mubadele':
      '📜 The Convention on the Exchange of Populations (30 January 1923) — the Aegean is resettled on both shores. Turkish provinces on the coast gain a unit; the Greek ones lose one.',
    'event.caliphate':
      '📜 The Caliphate is abolished (3 March 1924) — the last institution of the old order is gone and the Assembly answers to nobody above it (+1 card).',
    'event.mosulQuestion':
      '📜 The Mosul question (October 1924) — the League draws the Brussels line and Britain\u2019s Mesopotamian provinces pass to the new Kingdom of Iraq. Mosul goes with them unless Turkish troops are already standing in it.',
    'event.sheikhSaid':
      '⚔️ The Sheikh Said rebellion (13 February 1925) — the east rises, a year after the Caliphate was abolished. Every province Turkey holds in Diyarbakır, Elazığ, Erzurum and Van loses half its garrison and everything it had dug in.',
    'log.sheikhSaid': 'The rising costs {n} units and their entrenchments across {territories}',
    'log.mosulCeded': 'The League awards {territories} to the Kingdom of Iraq',
    'event.venizelos': '📜 Venizelos falls in the Greek elections — Allied support wanes. Greek reinforcements drop.',
    'event.alexandropol': '📜 Treaty of Alexandropol — Armenia sues for peace and fields no new units.',
    'event.italyWithdraws': '📜 Italy begins withdrawing from Anatolia — Italian deployments and offensives cease.',
    'event.ankaraAgreement': '📜 Ankara Agreement — France makes peace with Ankara and goes on the defensive.',
    'event.exhaustion': '📜 The occupation has become politically untenable — no power will send further reinforcements to Anatolia.',
    'event.tbmm': '📜 The Grand National Assembly opens in {city}, {date} — a government, a unified command and a national mandate: the movement can raise far more units from the land it holds.',
    'event.sovietAid1': '📜 The first Soviet gold and rifles land — Ankara can raise better-armed units.',
    'event.sovietAid2': '📜 Treaty of Moscow — a shipment of rifles, machine guns and artillery reaches the front (+5 units).',
    'event.greatOffensive': '⚔️ The Great Offensive — the army massed at Afyon breaks the Greek line. The regular army takes the field: Turkey attacks with 3 dice and defends the homeland with 3.',
    'overlay.victory.title': 'Zafer!',
    'overlay.victory.body':
      'The borders of Misak-ı Millî were reached in {date}. The occupying powers have been driven out and the Republic will be proclaimed. Long live the Republic!',
    'overlay.beyond.title': 'Victory, and More',
    'overlay.beyond.body':
      'You reached the aims of Misak-ı Millî in {date}, and annexed {named} on top of them. Ankara goes to Lausanne with the stronger hand. Long live the Republic!',
    'overlay.total.title': 'Absolute Victory!',
    'overlay.total.body':
      'You did not just free the homeland in {date}, you widened its borders. The Turkish flag flies everywhere on the map. There is nothing left to bargain over at Lausanne: only one side sits at the table. Long live the Republic!',
    'overlay.defeat.title': 'Defeat',
    'overlay.defeat.body':
      'Turkey was eliminated in {date}. The homeland remains under occupation, and there is no army left to contest it.',
    'overlay.lausanne.near.title': 'Peace, Just Short',
    'overlay.lausanne.near.body':
      'The conference settled in {date} with {held} of {total} provinces in Turkish hands. The Republic is founded and the occupation is over — but {named} stayed on the other side of the line, and the borders drawn here will not be redrawn.',
    'overlay.lausanne.partial.title': 'A Truncated Peace',
    'overlay.lausanne.partial.body':
      'The conference settled in {date} with {held} of {total} provinces recovered. A Turkish state survives and will be a republic, but {missing} of the provinces the National Pact claimed are signed away. The war is over; the map is not what was sworn.',
    'overlay.lausanne.poor.title': 'Peace on Their Terms',
    'overlay.lausanne.poor.body':
      'The conference settled in {date} with only {held} of {total} provinces held. The powers wrote the terms and Ankara signed them. A rump state remains — the homeland the National Pact described is gone.',
    'overlay.playAgain': 'Play again',
    'dialog.ok': 'OK',
    'dialog.cancel': 'Cancel',
    'card.dismiss': 'Continue',
    'card.choice.accept': 'Sign the treaty',
    'card.choice.reject': 'Fight on',
    'card.choice.requisition': 'Proclaim the orders',
    'card.choice.decline': 'Spare the people',
    'menu.title': 'Settings',
    'menu.language': 'Language',
    'menu.display': 'Display',
    'menu.fullscreen': 'Full screen',
    'menu.exitFullscreen': 'Leave full screen',
    'menu.installHint': 'Add this to your home screen and it opens without the browser bars.',
    'menu.saves': 'Saved games',
    'menu.saveCurrent': 'Save current game',
    'menu.noSaves': 'No saved games yet.',
    'menu.load': 'Load',
    'menu.delete': 'Delete',
    'menu.saveNamePrompt': 'Name this save',
    'menu.defaultSaveName': '{date} · {pact}/30',
    'menu.confirmLoad': 'Load this save? The current game will be lost.',
    'menu.confirmDelete': 'Delete this save?',
    'menu.saveFailed': 'Could not save — browser storage is full or unavailable.',
    'menu.loadFailed': 'Could not load that save.',
    'menu.savedRound': 'Round {round} · {date}',
    'lang.switcher.title': 'Language',
    'lang.en': 'English',
    'lang.tr': 'Türkçe',
    'trait.Turkey': 'Mobilization deepens in stages — territory ÷2 and a 25% exhaustion loss in 1919, ÷1.5 and 10% from the Assembly (Apr 1920), ÷1.25 and no loss from the Great Offensive (Aug 1922). Kuvâ-yi Milliye: +2 reinforcements, +3 once Soviet arms land (Sept 1920). Interior lines: 2 fortify moves. Invaders in the homeland roll at most 2 dice until the Great Offensive (Aug 1922). Until the Great Offensive (Aug 1922) Turkey attacks with 2 dice and defends the homeland with 2; from then it attacks and defends with 3. Invaders roll at most 2 against the homeland until then. Proclaiming Tekâlif-i Milliye (Aug 1921) opens a 3-round window in which the first two exchanges of each homeland battle use 3 dice, at −3 reinforcements a turn and no militia growth. Liberating a homeland province rallies local militia to it: before the offensive, +2 if it is retaken within a turn of falling and +1 once the occupiers have settled in, on every province freed. From the offensive onward only the first province freed each turn draws a garrison, and it draws +1.',
    'trait.Greece': 'Overseas supply: fortify moves at most half a garrison. Reinforcements drop after Nov 1920.',
    'trait.Britain': 'Demobilization: −2 reinforcements. Entente member.',
    'trait.France': 'Entente member. Makes peace after Oct 1921 (passive, half reinforcements).',
    'trait.Italy': 'Entente member. Withdraws after Jun 1921 (passive, no reinforcements).',
    'trait.Armenia': 'Entente-aligned. No reinforcements after Dec 1920.',
    'trait.Bulgaria': 'Neuilly arms cap: max 3 reinforcements. Neutral, but Greece is a rival.'
  },
  tr: {
    'boot.subtitle': 'Kurtuluş Savaşı · 1919',
    'brand.title': 'Kurtuluş',
    'intro.date': '19 Mayıs 1919 · Samsun',
    'intro.subtitle': 'İşgal edilen bir vatan. Kazanılacak bir istiklal.',
    'intro.begin': 'Mücadeleyi başlat',
    'intro.caption': 'Türk Kurtuluş Savaşı üzerine bir strateji oyunu',
    'hud.dateRound': '{date} · {round}. Tur',
    'tooltip.territory': '{name} — {faction}, {troops} birlik',
    'phase.reinforce': 'Takviye',
    'phase.attack': 'Saldırı',
    'phase.fortify': 'Tahkim',
    'phase.gameover': 'Savaş Bitti',
    'phase.help.reinforce': 'Birlik konuşlandırmak için topraklarınıza tıklayın.',
    'phase.help.attack': 'Toprağınızı seçin, ardından komşu bir düşmana saldırın. En az bir toprak fethederek kart kazanın.',
    'phase.help.fortify': 'Komşu dost topraklar arasında birlik taşıyın veya turunuzu bitirin.',
    'hud.advanceHelp': 'Bölge alındı. Kaç birlik içeri girsin? Kalanlar saldırdığın toprağı tutar.',
    'hud.left': 'kaldı',
    'hud.moves': 'hamle',
    'hud.pact': 'Misak-ı Millî',
    'hud.requisition': 'Tekâlif-i Milliye · {n} tur',
    'hud.requisitionTitle': 'Vatan topraklarındaki her muharebenin ilk iki hamlesi 2 yerine 3 zarla atılır — turda 3 takviye eksiği ve milis toplanamaması pahasına.',
    'hud.trade': '+{n} Takas',
    'hud.autoDeploy': 'Otomatik konuşlandır {n}',
    'hud.endAttacks': 'Saldırıları bitir',
    'hud.endTurn': 'Turu bitir',
    'hud.skipEndTurn': 'Geç & turu bitir',
    'hud.halfMax': '(yarısı)',
    'hud.half': 'Yarısı',
    'hud.all': 'Tümü {n}',
    'hud.aiThinking': '{faction} harekette…',
    'hud.cardHandTitle': 'Kart kazanmak için bir toprak fethedin. 3 aynı ya da her türden biri birlik ile takas edilir.',
    'hud.falls': '{territory} düştü! −{atkLoss} / −{defLoss}',
    'hud.battleTally': '{from} {fromN} — {to} {toN} · −{atkLoss} / −{defLoss}',
    'hud.press': 'Saldır',
    'hud.blitz': 'Sonuna kadar',
    'hud.pullBack': 'Geri çekil',
    'hud.repelled': '{territoryLoc} püskürtüldü −{atkLoss} / −{defLoss}',
    'log.gameStart': 'Kurtuluş Savaşı başlıyor. Vatanı kurtar, Paşam!',
    'log.tradeCards': '{faction} bir kart takımını {bonus} ek birlikle takas etti',
    'log.peaceBroken': '⚔️ {attacker} barışı bozdu — {defender} yeniden savaşa hazırlanıyor!',
    'log.knockedOut': '{faction} savaş dışı kaldı!',
    'log.captured': '{attacker}, {defender} kontrolündeki {territoryAcc} fethetti (kayıp {atkLoss}, düşman kaybı {defLoss})',
    'log.repelled': '{attacker}, {defender} kontrolündeki {territoryDat} saldırdı ve püskürtüldü (kayıp {atkLoss}, düşman kaybı {defLoss})',
    'log.italyConcedes': '🕊️ İtalya güneybatıyı çatışmasız boşaltıyor — {territories} Ankara\'ya geçti.',
    'log.franceConcedes': '🕊️ Ankara Antlaşması uyarınca Fransa Çukurova\'dan çekiliyor — {territories} Ankara\'ya geçti.',
    'log.turkeyFallen': 'Türkiye düştü. İşgal tamamlandı.',
    'log.victory': 'Misak-ı Millî sınırlarına {date} ulaşıldı — vatan özgür. Zafer!',
    'event.erzurumCongress':
      '📜 Erzurum Kongresi (23 Temmuz 1919) — doğu illerinin delegeleri milletin parçalanmaya direneceğini ve hiçbir mandayı kabul etmeyeceğini ilan etti. Doğu örgütleniyor: Türkiye\'nin elindeki her doğu ili milis topluyor.',
    'event.sivasCongress':
      '📜 Sivas Kongresi (4 Eylül 1919) — bölgesel Müdafaa-i Hukuk cemiyetleri tek bir heyet altında ulusal harekete dönüştü. Türkiye\'nin elindeki her il milis topluyor.',
    'event.tekalif':
      '⚖️ Tekâlif-i Milliye Emirleri (Ağustos 1921) — Yunan ordusu Ankara\'ya iki konak uzakta. Meclis, orduyu tek bir meydan muharebesine hazırlamak için milletin yiyeceğinin, kumaşının, çarığının ve nakil vasıtalarının %40\'ına el koyabilir. Kimseyi askere almaz: {n} tur boyunca vatan topraklarındaki her muharebenin ilk iki hamlesi 2 yerine 3 zarla yapılır — tam güçlü bir açılış darbesi, fazlası değil. Ama el konulan topraklar, birliğin toplandığı topraklardır: emirler yürürlükteyken takviye turda {cost} azalır ve hiçbir il milis toplayamaz.',
    'event.tekalif.requisition.log': '⚖️ Tekâlif-i Milliye ilan edildi — ordu donatılsın diye millet son verdiğini veriyor.',
    'event.tekalif.decline.log': '⚖️ Emirler çıkarılmadı — millet esirgendi, ordu elindekiyle savaşacak.',
    'event.conference':
      '📜 Lozan Konferansı toplandı — düvel-i muazzama bugünkü sınırlar üzerinden şartlarını sunuyor. Misak-ı Millî illerinin {total} tanesinden {held} tanesi elinde. İmzalarsan savaş burada biter. Reddedersen gerisi için geri gelirler.',
    'event.conference.accept.log': '📜 Lozan\u2019da şartlar kabul edildi — savaş bitti.',
    'event.conference.reject.log': '⚔️ Şartlar reddedildi — heyet masadan kalktı, savaş sürüyor.',
    'log.termsRefused': '⚔️ Ankara şartları reddetti. Düvel-i muazzama kuvvetle geri dönecek.',
    'log.landing': '⚓ {faction} {territory} kıyısına {n} birlik çıkardı ve orayı aldı.',
    'log.landingRepelled': '⚓ {faction} {territory} kıyısına {n} birlikle çıkarma denedi ve denize döküldü.',
    'log.landingUnopposed': '⚓ {faction} {territory} kıyısına {n} birlik daha çıkardı; karşılarında kimse yoktu.',
    'log.embark': '⛵ {faction} {from} limanında {n} birliği gemiye bindirdi; rotaları {to}.',
    'tooltip.convoy': '{faction} — denizde {troops} birlik, {to} yolunda ({rounds} tur kaldı)',
    'tooltip.convoyLast': '{faction} — denizde {troops} birlik, {to} yolunda (gelecek tur karaya çıkıyor)',
    'log.convoyLanded': '⚓ {faction} {territory} kıyısına {n} birlik çıkardı.',
    'log.convoyTurnedBack': '↩︎ Onlar denizdeyken liman elden çıktı; {faction} {n} birliği {territory} kıyısına geri çıkardı.',
    'log.convoyLost': '☠︎ {faction} için karaya çıkacak liman kalmadı: {n} birlik denizde kayboldu.',
    'event.lausanne':
      '📜 Lozan Konferansı barışı bağladı — bugünkü sınırlar Cumhuriyet\'in sınırları oldu. Savaş bitti.',
    'log.assemblySuspended': '⚠️ Meclis makamından sürüldü — hükümet toplanamıyor, ona bağlı olan her şey duruyor.',
    'log.assemblyReconvened': '📜 Meclis {city} yeniden toplandı — hükümet yine iş başında.',
    'log.tekalifWindow': 'Ordu donatıldı ve hareket halinde — {until} tarihine kadar vatan topraklarında 3 saldırı zarı',
    'log.lausanneShort': 'Lozan, {total} Misak-ı Millî ilinin {held} tanesi Türk elindeyken bağlandı. Gerisi kayıp.',
    'event.istanbulOccupied':
      '📜 İstanbul\u2019un işgali (16 Mart 1920) — başkent zorla alındı, Meclis-i Mebusan dağıtıldı. Şehir İngiltere\u2019ye geçiyor ve hareketin ağırlık merkezi temelli Ankara\u2019ya kayıyor (+1 kart).',
    'event.sevres':
      '📜 Sevr Antlaşması (10 Ağustos 1920) — Bâbıâli ülkenin paylaşılmasına imza attı. Dayatılan barış {n} tur boyunca askere yazılmayı çökertiyor, sonra sertleştiriyor: direniş, silahlı bir millete dönüşüyor (o tarihten sonra +1 takviye).',
    'event.ethem':
      '⚔️ Çerkes Ethem İsyanı (Aralık 1920) — Kuvâ-yi Seyyare düzenli orduya karşı ayaklandı. Türkiye\u2019nin elindeki batı illerinin rastgele yarısı ayaklanıyor; her biri garnizonunun yarısını ve kazdığı bütün siperleri kaybediyor.',
    'event.inonu':
      '⚔️ İnönü (Mart 1921) — Eskişehir önündeki hat tutuyor ve Yunan ilerleyişi geri püskürtülüyor. Şehrin önündeki Yunan kuvveti kırılıyor, Ankara dışarıda ilk tanınmasını kazanıyor (+1 kart).',
    'event.sakarya':
      '⚔️ Sakarya (23 Ağustos – 13 Eylül 1921) — nehir boyunda yirmi iki gün yirmi iki gece, ve Yunan ilerleyişi temelli bitiyor. Yunanistan {n} tur saldıramıyor ve savaşın sonuna kadar 2 zarla saldırıyor.',
    'event.greekOffensive':
      '⚔️ Yunan Yaz Taarruzu (Temmuz 1921) — Venizelos düştükten aylar sonra, kralcı hükümet altında ordu Kütahya ve Eskişehir üzerinden Sakarya’ya doğru en derin noktasına ilerliyor. Yunan’ın Anadolu cephesi takviye ediliyor ve siperleniyor.',
    'event.karsTreaty':
      '📜 Kars Antlaşması (13 Ekim 1921) — Sovyet cumhuriyetleriyle doğu sınırı çizildi. Kafkas cephesi kapandı: Ermenistan artık Kars, Iğdır, Erzurum, Van ve Trabzon\u2019a saldıramaz, oradaki birlikler batıya yürüyebilir.',
    'event.mudanya':
      '📜 Mudanya Mütarekesi (11 Ekim 1922) — şehir kuşatılmışken İngiltere İstanbul için savaşmak yerine onu bırakıyor. Başkent tek kurşun atılmadan geri dönüyor, İngiliz garnizonu Londra\u2019nın elinde kalan yerlere dağılıyor.',
    'log.ethemRevolt': 'İsyan {territories} illerinde {n} birliğe ve siperlerine mal oldu',
    'log.greekOffensive': '⚔️ Yaz taarruzu Yunan cephesine {n} birlik yığıyor ve siperlendiriyor',
    'log.mudanyaRedeploy': '{n} kişilik İngiliz garnizonu İstanbul\u2019dan çekildi, {territories} ile dağıtıldı',
    'event.lloydGeorge':
      '📜 Lloyd George düştü (19 Ekim 1922) — Çanak buhranı, Yunan seferini destekleyen hükümeti devirdi; çünkü İngiltere Türkiye ile ikinci kez savaşmayacak. İngiliz kuvvetleri ellerindekini tutacak, hiçbir şey başlatmayacak.',
    'event.sultanate':
      '📜 Saltanat kaldırıldı (1 Kasım 1922) — işgal altındaki İstanbul\u2019da artık rakip bir hükümet yok. Tek otorite, tek komuta: Türk kuvvetleri savaşın sonuna kadar fazladan bir tahkim hamlesi kazanıyor.',
    'event.greekCollapse':
      '⚔️ Yunan ordusu çöktü — subaylar ayaklandı, kral tahtı bıraktı, Anadolu\u2019yu kaybeden nazırlar kurşuna dizildi. Yunanistan savaşın sonuna kadar yeni birlik çıkaramayacak.',
    'event.mubadele':
      '📜 Mübadele Sözleşmesi (30 Ocak 1923) — Ege\u2019nin iki yakası da yeniden iskân ediliyor. Kıyıdaki Türk illeri bir birlik kazanıyor, Yunan illeri bir birlik kaybediyor.',
    'event.caliphate':
      '📜 Halifelik kaldırıldı (3 Mart 1924) — eski düzenin son kurumu da gitti; Meclis\u2019in üstünde kimse kalmadı (+1 kart).',
    'event.mosulQuestion':
      '📜 Musul meselesi (Ekim 1924) — Cemiyet-i Akvam Brüksel hattını çizdi ve İngiltere\u2019nin Mezopotamya vilayetleri yeni Irak Krallığı\u2019na geçti. Musul\u2019da Türk birlikleri durmuyorsa o da onlarla gidiyor.',
    'event.sheikhSaid':
      '⚔️ Şeyh Said İsyanı (13 Şubat 1925) — halifeliğin kaldırılmasından bir yıl sonra doğu ayaklandı. Türkiye\u2019nin elindeki Diyarbakır, Elazığ, Erzurum ve Van illerinin her biri garnizonunun yarısını ve kazdığı bütün siperleri kaybediyor.',
    'log.sheikhSaid': 'İsyan {territories} illerinde {n} birliğe ve siperlerine mal oldu',
    'log.mosulCeded': 'Cemiyet-i Akvam {territories} vilayetini Irak Krallığı\u2019na verdi',
    'event.venizelos': '📜 Venizelos, Yunan seçimlerinde düşüyor — Müttefik desteği azalıyor. Yunan takviyeleri düşüyor.',
    'event.alexandropol': '📜 Aleksandropol Antlaşması — Ermenistan barış istiyor ve yeni birlik çıkarmıyor.',
    'event.italyWithdraws': '📜 İtalya, Anadolu\'dan çekilmeye başlıyor — İtalyan konuşlanmaları ve saldırıları duruyor.',
    'event.ankaraAgreement': '📜 Ankara Antlaşması — Fransa, Ankara ile barış yapıyor ve savunmaya geçiyor.',
    'event.exhaustion': '📜 İşgal siyasi olarak sürdürülemez hale geldi — hiçbir güç Anadolu\'ya takviye göndermeyecek.',
    'event.tbmm': '📜 Büyük Millet Meclisi {date} {city} açıldı — hükümet, tek elden komuta ve millî yetki: hareket elindeki topraklardan çok daha fazla birlik toplayabiliyor.',
    'event.sovietAid1': '📜 İlk Sovyet altını ve tüfekleri ulaştı — Ankara daha iyi teçhiz edilmiş birlik toplayabiliyor.',
    'event.sovietAid2': '📜 Moskova Antlaşması — cepheye tüfek, makineli tüfek ve top sevkiyatı ulaştı (+5 birlik).',
    'event.greatOffensive': '⚔️ Büyük Taarruz — Afyon\'da toplanan ordu Yunan hattını yarıyor. Düzenli ordu sahada: Türkiye 3 zarla saldırıyor ve vatanı 3 zarla savunuyor.',
    'overlay.victory.title': 'Zafer!',
    'overlay.victory.body':
      'Misak-ı Millî sınırlarına {date} ulaşıldı. İşgal güçleri vatandan sürüldü ve Cumhuriyet ilan edilecek. Yaşasın Cumhuriyet!',
    'overlay.beyond.title': 'Zafer ve Fazlası!',
    'overlay.beyond.body':
      'Misak-ı Millî hedeflerine {date} ulaştın. Vatana ayrıca {named} bölgelerini de kattın. Lozan’da elin artık daha güçlü. Yaşasın Cumhuriyet!',
    'overlay.total.title': 'Mutlak Zafer!',
    'overlay.total.body':
      'Vatanı {date} kurtarmakla kalmadın, sınırlarını genişlettin. Haritada her yerde Türk bayrağı dalgalanıyor. Lozan’da pazarlık edecek bir şey kalmadı: masada tek taraf var. Yaşasın Cumhuriyet!',
    'overlay.defeat.title': 'Yenilgi',
    'overlay.defeat.body':
      'Türkiye {date} yenildi. Vatan işgal altında kalıyor ve onu geri alacak ordu kalmadı.',
    'overlay.lausanne.near.title': 'Ucundan Kaçan Barış',
    'overlay.lausanne.near.body':
      'Konferans {date} bağlandı; {total} ilin {held} tanesi Türk elinde. Cumhuriyet kuruluyor ve işgal bitiyor — ama {named} sınırın öte yanında kaldı ve burada çizilen hat bir daha çizilmeyecek.',
    'overlay.lausanne.partial.title': 'Yarım Kalan Barış',
    'overlay.lausanne.partial.body':
      'Konferans {date} bağlandı; {total} ilin {held} tanesi kurtarıldı. Bir Türk devleti ayakta ve cumhuriyet olacak, ama Misak-ı Millî’nin öngördüğü illerin {missing} tanesi masada verildi. Savaş bitti; Misak-ı Millî kâğıt üstünde kaldı.',
    'overlay.lausanne.poor.title': 'Onların Şartlarıyla Barış',
    'overlay.lausanne.poor.body':
      'Konferans {date} bağlandı; {total} ilin yalnızca {held} tanesi elde kaldı. Şartları düvel-i muazzama yazdı, Ankara imzaladı. Geriye güçsüz bir ülke kaldı — Misak-ı Millî’nin tarif ettiği vatan yok.',
    'overlay.playAgain': 'Tekrar oyna',
    'dialog.ok': 'Tamam',
    'dialog.cancel': 'Vazgeç',
    'card.dismiss': 'Devam',
    'card.choice.accept': 'Antlaşmayı imzala',
    'card.choice.reject': 'Savaşa devam et',
    'card.choice.requisition': 'Emirleri ilan et',
    'card.choice.decline': 'Milleti esirge',
    'menu.title': 'Ayarlar',
    'menu.language': 'Dil',
    'menu.display': 'Görünüm',
    'menu.fullscreen': 'Tam ekran',
    'menu.exitFullscreen': 'Tam ekrandan çık',
    'menu.installHint': 'Ana ekrana ekle; tarayıcı çubukları olmadan açılır.',
    'menu.saves': 'Kayıtlı oyunlar',
    'menu.saveCurrent': 'Oyunu kaydet',
    'menu.noSaves': 'Henüz kayıtlı oyun yok.',
    'menu.load': 'Yükle',
    'menu.delete': 'Sil',
    'menu.saveNamePrompt': 'Kayda bir ad verin',
    'menu.defaultSaveName': '{date} · {pact}/30',
    'menu.confirmLoad': 'Bu kayıt yüklensin mi? Mevcut oyun kaybolacak.',
    'menu.confirmDelete': 'Bu kayıt silinsin mi?',
    'menu.saveFailed': 'Kaydedilemedi — tarayıcı depolaması dolu veya kullanılamıyor.',
    'menu.loadFailed': 'Bu kayıt yüklenemedi.',
    'menu.savedRound': '{round}. tur · {date}',
    'lang.switcher.title': 'Dil',
    'lang.en': 'English',
    'lang.tr': 'Türkçe',
    'trait.Turkey': 'Seferberlik aşamalı derinleşir — 1919\'da toprak ÷2 ve %25 yıpranma kaybı, Meclis\'ten sonra (Nisan 1920) ÷1.5 ve %10, Büyük Taarruz\'dan sonra (Ağustos 1922) ÷1.25 ve kayıp yok. Kuvâ-yi Milliye: +2 takviye, Sovyet silahlarından sonra +3 (Eylül 1920). İç hatlar: 2 tahkim hamlesi. Vatan topraklarındaki işgalciler Büyük Taarruz\'a kadar (Ağustos 1922) en fazla 2 zar atar. Büyük Taarruz\'a kadar (Ağustos 1922) Türkiye 2 zarla saldırır ve vatanı 2 zarla savunur; sonrasında hem saldırı hem savunma 3 zar. İşgalciler o tarihe dek vatan topraklarına en fazla 2 zarla saldırır. Tekâlif-i Milliye ilan edilirse (Ağustos 1921) 3 tur boyunca vatan topraklarındaki her muharebenin ilk iki hamlesi 3 zarla atılır; bu süre boyunca turda 3 takviye eksilir ve milis toplanmaz. Kurtarılan vatan toprağına yerel milis katılır: Taarruz\'dan önce, kurtarılan her ile, düştükten sonraki bir tur içinde geri alınırsa +2, işgalci yerleştikten sonra +1. Taarruz\'dan itibaren yalnızca turda kurtarılan ilk il garnizon alır, o da +1.',
    'trait.Greece': 'Deniz aşırı ikmal: tahkim hamlesi en fazla yarım garnizon. Kasım 1920 sonrası takviyeler düşer.',
    'trait.Britain': 'Terhis: −2 takviye. İtilaf üyesi.',
    'trait.France': 'İtilaf üyesi. Ekim 1921 sonrası barış yapar (pasif, yarım takviye).',
    'trait.Italy': 'İtilaf üyesi. Haziran 1921 sonrası çekilir (pasif, takviye yok).',
    'trait.Armenia': 'İtilaf yanlısı. Aralık 1920 sonrası takviye yok.',
    'trait.Bulgaria': 'Neuilly silah sınırı: en fazla 3 takviye. Tarafsız, ama Yunanistan rakip.'
  }
}

export const t = (key: string, vars?: Record<string, string | number>): string => {
  let s = UI[lang][key] ?? UI.en[key] ?? key
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
  for (let i = w.length - 1; i >= 0; i--) if (VOWELS.includes(w[i].toLocaleLowerCase('tr'))) return w[i].toLocaleLowerCase('tr')
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
  Iraq: 'Irak'
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
  baghdad: 'Bağdat'
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
  azerbaijan: 'Azerbaycan'
}
export const tDecor = (slug: string, fallback: string): string => (lang === 'tr' ? (DECOR_TR[slug] ?? fallback) : fallback)
