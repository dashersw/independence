import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { restoreGame, snapshotGame } from '../src/game/snapshot'
import { gameOutcome } from '../src/game/outcome'
import {
  chooseEvent,
  fresh,
  give,
  faction,
  turkey,
  PACT,
  findBorder,
  stageAttack,
  attackAllowed,
  drive,
  eventAvailable,
  landingPowersAlive,
  landingSites,
  setVariable,
  upkeep,
  variable,
} from './helpers'

const CONFERENCE = 18
const FINAL = 27

/** Hand Turkey exactly `count` Pact provinces. */
const holdPact = (g: Game, count = PACT.length) => {
  for (const slug of PACT.slice(0, count)) give(g, slug, turkey(g), 1)
  for (const slug of PACT.slice(count)) if (g.bySlug[slug].faction === turkey(g)) give(g, slug, faction(g, 'Greece'), 1)
  return g
}

/** Run the event pass at the conference date, answering anything that queues
 *  ahead of it (Tekâlif halts the loop until it is answered). */
const raiseConference = (g: Game) => {
  setVariable(g, 'assembly.active', true)
  setVariable(g, 'assembly.everConvened', true)
  g.turn.configure({ round: CONFERENCE })
  g.turn.configure({ phase: 'reinforce' })
  g.campaign.pendingCards.length = 0
  for (let i = 0; i < 5; i++) {
    g.campaign.dispatch()
    if (!g.campaign.pendingDecision) break
    if (g.campaign.pendingDecision.id === 'event.conference') return g
    g.campaign.resolveDecision('decline')
  }
  return g
}

const killLanders = (g: Game) => {
  for (const name of ['Britain', 'France', 'Greece'])
    for (const t of [...faction(g, name).territories]) give(g, t.slug, faction(g, 'Bulgaria'), 1)
  return g
}

describe('the restraint rule', () => {
  test('bars attacks outside the Pact while the war aim is unmet', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => !PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 40, 2)
    assert.equal(attackAllowed(g, turkey(g), to), false)
    assert.equal(g.combat.begin(from.slug, to.slug), null, 'the Pact is the war aim')
  })

  test('homeland provinces are never barred', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    assert.equal(attackAllowed(g, turkey(g), to), true)
    stageAttack(g, from.slug, to.slug, 20, 3)
    assert.ok(g.combat.begin(from.slug, to.slug))
  })

  test('lifts entirely once the whole Pact is held', () => {
    const g = fresh()
    holdPact(g)
    const { to } = findBorder(g, (slug) => !PACT.includes(slug))
    assert.equal(attackAllowed(g, turkey(g), to), true)
  })

  test('a province that fires on the homeland becomes a legal target for three turns', () => {
    const g = fresh()
    const raider = g.territories.find(
      (t) => t.faction.name === 'Bulgaria' && !PACT.includes(t.slug),
    ) as Game['territories'][number]
    assert.equal(attackAllowed(g, turkey(g), raider), false)
    g.turn.configure({ round: 6 })
    raider.raidedOn = 6
    assert.equal(attackAllowed(g, turkey(g), raider), true, 'same turn')
    g.turn.configure({ round: 9 })
    assert.equal(attackAllowed(g, turkey(g), raider), true, 'three turns later, still fair game')
    g.turn.configure({ round: 10 })
    assert.equal(attackAllowed(g, turkey(g), raider), false, 'and then the licence lapses')
  })

  test('the raid stamp is set by an actual attack on the homeland', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    const from = g.territories.find((t) => t.faction === greece && t.adjacent.some((a) => a.faction === turkey(g)))
    const to = from?.adjacent.find((a) => a.faction === turkey(g))
    if (!from || !to) return
    g.turn.configure({ round: 6 })
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === greece) })
    from.troops = 20
    g.combat.begin(from.slug, to.slug)
    assert.equal(from.raidedOn, 6, 'the province that fired is marked')
  })

  test('Turkey attacking someone does not mark its own province', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 20, 3)
    g.combat.begin(from.slug, to.slug)
    assert.equal(from.raidedOn, 0)
  })

  test('a province the Allies land on is permanently attackable', () => {
    const g = fresh()
    const island = g.bySlug['lesbos']
    assert.equal(attackAllowed(g, turkey(g), island), false)
    g.combat.landedOn.push('lesbos')
    assert.equal(attackAllowed(g, turkey(g), island), true)
  })
})

describe('the conference', () => {
  test('is not open before its date', () => {
    const g = fresh()
    setVariable(g, 'assembly.active', true)
    g.turn.configure({ round: CONFERENCE - 1 })
    assert.equal(eventAvailable(g, 'event.conference'), false)
  })

  test('is open from its date while the war aim is unmet', () => {
    const g = fresh()
    setVariable(g, 'assembly.active', true)
    g.turn.configure({ round: CONFERENCE })
    assert.equal(eventAvailable(g, 'event.conference'), true)
  })

  test('is not open when the Pact is already complete — that ends the war instead', () => {
    const g = fresh()
    setVariable(g, 'assembly.active', true)
    holdPact(g)
    g.turn.configure({ round: CONFERENCE })
    assert.equal(eventAvailable(g, 'event.conference'), false)
  })

  test('is not open when nobody survives to enforce a refusal', () => {
    const g = fresh()
    setVariable(g, 'assembly.active', true)
    killLanders(g)
    g.turn.configure({ round: CONFERENCE })
    assert.equal(landingPowersAlive(g), false)
    assert.equal(eventAvailable(g, 'event.conference'), false)
  })

  test('is not reopened once terms have been refused', () => {
    const g = fresh()
    setVariable(g, 'assembly.active', true)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    assert.equal(eventAvailable(g, 'event.conference'), false)
  })

  test('raises a decision with both options', () => {
    const g = raiseConference(fresh())
    assert.equal(g.campaign.pendingDecision?.id, 'event.conference')
    assert.deepEqual(
      g.campaign.pendingDecision?.choices?.map((c) => c.key),
      ['accept', 'reject'],
    )
  })

  test('accepting settles the war on what is held', () => {
    const g = raiseConference(holdPact(fresh(), 22))
    const held = g.pactProgress
    g.campaign.resolveDecision('accept')
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.endedRound, CONFERENCE)
    assert.equal(gameOutcome(g)?.vars.held, held)
  })

  test('refusing keeps the war alive and schedules the landings', () => {
    const g = raiseConference(holdPact(fresh(), 22))
    g.campaign.resolveDecision('reject')
    assert.equal(g.turn.phase, 'reinforce', 'the war goes on')
    assert.equal(variable(g, 'conference.rejectedAt'), CONFERENCE)
  })

  test('an unrecognised answer leaves the question standing', () => {
    const g = raiseConference(fresh())
    g.campaign.resolveDecision('decline') // not one of its options
    assert.equal(g.campaign.pendingDecision?.id, 'event.conference', 'still waiting for a real answer')
  })
})

describe('forced endings', () => {
  test('holding the whole Pact for three turns ends it', () => {
    const g = fresh()
    g.turn.configure({ round: 10 })
    holdPact(g)
    upkeep(g)
    assert.equal(variable(g, 'conference.pactHeldTurns'), 1)
    upkeep(g)
    assert.equal(g.turn.phase, 'reinforce')
    upkeep(g)
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.victory.title')
  })

  test('losing a single province resets the clock', () => {
    const g = fresh()
    g.turn.configure({ round: 10 })
    holdPact(g)
    upkeep(g)
    upkeep(g)
    assert.equal(variable(g, 'conference.pactHeldTurns'), 2)
    give(g, 'izmir', faction(g, 'Greece'), 11)
    upkeep(g)
    assert.equal(variable(g, 'conference.pactHeldTurns'), 0, 'the hold is broken')
    assert.equal(g.turn.phase, 'reinforce')
  })

  test('the conference date does not shortcut the three-turn hold', () => {
    const g = fresh()
    g.turn.configure({ round: CONFERENCE })
    holdPact(g)
    upkeep(g)
    assert.equal(g.turn.phase, 'reinforce', 'touching all thirty is not holding them')
    g.turn.configure({ round: CONFERENCE + 1 })
    upkeep(g)
    assert.equal(g.turn.phase, 'reinforce')
    g.turn.configure({ round: CONFERENCE + 2 })
    upkeep(g)
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.endedRound, CONFERENCE + 2)
  })

  test('with no power left to punish a refusal, terms are dictated', () => {
    const g = fresh()
    killLanders(g)
    holdPact(g, 20)
    g.turn.configure({ round: CONFERENCE })
    upkeep(g)
    assert.equal(g.turn.phase, 'gameover', 'there is nothing left to fight')
  })

  test('the final round ends everything regardless', () => {
    const g = fresh()
    holdPact(g, 12)
    const fired = drive(g, FINAL + 1, { terms: 'reject' })
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.endedRound, FINAL)
    assert.ok(
      fired.some((e) => e.key === 'event.lausanne'),
      'the deadline is raised as a visible event card',
    )
  })
})

describe('the landings', () => {
  const rejected = (round = CONFERENCE) => {
    const g = fresh()
    holdPact(g, 20)
    g.turn.configure({ round: round })
    chooseEvent(g, 'event.conference', 'reject')
    return g
  }

  test('nothing lands on the turn terms are refused', () => {
    const g = rejected()
    const before = [...g.combat.landedOn]
    upkeep(g)
    assert.deepEqual(g.combat.landedOn, before, 'they come the round after')
  })

  test('the first wave is two landings of thirty, which may share a beach', () => {
    const g = rejected()
    for (const site of landingSites(g)) {
      give(g, site.slug, turkey(g), 1)
      site.troops = 1
    }
    g.turn.configure({ round: CONFERENCE + 1 })
    upkeep(g)
    const taken = g.combat.landedOn.length
    assert.ok(taken >= 1 && taken <= 2, `two waves made ${taken} beachheads`)
    const ashore = g.combat.landedOn.reduce((n, slug) => n + g.bySlug[slug].troops, 0)
    assert.ok(ashore >= 50, `sixty men landed, ${ashore} are ashore`)
  })

  test('a landing has to beat the garrison and can be thrown back', () => {
    const g = rejected()
    const site = g.bySlug['izmir']
    give(g, 'izmir', turkey(g), 1)
    site.troops = 400 // a wall of defenders
    g.combat.land(faction(g, 'Britain'), site, 30)
    assert.equal(site.faction.name, 'Turkey', 'thirty men do not take a fortress')
    assert.ok(site.troops < 400, 'but they cost it something')
  })

  test('a successful landing takes the province and opens it to counter-attack', () => {
    const g = rejected()
    const site = g.bySlug['izmir']
    give(g, 'izmir', turkey(g), 1)
    site.troops = 1
    g.combat.land(faction(g, 'Britain'), site, 30)
    assert.equal(site.faction.name, 'Britain')
    assert.ok(site.troops >= 1)
    assert.ok(g.combat.landedOn.includes('izmir'))
    assert.equal(attackAllowed(g, turkey(g), site), true, 'a beachhead is always a legal target')
  })

  test('a landing voids that power’s peace', () => {
    const g = rejected()
    const britain = faction(g, 'Britain')
    britain.peaceBroken = false
    const site = g.bySlug['izmir']
    give(g, 'izmir', turkey(g), 1)
    site.troops = 1
    g.combat.land(britain, site, 30)
    assert.equal(britain.peaceBroken, true)
    assert.ok(turkey(g).grudges.has('Britain'))
  })

  test('every beach on the list is landable, whoever holds it', () => {
    const g = rejected()
    const slugs = landingSites(g).map((s) => s.slug)
    assert.ok(slugs.includes('izmir'), 'Greek İzmir is still a beach')
    assert.ok(slugs.includes('lesbos'), 'so is their own island')
    assert.ok(slugs.length > 5)
  })

  test('Samsun and Trabzon are never landable — Russia is not an Ally', () => {
    const g = rejected()
    const slugs = landingSites(g).map((s) => s.slug)
    assert.ok(!slugs.includes('samsun'))
    assert.ok(!slugs.includes('trabzon'))
  })

  test('İstanbul opens only when the Allies hold both Straits provinces', () => {
    const g = rejected()
    give(g, 'istanbul', turkey(g), 1)
    give(g, 'gelibolu', turkey(g), 1)
    give(g, 'canakkale', turkey(g), 1)
    assert.ok(!landingSites(g).some((s) => s.slug === 'istanbul'), 'the Straits are corked')
    give(g, 'gelibolu', faction(g, 'Britain'), 1)
    give(g, 'canakkale', faction(g, 'Britain'), 1)
    assert.ok(
      landingSites(g).some((s) => s.slug === 'istanbul'),
      'and now the Marmara is open',
    )
  })

  test('İzmit opens only once İstanbul is out of Turkish hands', () => {
    const g = rejected()
    give(g, 'izmit', turkey(g), 1)
    give(g, 'istanbul', turkey(g), 1)
    assert.ok(!landingSites(g).some((s) => s.slug === 'izmit'))
    give(g, 'istanbul', faction(g, 'Britain'), 1)
    assert.ok(landingSites(g).some((s) => s.slug === 'izmit'))
  })

  test('the islands and the whole southern coast are landable', () => {
    const g = rejected()
    for (const slug of ['lesbos', 'rhodes', 'antalya', 'adana', 'maras', 'hatay', 'aleppo', 'edirne'])
      give(g, slug, turkey(g), 1)
    const slugs = landingSites(g).map((s) => s.slug)
    for (const slug of ['lesbos', 'rhodes', 'antalya', 'adana', 'maras', 'hatay', 'aleppo', 'edirne'])
      assert.ok(slugs.includes(slug), `${slug} should be landable`)
  })

  test('later waves are smaller than the first', () => {
    const first = rejected()
    first.turn.configure({ round: CONFERENCE + 1 })
    const before = first.territories.reduce((n, t) => n + t.troops, 0)
    upkeep(first)
    const firstDelta = Math.abs(first.territories.reduce((n, t) => n + t.troops, 0) - before)

    const later = rejected()
    later.turn.configure({ round: CONFERENCE + 5 })
    const beforeLater = later.territories.reduce((n, t) => n + t.troops, 0)
    upkeep(later)
    const laterDelta = Math.abs(later.territories.reduce((n, t) => n + t.troops, 0) - beforeLater)
    assert.ok(firstDelta >= laterDelta, `first wave ${firstDelta} vs later ${laterDelta}`)
  })

  test('nothing lands when every landing power is gone', () => {
    const g = rejected()
    killLanders(g)
    g.turn.configure({ round: CONFERENCE + 1 })
    const before = [...g.combat.landedOn]
    upkeep(g)
    assert.deepEqual(g.combat.landedOn, before)
  })

  test('landings only ever come from Britain, France or Greece', () => {
    const g = rejected()
    g.turn.configure({ round: CONFERENCE + 1 })
    for (let i = 0; i < 6; i++) {
      g.turn.configure({ round: CONFERENCE + 1 + i })
      upkeep(g)
      if (g.turn.phase === 'gameover') break
    }
    for (const slug of g.combat.landedOn)
      assert.ok(['Britain', 'France', 'Greece'].includes(g.bySlug[slug].faction.name), slug)
  })
})

describe('winning the war back after refusing terms', () => {
  test('retaking the whole Pact and holding it three turns ends it in victory', () => {
    const g = fresh()
    holdPact(g, 20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    assert.equal(variable(g, 'conference.pactHeldTurns'), 0)
    holdPact(g) // the counter-offensive succeeds
    for (const t of turkey(g).territories) t.troops = 400 // and the coast is defended
    for (const r of [CONFERENCE + 1, CONFERENCE + 2]) {
      g.turn.configure({ round: r })
      upkeep(g)
      assert.equal(
        g.turn.phase,
        'reinforce',
        `still only ${variable(g, 'conference.pactHeldTurns')} turns of holding it`,
      )
    }
    g.turn.configure({ round: CONFERENCE + 3 })
    upkeep(g)
    assert.equal(g.turn.phase, 'gameover', 'three turns of holding the line beats the landings')
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.victory.title')
  })

  test('losing ground again keeps the war running to the final round', () => {
    const g = fresh()
    holdPact(g, 20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    const fired = drive(g, FINAL + 1, { terms: 'reject' })
    assert.equal(g.turn.phase, 'gameover')
    assert.ok((g.endedRound as number) <= FINAL)
    if (g.endedRound === FINAL) assert.ok(fired.some((e) => e.key === 'event.lausanne'))
  })
})

describe('the endgame survives a save', () => {
  test('refusal, beachheads and the hold counter all round-trip', () => {
    const g = fresh()
    holdPact(g, 25)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    g.combat.landedOn.push('lesbos')
    setVariable(g, 'conference.pactHeldTurns', 2)
    g.bySlug['sofia'].raidedOn = 17

    const snapshot = JSON.parse(JSON.stringify(snapshotGame(g)))
    const restored = new Game()
    restoreGame(restored, snapshot)

    assert.equal(variable(restored, 'conference.rejectedAt'), CONFERENCE)
    assert.deepEqual(restored.combat.landedOn, ['lesbos'])
    assert.equal(variable(restored, 'conference.pactHeldTurns'), 2)
    assert.equal(restored.bySlug['sofia'].raidedOn, 17)
    assert.equal(attackAllowed(restored, turkey(restored), restored.bySlug['lesbos']), true)
  })

  test('optional board-state fields still default safely', () => {
    const g = fresh()
    const snapshot = JSON.parse(JSON.stringify(snapshotGame(g))) as Record<string, unknown>
    for (const key of ['landedOn', 'raidedOn']) delete snapshot[key]
    const restored = new Game()
    restoreGame(restored, snapshot as never)
    assert.equal(variable(restored, 'conference.rejectedAt'), 0)
    assert.deepEqual(restored.combat.landedOn, [])
    assert.equal(variable(restored, 'conference.pactHeldTurns'), 0)
    for (const t of restored.territories) assert.equal(t.raidedOn, 0)
  })
})
