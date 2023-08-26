// Long-running endgame scenarios: whole games driven through the real turn
// loop, up to and past the conference. Where a mechanic needs isolating —
// which beach a fleet picks, how big the wave is — the board is set by hand and
// the round advanced deliberately, so nothing depends on what an AI felt like
// doing that turn.
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
  drive,
  entrenchTurkey,
  attackAllowed,
  landingPowersAlive,
  landingSites,
  roundOfEvent,
  Fired,
  upkeep,
  variable,
} from './helpers'

const CONFERENCE = 18
const FINAL = 27
const GARRISON = 400
const LANDING_FIRST_WAVE = 30

const keys = (fired: Fired[]) => fired.map((f) => f.key)
const roundOfFirst = (fired: Fired[], key: string) => fired.find((f) => f.key === key)?.round
const count = (fired: Fired[], key: string) => keys(fired).filter((k) => k === key).length

/**
 * Turkey holds the first `n` provinces of the Pact, Greece the rest, and every
 * garrison on the board is deep enough that no AI ever finds a fight worth
 * starting. What is left moving is the endgame itself.
 */
const board = (n: number) => {
  const g = entrenchTurkey(fresh(), GARRISON)
  const greece = faction(g, 'Greece')
  for (const slug of PACT.slice(0, n)) give(g, slug, turkey(g), 1).troops = GARRISON
  for (const slug of PACT.slice(n)) give(g, slug, greece, 1).troops = GARRISON
  return g
}

/** The first province outside the Pact that Turkey could reach if it were allowed. */
const outsideNeighbour = (g: Game) => {
  for (const own of turkey(g).territories)
    for (const next of own.adjacent)
      if (next.faction !== turkey(g) && !PACT.includes(next.slug)) return { from: own, to: next }
  throw new Error('Turkey borders nothing outside the Pact')
}

const COAST = ['izmir', 'aydin', 'balikesir', 'canakkale', 'gelibolu', 'edirne', 'antalya', 'adana', 'maras', 'hatay']

/**
 * Every beach Turkish and barely held — four years of war with the last men
 * pulled inland. The fleets pick two at random, so this is what makes a landing
 * certain rather than likely.
 */
const strippedCoast = (g: Game, troops = 1) => {
  for (const site of landingSites(g)) {
    if (site.faction !== turkey(g)) give(g, site.slug, turkey(g))
    site.troops = troops
  }
  return g
}

/** Carry an already-refused war forward round by round, landings and nothing else. */
const advance = (g: Game, rounds: number, prep?: (g: Game) => void) => {
  for (let n = 0; n < rounds && g.turn.phase !== 'gameover'; n++) {
    g.turn.configure({ round: g.turn.round + 1 })
    prep?.(g)
    upkeep(g)
  }
}

describe('winning before the conference ever sits', () => {
  test('holding the whole Pact for three turns ends the war', () => {
    const g = board(PACT.length)
    const fired = drive(g, 20)
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.victory.title')
    assert.equal(g.endedRound, 4, 'round 2, 3, 4 — the win lands on the third')
    assert.ok(!keys(fired).includes('event.conference'), 'the powers never got to offer terms')
  })

  test('two turns of holding it are not enough', () => {
    const g = board(PACT.length)
    drive(g, 2)
    assert.equal(variable(g, 'conference.pactHeldTurns'), 2, 'the clock is at two and still running')
    assert.notEqual(g.turn.phase, 'gameover')
    assert.equal(gameOutcome(g), null)
  })

  test('losing a province mid-clock resets it and costs the early win', () => {
    const g = board(PACT.length)
    const greece = faction(g, 'Greece')
    const fired = drive(g, 10, {
      onRound: (game) => {
        if (game.turn.round === 3) give(game, 'izmir', greece, 3).troops = GARRISON
      },
    })
    assert.notEqual(g.turn.phase, 'gameover', 'the war runs on')
    assert.equal(variable(g, 'conference.pactHeldTurns'), 0)
    assert.ok(!keys(fired).includes('event.conference'), 'and the conference is still ahead')
  })

  test('a Pact completed on the eve of the conference still has to be held', () => {
    const g = board(PACT.length - 1)
    const fired = drive(g, 24, {
      onRound: (game) => {
        if (game.turn.round === 17) give(game, PACT[PACT.length - 1], turkey(game), 17).troops = GARRISON
      },
    })
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.endedRound, CONFERENCE + 2, 'r18, r19, r20 — the conference date is no shortcut')
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.victory.title')
    assert.ok(!keys(fired).includes('event.conference'), 'nothing is offered to a completed war aim')
  })
})

describe('Ankara changes hands', () => {
  test('losing both seats postpones negotiated peace until the forced deadline', () => {
    const g = board(24)
    const greece = faction(g, 'Greece')
    const fired = drive(g, FINAL + 1, {
      onRound: (game) => {
        if (game.turn.round !== 12) return
        give(game, 'ankara', greece, 12).troops = GARRISON
        give(game, 'sivas', greece, 12).troops = GARRISON
      },
    })
    assert.equal(variable(g, 'assembly.active'), false, 'no government by the time terms are offered')
    assert.equal(variable(g, 'assembly.everConvened'), true, 'but there was one')
    assert.ok(!keys(fired).includes('event.conference'), 'there is nobody to accept negotiated terms')
    assert.ok(keys(fired).includes('event.lausanne'), 'the powers eventually impose the deadline settlement')
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.endedRound, FINAL)
    // and the loss runs on past the two seats: Mudanya needs an Assembly to
    // sign it, so the British never hand İstanbul back either
    assert.ok(!keys(fired).includes('event.mudanya'), 'no government, no armistice')
    assert.equal(g.bySlug['istanbul'].faction.name, 'Britain')
    assert.equal(gameOutcome(g)?.vars.held, 21, 'Ankara, Sivas and İstanbul all off the count')
  })

  test('retaking a seat brings the Assembly back, and the conference keeps its date', () => {
    const g = board(24)
    const greece = faction(g, 'Greece')
    const fired = drive(g, 22, {
      onRound: (game) => {
        if (game.turn.round === 8) {
          give(game, 'ankara', greece, 8).troops = GARRISON
          give(game, 'sivas', greece, 8).troops = GARRISON
        }
        if (game.turn.round === 13) give(game, 'ankara', turkey(game), 13).troops = GARRISON
      },
    })
    assert.equal(variable(g, 'assembly.active'), true, 'three turns holding Ankara reconvened it')
    assert.equal(roundOfFirst(fired, 'event.conference'), CONFERENCE)
  })

  test('a seat traded back and forth still only opens the Assembly once', () => {
    const g = board(24)
    const greece = faction(g, 'Greece')
    const fired = drive(g, 17, {
      onRound: (game) => {
        if ([7, 11, 15].includes(game.turn.round)) {
          give(game, 'ankara', greece, game.turn.round).troops = GARRISON
          give(game, 'sivas', greece, game.turn.round).troops = GARRISON
        }
        if ([9, 13].includes(game.turn.round)) give(game, 'ankara', turkey(game), game.turn.round).troops = GARRISON
      },
    })
    assert.equal(count(fired, 'event.tbmm'), 1, 'the Assembly is founded once and only once')
  })

  test('the capital lost and retaken during the landings does not stop the win', () => {
    const g = board(PACT.length - 1)
    const greece = faction(g, 'Greece')
    drive(g, FINAL, {
      terms: 'reject',
      onRound: (game) => {
        if (game.turn.round === CONFERENCE + 1) give(game, 'ankara', greece, game.turn.round).troops = GARRISON
        if (game.turn.round !== CONFERENCE + 2) return
        for (const slug of PACT) give(game, slug, turkey(game), game.turn.round).troops = GARRISON
      },
    })
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.victory.title', 'the Pact was retaken and the war won')
    assert.ok((g.endedRound as number) < FINAL, 'well before the powers stopped waiting')
  })

  test('with Ankara gone the events that need an Assembly stop firing', () => {
    const held = board(24)
    const lost = board(24)
    const greece = faction(lost, 'Greece')
    const withSeat = drive(held, 17)
    const without = drive(lost, 17, {
      onRound: (game) => {
        if (game.turn.round !== 6) return
        give(game, 'ankara', greece, 6).troops = GARRISON
        give(game, 'sivas', greece, 6).troops = GARRISON
      },
    })
    assert.ok(keys(withSeat).includes('event.greatOffensive'))
    assert.ok(!keys(without).includes('event.greatOffensive'), 'no Assembly, no Great Offensive')
    assert.ok(!keys(without).includes('event.tekalif'), 'and nobody to pass the tax orders')
  })
})

describe('accepting the terms', () => {
  test('signing short of the Pact grades the peace by what is held', () => {
    const g = board(22)
    drive(g, 22, { terms: 'accept' })
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.endedRound, CONFERENCE)
    assert.equal(gameOutcome(g)?.vars.held, 22)
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.lausanne.partial.title')
  })

  test('signing one province short lands the near-miss card and names it', () => {
    const g = board(PACT.length - 1)
    drive(g, 22, { terms: 'accept' })
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.lausanne.near.title')
    assert.equal(gameOutcome(g)?.vars.missing, 1)
    assert.ok(String(gameOutcome(g)?.vars.named).length > 0)
  })

  test('signing with almost nothing left lands the worst card', () => {
    const g = board(4)
    give(g, 'sivas', turkey(g)).troops = GARRISON
    drive(g, 22, { terms: 'accept' })
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.lausanne.poor.title')
  })

  test('nobody comes ashore in a war that was settled', () => {
    const g = board(20)
    drive(g, FINAL, { terms: 'accept' })
    assert.deepEqual(g.combat.landedOn, [])
    assert.equal(variable(g, 'conference.rejectedAt'), 0)
    assert.equal(g.endedRound, CONFERENCE, 'and nothing happens after the signature')
  })
})

describe('refusing the terms', () => {
  test('the war does not end, and the refusal is on the record', () => {
    const g = board(20)
    drive(g, CONFERENCE, { terms: 'reject' })
    assert.equal(variable(g, 'conference.rejectedAt'), CONFERENCE)
    assert.notEqual(g.turn.phase, 'gameover', 'refusing buys more war, not an ending')
    assert.equal(variable(g, 'conference.pactHeldTurns'), 0)
  })

  test('a defended coast throws the first wave straight back', () => {
    const g = board(20)
    drive(g, CONFERENCE, { terms: 'reject' })
    assert.equal(g.turn.round, CONFERENCE + 1, 'the first wave has been and gone')
    assert.deepEqual(g.combat.landedOn, [], 'thirty men against four hundred take nothing')
  })

  test('a stripped coast gives them their beachhead', () => {
    const g = board(20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    strippedCoast(g)
    advance(g, 1)
    assert.ok(g.combat.landedOn.length > 0, 'the first wave is thirty men and it lands')
  })

  test('the landings keep coming while the refusal stands', () => {
    const g = board(20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    strippedCoast(g)
    advance(g, 1)
    const first = g.combat.landedOn.length
    strippedCoast(g)
    advance(g, 5)
    assert.ok(g.combat.landedOn.length > first, 'later waves take more coast')
  })

  test('a beachhead becomes a province Turkey is allowed to attack', () => {
    const g = board(20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    strippedCoast(g)
    advance(g, 3)
    assert.ok(g.combat.landedOn.length > 0)
    for (const slug of g.combat.landedOn)
      assert.equal(attackAllowed(g, turkey(g), g.bySlug[slug]), true, `${slug} should be a legal target`)
  })

  test('a landing is a raid, so the province stays open for a few turns after', () => {
    const g = board(20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    strippedCoast(g)
    advance(g, 1)
    const slug = g.combat.landedOn[0]
    assert.ok(slug, 'something landed')
    assert.equal(g.bySlug[slug].raidedOn, g.turn.round)
  })

  test('refusing and then failing to hold ends at the outer limit', () => {
    const g = board(20)
    const fired = drive(g, FINAL + 2, { terms: 'reject' })
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.endedRound, FINAL, 'the powers stop waiting in late 1925')
    assert.ok(keys(fired).includes('event.lausanne'), 'the deadline is shown before it settles the war')
    const outcome = gameOutcome(g)
    assert.ok(outcome)
    assert.ok(outcome.titleKey.startsWith('overlay.lausanne.'), outcome.titleKey)
  })

  test('refusing and then taking the whole Pact wins the war outright', () => {
    const g = board(PACT.length - 2)
    drive(g, FINAL, {
      terms: 'reject',
      onRound: (game) => {
        if (game.turn.round !== CONFERENCE + 2) return
        for (const slug of PACT) give(game, slug, turkey(game), game.turn.round).troops = GARRISON
      },
    })
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.victory.title')
  })

  test('terms are never offered twice', () => {
    const g = board(20)
    const fired = drive(g, FINAL, { terms: 'reject' })
    assert.equal(count(fired, 'event.conference'), 1, 'you refuse once; there is no second offer')
  })
})

describe('nobody left to enforce the terms', () => {
  test('with Britain, France and Greece gone the peace is dictated, not offered', () => {
    const g = board(20)
    const bulgaria = faction(g, 'Bulgaria')
    const fired = drive(g, 22, {
      onRound: (game) => {
        if (game.turn.round !== 16) return
        for (const name of ['Britain', 'France', 'Greece'])
          for (const t of [...faction(game, name).territories]) give(game, t.slug, bulgaria, 16).troops = GARRISON
      },
    })
    assert.equal(landingPowersAlive(g), false)
    assert.ok(!keys(fired).includes('event.conference'), 'no question is asked')
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.endedRound, CONFERENCE)
  })

  test('killing the powers after refusing stops the waves', () => {
    const g = board(20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    strippedCoast(g)
    advance(g, 2)
    const beachheads = g.combat.landedOn.length
    assert.ok(beachheads > 0)
    const bulgaria = faction(g, 'Bulgaria')
    for (const name of ['Britain', 'France', 'Greece'])
      for (const t of [...faction(g, name).territories]) give(g, t.slug, bulgaria).troops = GARRISON
    strippedCoast(g)
    advance(g, 4)
    assert.equal(landingPowersAlive(g), false)
    assert.equal(g.combat.landedOn.length, beachheads, 'nobody is left to send another fleet')
    assert.equal(variable(g, 'conference.rejectedAt'), CONFERENCE, 'the refusal still stands on the record')
  })
})

describe('the restraint rule across a whole war', () => {
  test('Turkey may not cross the Pact line while the aim is unmet', () => {
    const g = board(20)
    drive(g, 12)
    const { from, to } = outsideNeighbour(g)
    assert.equal(attackAllowed(g, turkey(g), to), false)
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    assert.equal(g.combat.begin(from.slug, to.slug), null, 'the order is refused')
  })

  test('and may the moment the aim is met', () => {
    const g = board(PACT.length)
    const { to } = outsideNeighbour(g)
    assert.equal(attackAllowed(g, turkey(g), to), true)
  })

  test('being raided opens a province for a few turns, then closes it again', () => {
    const g = board(20)
    drive(g, 6)
    const { to } = outsideNeighbour(g)
    assert.equal(attackAllowed(g, turkey(g), to), false)
    to.raidedOn = g.turn.round
    assert.equal(attackAllowed(g, turkey(g), to), true)
    g.turn.configure({ round: g.turn.round + 4 })
    assert.equal(attackAllowed(g, turkey(g), to), false, 'the licence lapses')
  })

  test('a beachhead is a standing target, not a lapsing one', () => {
    const g = board(20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    strippedCoast(g)
    advance(g, 1)
    const slug = g.combat.landedOn.find((s) => !PACT.includes(s))
    if (!slug) return // every beach that round was inside the Pact, which is legal anyway
    g.turn.configure({ round: g.turn.round + 10 })
    assert.equal(attackAllowed(g, turkey(g), g.bySlug[slug]), true)
  })
})

describe('the Straits decide how far the fleets get', () => {
  test('holding both sides of the Dardanelles keeps İstanbul off the list', () => {
    const g = board(20)
    assert.equal(g.bySlug['gelibolu'].faction, turkey(g))
    assert.equal(g.bySlug['canakkale'].faction, turkey(g))
    assert.ok(!landingSites(g).some((s) => s.slug === 'istanbul'), 'the Marmara stays shut')
  })

  test('losing both opens it', () => {
    const g = board(20)
    const britain = faction(g, 'Britain')
    give(g, 'gelibolu', britain).troops = GARRISON
    give(g, 'canakkale', britain).troops = GARRISON
    assert.ok(landingSites(g).some((s) => s.slug === 'istanbul'))
  })

  test('losing only one keeps it shut', () => {
    const g = board(20)
    give(g, 'gelibolu', faction(g, 'Britain')).troops = GARRISON
    assert.ok(!landingSites(g).some((s) => s.slug === 'istanbul'))
  })

  test('İzmit opens only once İstanbul itself is gone', () => {
    const g = board(20)
    assert.ok(!landingSites(g).some((s) => s.slug === 'izmit'))
    give(g, 'istanbul', faction(g, 'Britain')).troops = GARRISON
    assert.ok(landingSites(g).some((s) => s.slug === 'izmit'))
  })

  test('the list is the coast itself, not whatever Turkey happens to hold', () => {
    const g = board(20)
    const slugs = landingSites(g).map((s) => s.slug)
    assert.ok(slugs.includes('edirne'), 'Turkish coast')
    assert.ok(slugs.includes('izmir'), 'Greek coast')
    assert.ok(!slugs.includes('samsun'), 'but never the Black Sea — Russia is not an Ally')
    assert.ok(!slugs.includes('trabzon'))
  })
})

describe('the war after the conference', () => {
  test('signing means the late events never happen', () => {
    const g = board(22)
    const fired = drive(g, FINAL, { terms: 'accept' })
    for (const key of ['event.caliphate', 'event.mosulQuestion', 'event.sheikhSaid', 'event.lausanne'])
      assert.ok(!keys(fired).includes(key), `${key} is past the end of a settled war`)
  })

  test('refusing is the only way to see them', () => {
    const g = board(22)
    const fired = drive(g, FINAL, { terms: 'reject' })
    assert.ok(keys(fired).includes('event.caliphate'), 'the Caliphate is abolished in 1924')
    assert.ok(keys(fired).includes('event.mosulQuestion'), 'and Mosul is still argued over')
  })

  test('every refused war still ends, and ends graded', () => {
    for (const held of [12, 18, 26]) {
      const g = board(held)
      drive(g, FINAL + 2, { terms: 'reject' })
      assert.equal(g.turn.phase, 'gameover', `${held} provinces: no war may run past the final round`)
      assert.ok(gameOutcome(g), 'and it must produce an ending')
      assert.ok((g.endedRound as number) <= FINAL)
    }
  })
})

describe('the Assembly seats through a long war', () => {
  test('Sivas alone keeps the Assembly sitting', () => {
    const g = board(24)
    const greece = faction(g, 'Greece')
    const fired = drive(g, 17, {
      onRound: (game) => {
        if (game.turn.round === 9) give(game, 'ankara', greece, 9).troops = GARRISON
      },
    })
    assert.equal(variable(g, 'assembly.active'), true, 'the seat fell back to Sivas')
    assert.ok(keys(fired).includes('event.greatOffensive'), 'and the Assembly-gated events carry on')
  })

  test('both seats gone suspends it; Sivas alone brings it back', () => {
    const g = board(24)
    const greece = faction(g, 'Greece')
    const seen: Record<number, boolean> = {}
    drive(g, 17, {
      onRound: (game) => {
        seen[game.turn.round] = variable(game, 'assembly.active') === true
        if (game.turn.round === 8) {
          give(game, 'ankara', greece, 8).troops = GARRISON
          give(game, 'sivas', greece, 8).troops = GARRISON
        }
        if (game.turn.round === 11) give(game, 'sivas', turkey(game), 11).troops = GARRISON
      },
    })
    assert.equal(seen[10], false, 'driven out with both seats lost')
    assert.equal(seen[13], false, 'two turns back in Sivas is not enough')
    assert.equal(seen[14], true, 'the third turn reconvenes it')
  })

  test('both seats gone for good keeps it shut for the rest of the war', () => {
    const g = board(24)
    const greece = faction(g, 'Greece')
    const fired = drive(g, 17, {
      onRound: (game) => {
        if (game.turn.round !== 8) return
        give(game, 'ankara', greece, 8).troops = GARRISON
        give(game, 'sivas', greece, 8).troops = GARRISON
      },
    })
    assert.equal(variable(g, 'assembly.active'), false)
    assert.ok(!keys(fired).includes('event.sultanate'), 'no Assembly to abolish the Sultanate')
    assert.ok(!keys(fired).includes('event.mudanya'), 'and none to sign an armistice')
  })

  test('an Assembly driven out mid-landing holds the Caliphate up until it comes back', () => {
    const g = board(24)
    const greece = faction(g, 'Greece')
    const fired = drive(g, FINAL, {
      terms: 'reject',
      onRound: (game) => {
        if (game.turn.round === CONFERENCE + 1) {
          give(game, 'ankara', greece, game.turn.round).troops = GARRISON
          give(game, 'sivas', greece, game.turn.round).troops = GARRISON
        }
        if (game.turn.round === CONFERENCE + 4) give(game, 'sivas', turkey(game), game.turn.round).troops = GARRISON
      },
    })
    const scheduled = roundOfEvent('event.caliphate')
    const actual = roundOfFirst(fired, 'event.caliphate')
    assert.ok(actual, 'it does eventually happen')
    assert.ok((actual as number) > scheduled, `held up past ${scheduled}, fired on ${actual}`)
    assert.equal(variable(g, 'assembly.active'), true, 'because the Assembly reconvened in Sivas')
  })
})

describe('the endgame can still be won or lost outright', () => {
  test('taking the whole map after refusing is the total-conquest ending', () => {
    const g = board(20)
    drive(g, FINAL, {
      terms: 'reject',
      onRound: (game) => {
        if (game.turn.round !== CONFERENCE + 1) return
        for (const t of game.territories)
          if (t.faction !== turkey(game)) give(game, t.slug, turkey(game)).troops = GARRISON
      },
    })
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.totalConquest, true)
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.total.title')
  })

  test('the landings can finish Turkey off', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    for (const t of [...turkey(g).territories]) if (t.slug !== 'izmir') give(g, t.slug, greece).troops = GARRISON
    give(g, 'izmir', turkey(g)).troops = 1
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    g.combat.land(faction(g, 'Britain'), g.bySlug['izmir'], LANDING_FIRST_WAVE)
    assert.equal(turkey(g).eliminated, true, 'the last province was a beach')
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.defeat.title')
  })

  test('beachheads outside the Pact do not stand between Turkey and the peace', () => {
    const g = board(PACT.length - 1)
    give(g, 'lesbos', turkey(g)).troops = 1
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    g.combat.land(faction(g, 'Britain'), g.bySlug['lesbos'], 30)
    assert.ok(g.combat.landedOn.includes('lesbos'), 'the island is theirs')
    give(g, PACT[PACT.length - 1], turkey(g)).troops = GARRISON
    advance(g, 3)
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.victory.title', 'the war aim is the Pact, not the map')
    assert.equal(g.bySlug['lesbos'].faction.name, 'Britain', 'and they keep what is outside it')
  })

  test('a beachhead inside the Pact does', () => {
    const g = board(PACT.length)
    g.turn.configure({ round: CONFERENCE })
    // refusal is impossible on a complete Pact, so this is a war that lost one
    give(g, 'izmir', faction(g, 'Greece')).troops = GARRISON
    chooseEvent(g, 'event.conference', 'reject')
    advance(g, 1)
    assert.notEqual(g.turn.phase, 'gameover', 'twenty-nine is not thirty')
    assert.equal(variable(g, 'conference.pactHeldTurns'), 0)
  })
})

describe('how the fleets come ashore', () => {
  test('at most two beaches a turn', () => {
    const g = board(20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    let before = 0
    for (let n = 0; n < 6; n++) {
      strippedCoast(g)
      advance(g, 1)
      assert.ok(
        g.combat.landedOn.length - before <= 2,
        `round ${g.turn.round} landed ${g.combat.landedOn.length - before}`,
      )
      before = g.combat.landedOn.length
    }
  })

  test('two waves can share one beach', () => {
    const g = board(20)
    const britain = faction(g, 'Britain')
    const izmir = g.bySlug['izmir']
    give(g, 'izmir', turkey(g)).troops = 1
    g.combat.land(britain, izmir, 30)
    assert.equal(izmir.faction.name, 'Britain', 'the first wave took the beach')
    const ashore = izmir.troops
    g.combat.land(britain, izmir, 30)
    assert.equal(izmir.troops, ashore + 30, 'the second walks ashore and joins them')
  })

  test('a wave onto a beach an ally holds is unopposed, not a battle', () => {
    const g = board(20)
    const greece = faction(g, 'Greece')
    const izmir = g.bySlug['izmir']
    const before = izmir.troops
    g.combat.land(faction(g, 'Britain'), izmir, 30)
    assert.equal(izmir.faction, greece, 'they do not fight each other for it')
    assert.equal(izmir.troops, before + 30, 'the men are ashore and it is their turn that moves them')
  })

  test('a retaken beach can be landed on again', () => {
    const g = board(20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    strippedCoast(g)
    advance(g, 1)
    const slug = g.combat.landedOn[0]
    give(g, slug, turkey(g)).troops = 1
    const sites = landingSites(g).map((s) => s.slug)
    assert.ok(sites.includes(slug), 'it is Turkish coast again, so it is a target again')
  })

  test('the Straits can fall mid-campaign and open İstanbul', () => {
    const g = board(20)
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    assert.ok(!landingSites(g).some((s) => s.slug === 'istanbul'))
    const britain = faction(g, 'Britain')
    give(g, 'gelibolu', britain).troops = GARRISON
    give(g, 'canakkale', britain).troops = GARRISON
    assert.ok(
      landingSites(g).some((s) => s.slug === 'istanbul'),
      'the Marmara is open now',
    )
  })

  test('with no Turkish coast left the waves come ashore behind their own lines', () => {
    const g = board(20)
    const greece = faction(g, 'Greece')
    for (const slug of COAST) if (g.bySlug[slug].faction === turkey(g)) give(g, slug, greece).troops = GARRISON
    g.turn.configure({ round: CONFERENCE })
    chooseEvent(g, 'event.conference', 'reject')
    const before = g.territories.reduce((n, t) => n + t.troops, 0)
    advance(g, 3)
    assert.deepEqual(g.combat.landedOn, [], 'nothing was taken, because nothing was Turkish')
    assert.ok(
      g.territories.reduce((n, t) => n + t.troops, 0) > before,
      'but the men are ashore, and it is the AI turn that walks them to the front',
    )
  })
})

describe('the restraint rule does not stay lifted', () => {
  test('completing the Pact opens the map; losing a province shuts it again', () => {
    const g = board(PACT.length)
    const { to } = outsideNeighbour(g)
    assert.equal(attackAllowed(g, turkey(g), to), true)
    give(g, 'izmir', faction(g, 'Greece')).troops = GARRISON
    assert.equal(attackAllowed(g, turkey(g), to), false, 'the war aim is unmet again, so the leash is back on')
  })

  test('a Pact province is always a legal target, occupied or landed on', () => {
    const g = board(20)
    for (const slug of PACT) assert.equal(attackAllowed(g, turkey(g), g.bySlug[slug]), true, slug)
  })
})

describe('saving in the middle of the endgame', () => {
  test('a refused war resumes refused', () => {
    const a = board(20)
    drive(a, CONFERENCE + 2, { terms: 'reject' })
    const snapshot = JSON.parse(JSON.stringify(snapshotGame(a)))
    const b = new Game()
    restoreGame(b, snapshot)
    assert.equal(variable(b, 'conference.rejectedAt'), CONFERENCE)
    assert.deepEqual(b.combat.landedOn, a.combat.landedOn)
    assert.equal(b.turn.round, a.turn.round)
    drive(b, FINAL + 2, { terms: 'reject' })
    assert.equal(b.turn.phase, 'gameover', 'and still ends at the outer limit')
  })

  test('a running Pact clock resumes running', () => {
    const a = board(PACT.length)
    drive(a, 2)
    assert.ok(Number(variable(a, 'conference.pactHeldTurns')) > 0, 'the clock started')
    const snapshot = JSON.parse(JSON.stringify(snapshotGame(a)))
    const b = new Game()
    restoreGame(b, snapshot)
    assert.equal(variable(b, 'conference.pactHeldTurns'), variable(a, 'conference.pactHeldTurns'))
    drive(b, 8)
    assert.equal(b.turn.phase, 'gameover', 'the clock ran out after loading')
    assert.equal(gameOutcome(b)?.titleKey, 'overlay.victory.title')
  })

  test('beachheads survive a save', () => {
    const a = board(20)
    a.turn.configure({ round: CONFERENCE })
    chooseEvent(a, 'event.conference', 'reject')
    strippedCoast(a)
    advance(a, 2)
    assert.ok(a.combat.landedOn.length > 0)
    const b = new Game()
    restoreGame(b, JSON.parse(JSON.stringify(snapshotGame(a))))
    assert.deepEqual(b.combat.landedOn, a.combat.landedOn)
    for (const slug of b.combat.landedOn) assert.equal(attackAllowed(b, turkey(b), b.bySlug[slug]), true)
  })
})
