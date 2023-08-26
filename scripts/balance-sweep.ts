// A fast read on what the RULES do, before spending an hour training models.
//
//   npm run sweep -- --games 2000
//
// Training measures the equilibrium a set of rules settles into, which is the
// number that matters — and costs an hour per answer. This plays the same
// campaign with the engine's own heuristics and no models at all, so a rule
// change can be checked in the time it takes to read the diff.
//
// What it can tell you: whether Bulgaria still walks into an empty Salonica,
// whether an occupier can still concentrate faster than Turkey, whether a lane
// is ever used, whether an ending has become unreachable. What it cannot tell
// you: where trained play ends up. Models adapt to a rule and heuristics do not,
// so treat a sweep as a smoke test for structure, never as a forecast.
import Game, { NATIONAL_PACT } from '../src/game/game'
import { HOME } from '../src/ai/rewards'

const FACTIONS = ['Turkey', 'Greece', 'Britain', 'France', 'Italy', 'Armenia', 'Bulgaria']
const WATCH = ['salonica', 'kozani', 'western-thrace', 'izmir', 'istanbul', 'ankara', 'edirne']

const arg = (name: string, fallback: number) => {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1 || i === process.argv.length - 1) return fallback
  const n = Number(process.argv[i + 1])
  return Number.isFinite(n) ? n : fallback
}
const GAMES = arg('games', 2000)
const MIN_EDGE = arg('edge', 3)
const MAX_ATTACKS = arg('attacks', 8)

const LABEL: Record<string, string> = {
  'overlay.total.title': 'the whole map',
  'overlay.beyond.title': 'victory and more',
  'overlay.victory.title': 'victory',
  'overlay.lausanne.near.title': 'near miss',
  'overlay.lausanne.partial.title': 'truncated peace',
  'overlay.lausanne.poor.title': 'their terms',
  'overlay.defeat.title': 'Turkey destroyed'
}

// Turkey sits in the human seat, where the engine's own AI hooks refuse to
// play. This is the same shape of heuristic they use — take the best edge you
// have, stop when there is none worth taking — written out here rather than
// reached into, so the seat the player occupies is driven by something visible.
const playTurkey = (game: Game) => {
  game.autoPlaceReinforcements()
  if (game.phase === 'reinforce') game.endPhase()
  const faction = game.currentPlayer.faction
  for (let n = 0; n < MAX_ATTACKS && game.phase === 'attack'; n++) {
    let best: { from: string; to: string; edge: number } | null = null
    for (const from of faction.territories) {
      if (from.troops < 3) continue
      for (const slug of game.attackTargets(from.slug)) {
        const edge = from.troops - game.bySlug[slug].troops
        if (edge >= MIN_EDGE && (!best || edge > best.edge)) best = { from: from.slug, to: slug, edge }
      }
    }
    if (!best) break
    game.attack(best.from, best.to)
    if (game.pendingAdvance) game.advance(game.pendingAdvance.max)
  }
  if (game.phase === 'attack') game.endPhase()
  // reinforce the most threatened border out of the fattest interior province
  if (game.phase === 'fortify') {
    const interior = faction.territories
      .filter(t => t.troops > 1 && t.adjacent.every(a => a.faction === faction))
      .sort((a, b) => b.troops - a.troops)[0]
    if (interior) {
      const border = interior.adjacent
        .filter(t => t.faction === faction)
        .sort((a, b) => game.threatOf(b) - game.threatOf(a))[0]
      if (border) game.fortify(interior.slug, border.slug, game.movable(interior))
    }
    game.endPhase()
  }
}

const endings: Record<string, number> = {}
const holder: Record<string, Record<string, number>> = Object.fromEntries(WATCH.map(s => [s, {}]))
const size: Record<string, number> = Object.fromEntries(FACTIONS.map(n => [n, 0]))
const homeKept: Record<string, number> = Object.fromEntries(FACTIONS.map(n => [n, 0]))
const alive: Record<string, number> = Object.fromEntries(FACTIONS.map(n => [n, 0]))
let pact = 0
let rounds = 0
let crossings = 0
let unfinished = 0

const started = Date.now()
for (let n = 0; n < GAMES; n++) {
  const game = new Game()
  let guard = 0
  while (game.phase !== 'gameover' && game.round <= 28 && guard++ < 4000) {
    if (game.pendingDecision) {
      const q = game.pendingDecision
      game.resolveDecision(
        q.textKey === 'event.conference' ? 'accept' : q.choices?.some(c => c.key === 'requisition') ? 'requisition' : 'decline'
      )
    }
    game.clearEventCards()
    if (game.phase === 'gameover') break
    const afloat = game.convoys.length
    if (game.currentPlayer.isHuman) playTurkey(game)
    else {
      game.aiBeginTurn()
      let steps = 0
      while (game.aiAttackStep() && steps++ < 20) {
        /* one attack per step, as the UI paces them */
      }
      game.aiFinishTurn()
    }
    if (game.convoys.length > afloat) crossings += game.convoys.length - afloat
  }

  const key = game.outcome?.titleKey
  if (key) endings[key] = (endings[key] ?? 0) + 1
  else unfinished++
  pact += game.pactProgress
  rounds += game.round
  for (const slug of WATCH) {
    const who = game.bySlug[slug].faction.name
    holder[slug][who] = (holder[slug][who] ?? 0) + 1
  }
  for (const name of FACTIONS) {
    const faction = game.factions.find(f => f.name === name)!
    size[name] += faction.territories.length
    const home = HOME[name] ?? []
    homeKept[name] += home.length ? home.filter(s => game.bySlug[s].faction === faction).length / home.length : 0
    if (!faction.eliminated) alive[name]++
  }
}

const pct = (n: number) => `${((100 * n) / GAMES).toFixed(1)}%`
const per = (n: number) => (n / GAMES).toFixed(1)

console.log(`\n${GAMES} games on heuristics, no models — what the RULES do\n`)
console.log(`Turkey ends holding ${per(pact)} of ${NATIONAL_PACT.length} Pact provinces`)
console.log(`the war runs ${per(rounds)} rounds, and ${per(crossings)} sea crossings are made per game\n`)

console.log('how it ends for Turkey')
for (const key of Object.keys(LABEL)) if (endings[key]) console.log(`  ${LABEL[key].padEnd(18)} ${pct(endings[key]).padStart(6)}`)
if (unfinished) console.log(`  ${'still running'.padEnd(18)} ${pct(unfinished).padStart(6)}`)

console.log('\nwhere everyone finishes')
console.log(`  ${'faction'.padEnd(10)} ${'provinces'.padStart(10)} ${'own land'.padStart(9)} ${'survived'.padStart(9)}`)
for (const name of FACTIONS)
  console.log(
    `  ${name.padEnd(10)} ${per(size[name]).padStart(10)} ${`${((100 * homeKept[name]) / GAMES).toFixed(0)}%`.padStart(9)} ${pct(alive[name]).padStart(9)}`
  )

console.log('\nwho holds what when it is over')
for (const slug of WATCH) {
  const rank = Object.entries(holder[slug]).sort((a, b) => b[1] - a[1])
  console.log(`  ${slug.padEnd(15)} ${rank.map(([who, c]) => `${who} ${pct(c)}`).join(' · ')}`)
}
console.log(`\n  ${(Date.now() - started) / 1000}s`)
