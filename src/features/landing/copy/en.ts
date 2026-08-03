export const en = {
  document: {
    title: 'Independence — A strategy game of the Turkish War of Independence',
    description:
      'Command the Turkish resistance in a grand strategy campaign where real events, real borders, and seven trained factions decide the War of Independence.',
  },
  hero: {
    dateline: '19 May 1919 · Samsun',
    title: 'Independence',
    tagline: 'A nation under occupation. Independence to be won.',
    cta: 'Go to the game',
    meta: 'A strategy game of the Turkish War of Independence',
    alt: 'The SS Bandırma steaming across a dark sea, dawn breaking on the horizon',
  },
  stops: [
    { id: 'top', label: 'The voyage' },
    { id: 'story', label: 'The situation' },
    { id: 'moments', label: 'The war' },
    { id: 'board', label: 'The board' },
    { id: 'history', label: 'The rules' },
    { id: 'cards', label: 'The cards' },
    { id: 'factions', label: 'The opposition' },
    { id: 'soundtrack', label: 'The score' },
  ],
  story: {
    kicker: 'Chapter I · The situation',
    title: ['The fleets are in every harbor.', 'The armies are dissolved.'],
    copy: 'The Great War is over, and every nation at the table is pursuing its own aims. Fleets anchor in the harbors, armies hold the rail lines, and borders are being redrawn in distant capitals. This is the map of May 1919, and it is where the game begins. You take the worst position on the board, Pasha, and everything after that is yours to decide.',
  },
  bosphorus: {
    label: 'The occupied Bosphorus, November 1918',
    alt: 'Allied battleships anchored on the Bosphorus before the İstanbul skyline',
    dateline: 'November 1918 · The Bosphorus',
    heading: 'Warships ride at anchor before the capital.',
    copy: 'The fleet that won the world war fills the strait, and every harbor answers to it. On paper, everything is settled.',
  },
  duty: {
    kicker: 'Chapter II · The duty',
    title: ['You will not stop', 'to weigh the odds.'],
    copy: 'You are an Ottoman pasha, sent to Samsun with an inspector’s orders: supervise the disarmament, keep the peace. You have other ideas. On 16 May 1919 a small steamship, the SS Bandırma, leaves İstanbul under the eyes of the fleet, and the road inland begins.',
  },
  deck: {
    label: 'Your view from the deck of the Bandırma',
    alt: 'The rain-slicked deck of an old steamer on a heavy sea at dusk, seen from where you stand',
    dateline: '17 May 1919 · Aboard the SS Bandırma',
    heading: 'Ahead lies Samsun, and a war nobody has declared yet.',
    copy: 'Three days of open water with no escort. At the far end wait scattered militias and a people who have not yet been asked. They will follow what works.',
  },
  route: {
    label: 'The route from İstanbul to the opening of the Assembly',
    stops: [
      { date: '16 May 1919', place: 'İstanbul', note: 'Departure' },
      { date: '19 May 1919', place: 'Samsun', note: 'Landing' },
      { date: '22 June 1919', place: 'Amasya', note: 'The circular' },
      { date: '23 July 1919', place: 'Erzurum', note: 'Regional congress' },
      { date: '4 September 1919', place: 'Sivas', note: 'National congress' },
      { date: '23 April 1920', place: 'Ankara', note: 'The Assembly opens' },
    ],
  },
  moments: {
    kicker: 'Chapter III · The war',
    title: ['The country is worn and destitute.', 'It will fight anyway.'],
    copy: 'What it has left, it hands to you. A congress needs its city. An army needs civilian supply. A defensive line needs time, and an offensive needs a force capable of surviving it.',
  },
  hands: {
    label: 'Through the commander’s eyes: a hand on the map, hands on the ship’s rail, compass and field glasses',
    alt: 'Three views through the commander’s eyes: a gloved hand on a map, hands gripping a ship’s rail over the sea, a compass and field glasses held open',
  },
  board: {
    kicker: 'The board · May 1919',
    title: ['You start where the movement started.'],
    copy: 'Sixteen provinces, most of them inland. Six other factions on the map, each with its own war aims — Greece in İzmir, Britain on the Straits, France in Cilicia, Italy in the southwest, Armenia in the east, Bulgaria across the Thracian border. Your aim is not the map: it is the Misak-ı Millî, the thirty provinces the last Ottoman parliament voted for.',
    chip: '⚑ Actual gameplay',
    caption: 'May 1919 · Round 1 — the historical starting position',
    alt: 'The Independence campaign board at the historical May 1919 starting position',
    objectiveLabel: 'Misak-ı Millî',
    objectiveValue: '16 / 30',
    objectiveBar: '16 of 30 National Pact provinces held',
    objectiveCopy: 'National Pact provinces held at the start. Victory is holding all thirty, and stopping there.',
  },
  rules: {
    kicker: 'The rules',
    title: ['The history is the mechanics.'],
    copy: 'Nothing here is flavour text bolted onto a Risk clone. The rules are arguments about what actually happened, and the historical constraints are the constraints you play against.',
  },
  cards: {
    kicker: 'Actual gameplay · The event deck',
    title: ['Turning points arrive as cards.'],
    copy: 'Twenty-eight dated events run from the congresses of 1919 to the treaties of the mid-twenties. Each arrives on the turn its real date falls in, and each changes something material. A few stop and ask you a question instead.',
  },
  factions: {
    kicker: 'The opposition',
    title: ['The AI is trained, not written.'],
    copy: 'Every faction is played by its own neural network, learned from self-play rather than from rules somebody typed out. Nobody told Britain to garrison the Straits or Italy to sit still. Each is paid for its own war aims, and what it does with them is its own business.',
    items: [
      {
        key: 'Turkey',
        name: 'Turkey',
        aim: 'Paid for the National Pact, thirty provinces from Edirne to Kars, and for nothing outside it.',
      },
      {
        key: 'Greece',
        name: 'Greece',
        aim: 'Holds İzmir and the Aegean coast, and pushes inland while its army can still afford to.',
      },
      {
        key: 'Britain',
        name: 'Britain',
        aim: 'Garrisons the Straits and the capital. Post-war demobilization means no fresh divisions for Anatolia.',
      },
      {
        key: 'France',
        name: 'France',
        aim: 'Wants Cilicia held cheaply, counts every casualty, and is quietly looking for the exit.',
      },
      {
        key: 'Italy',
        name: 'Italy',
        aim: 'Sits on the southwest concession. Historically it fought nobody, and the reward function agrees.',
      },
      {
        key: 'Armenia',
        name: 'Armenia',
        aim: 'Claims the eastern provinces; Kars and Iğdır begin under its administration, as they did in 1919.',
      },
      {
        key: 'Bulgaria',
        name: 'Bulgaria',
        aim: 'Its quarrel is with Greece, not Ankara, and the Treaty of Neuilly caps its army at two levies.',
      },
    ],
  },
  score: {
    kicker: 'Original game score',
    title: ['The campaign, in thirteen tracks.'],
    copy: 'Listen to the complete soundtrack in sequence, choose an individual chapter, or download any track directly.',
  },
  charge: {
    label: 'From the Address to Youth',
    lines: ['The strength you will need', 'is in the noble blood within your veins.'],
    sub: 'Mustafa Kemal Atatürk · Address to Youth, 1927',
  },
  final: {
    label: 'Begin the game',
    alt: 'A map of Anatolia spread across a campaign table',
  },
  footer: {
    brand: 'Independence',
    years: '1919 · 1923',
    tagline: 'A historical strategy game of the Turkish War of Independence.',
    links: [
      { href: '#story', label: 'Story' },
      { href: '#board', label: 'Board' },
      { href: '#history', label: 'Rules' },
      { href: '#cards', label: 'Cards' },
      { href: '#factions', label: 'Factions' },
      { href: '#soundtrack', label: 'Score' },
    ],
  },
  nav: { label: 'Page sections' },
}

export type LandingCopy = typeof en
