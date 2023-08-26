import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { CAMPAIGN_EVENTS, HISTORICAL_EVENTS } from '../src/game/campaign-events'
import factionData from '../src/game/factions.json'
import {
  applyEvent,
  fresh,
  give,
  faction,
  turkey,
  fireAt,
  fireThrough,
  roundOfEvent,
  PACT,
  setVariable,
  upkeep,
  variable,
} from './helpers'

const startCount = (name: string) =>
  (factionData.factions.find((f) => f.name === name) as { territories: unknown[] }).territories.length

/** Feed a faction provinces off Turkey until it reaches a size. Leaves the
 *  Assembly's seats alone so "large" and "has decapitated the movement" stay
 *  separate conditions — they are gated differently. */
const swell = (g: Game, name: string, target: number) => {
  const f = faction(g, name)
  for (const t of [...turkey(g).territories]) {
    if (f.territories.length >= target) break
    if (t.slug === 'ankara' || t.slug === 'sivas') continue
    give(g, t.slug, f)
  }
  return f.territories.length
}

describe('starting sizes', () => {
  test('are what the collapse thresholds are derived from', () => {
    assert.equal(startCount('Turkey'), 16)
    assert.equal(startCount('Greece'), 7)
    assert.equal(startCount('Britain'), 6)
    assert.equal(startCount('Armenia'), 6)
    assert.equal(startCount('France'), 4)
    assert.equal(startCount('Italy'), 2)
  })
})

describe('an occupier that is winning does not collapse', () => {
  test('Greece at double its start keeps its army', () => {
    const g = fresh()
    fireAt(g, 5)
    assert.equal(swell(g, 'Greece', 14), 14)
    assert.ok(!fireAt(g, 16).includes('event.greekCollapse'))
    assert.equal(variable(g, 'greece.collapsed'), false)
  })

  test('and collapses late once pushed back below the line', () => {
    const g = fresh()
    fireAt(g, 5)
    swell(g, 'Greece', 14)
    fireAt(g, 16)
    give(g, faction(g, 'Greece').territories[0].slug, turkey(g))
    assert.equal(faction(g, 'Greece').territories.length, 13)
    assert.ok(fireAt(g, 17).includes('event.greekCollapse'))
    assert.equal(variable(g, 'greece.collapsed'), true)
  })

  test('Britain at double its start does not stand down', () => {
    const g = fresh()
    fireAt(g, 5)
    swell(g, 'Britain', 12)
    assert.ok(!fireAt(g, 15).includes('event.lloydGeorge'))
    assert.equal(variable(g, 'britain.stoodDown'), false)
    give(g, faction(g, 'Britain').territories[0].slug, turkey(g))
    assert.ok(fireAt(g, 16).includes('event.lloydGeorge'))
    assert.equal(variable(g, 'britain.stoodDown'), true)
  })

  test('Armenia at double its start does not sue for peace', () => {
    const g = fresh()
    swell(g, 'Armenia', 12)
    assert.ok(!fireAt(g, 8).includes('event.alexandropol'))
  })

  test('exhaustion waits while ANY occupier is ascendant', () => {
    const g = fresh()
    fireAt(g, 5)
    swell(g, 'Greece', 14)
    assert.ok(!fireAt(g, 14).includes('event.exhaustion'))
  })

  test('exhaustion fires normally when nobody is ascendant', () => {
    const g = fresh()
    fireAt(g, 5)
    assert.ok(fireAt(g, 14).includes('event.exhaustion'))
  })

  test('one province short of double is not ascendant', () => {
    const g = fresh()
    fireAt(g, 5)
    swell(g, 'Greece', 13)
    assert.ok(fireAt(g, 16).includes('event.greekCollapse'), '13 of 14 should still collapse')
  })

  test('all four fire on schedule in a clean campaign', () => {
    const g = fresh()
    fireAt(g, 5)
    assert.ok(fireAt(g, 8).includes('event.alexandropol'))
    assert.ok(fireAt(g, 14).includes('event.exhaustion'))
    assert.ok(fireAt(g, 15).includes('event.lloydGeorge'))
    assert.ok(fireAt(g, 16).includes('event.greekCollapse'))
  })
})

describe('Venizelos falls unless the war looks won', () => {
  test('falls on schedule in a normal game', () => {
    const g = fresh()
    fireAt(g, 5)
    assert.ok(fireAt(g, 7).includes('event.venizelos'))
  })

  test('does not fall while Greece holds Ankara', () => {
    const g = fresh()
    fireAt(g, 5)
    give(g, 'ankara', faction(g, 'Greece'))
    assert.ok(!fireAt(g, 7).includes('event.venizelos'))
    assert.ok(!fireAt(g, 9).includes('event.venizelos'))
  })

  test('falls late once Ankara is retaken', () => {
    const g = fresh()
    fireAt(g, 5)
    give(g, 'ankara', faction(g, 'Greece'))
    fireAt(g, 7)
    give(g, 'ankara', turkey(g))
    assert.ok(fireAt(g, 8).includes('event.venizelos'))
  })

  test('does not fall if the Assembly never convened', () => {
    const g = fresh()
    give(g, 'ankara', faction(g, 'Greece'))
    give(g, 'sivas', faction(g, 'Greece'))
    for (let r = 5; r <= 12; r++) assert.ok(!fireAt(g, r).includes('event.venizelos'), `fell at ${r}`)
  })

  test('a merely large Greece is not enough to save him', () => {
    const g = fresh()
    fireAt(g, 5)
    swell(g, 'Greece', 14) // ascendant, but Ankara is still Turkish
    assert.ok(fireAt(g, 7).includes('event.venizelos'), 'his fall was domestic, not military')
  })
})

describe('the Great Offensive needs somebody to throw out', () => {
  test('it fires while an occupier still sits on the homeland', () => {
    const g = fresh()
    setVariable(g, 'assembly.active', true)
    fireThrough(g, 1, roundOfEvent('event.greatOffensive') - 1)
    assert.ok(fireAt(g, roundOfEvent('event.greatOffensive')).includes('event.greatOffensive'))
  })

  test('but not once the Misak-ı Millî is already clear', () => {
    const g = fresh()
    setVariable(g, 'assembly.active', true)
    // let the war happen first — the occupation of İstanbul among it — and
    // only then clear the homeland, or the earlier events hand it back
    fireThrough(g, 1, roundOfEvent('event.greatOffensive') - 1)
    for (const slug of PACT) give(g, slug, turkey(g))
    assert.ok(!fireAt(g, roundOfEvent('event.greatOffensive')).includes('event.greatOffensive'))
  })

  test('beating Greece early does not cost you the army', () => {
    // the gate is any occupier, not Greece: a player who clears the Aegean
    // still needs the mobilization for İstanbul
    const g = fresh()
    setVariable(g, 'assembly.active', true)
    fireThrough(g, 1, roundOfEvent('event.greatOffensive') - 1)
    for (const t of [...faction(g, 'Greece').territories]) give(g, t.slug, turkey(g))
    assert.equal(faction(g, 'Greece').eliminated, true)
    assert.ok(g.bySlug['istanbul'].faction.name === 'Britain', 'but the City is still occupied')
    assert.ok(fireAt(g, roundOfEvent('event.greatOffensive')).includes('event.greatOffensive'))
  })

  test('and it waits, so an occupier who comes back brings it with them', () => {
    const g = fresh()
    setVariable(g, 'assembly.active', true)
    const round = roundOfEvent('event.greatOffensive')
    fireThrough(g, 1, round - 1)
    for (const slug of PACT) give(g, slug, turkey(g))
    assert.ok(!fireAt(g, round).includes('event.greatOffensive'), 'nothing to launch at')
    give(g, 'izmir', faction(g, 'Greece'))
    assert.ok(fireAt(g, round + 1).includes('event.greatOffensive'), 'and now there is')
  })
})

describe('the Allies reassert their hold on the City', () => {
  const withIstanbul = (troops: number) => {
    const g = fresh()
    give(g, 'istanbul', turkey(g))
    g.bySlug['istanbul'].troops = troops
    return g
  }

  test('an occupation force marches in — not the garrison that was standing there', () => {
    const g = withIstanbul(20)
    applyEvent(g, 'event.istanbulOccupied')
    assert.equal(g.bySlug['istanbul'].faction.name, 'Britain')
    assert.equal(g.bySlug['istanbul'].troops, 10, 'half of what Turkey had, not all of it')
  })

  test('a thin garrison still leaves somebody holding the City', () => {
    const g = withIstanbul(1)
    applyEvent(g, 'event.istanbulOccupied')
    assert.equal(g.bySlug['istanbul'].troops, 1, 'never nobody')
  })

  test('it costs Turkey a Pact province and pays a card for it', () => {
    const g = withIstanbul(6)
    const before = g.pactProgress
    const hand = turkey(g).hand.length
    applyEvent(g, 'event.istanbulOccupied')
    assert.equal(g.pactProgress, before - 1)
    assert.equal(turkey(g).hand.length, hand + 1, 'the loss draws a card')
  })

  test('and Britain does not inherit the entrenchment', () => {
    const g = withIstanbul(12)
    g.bySlug['istanbul'].entrenched = 3
    applyEvent(g, 'event.istanbulOccupied')
    assert.equal(g.bySlug['istanbul'].entrenched, 0, 'freshly taken, however it was taken')
  })

  test('the Assembly is untouched — it never sat in İstanbul', () => {
    const g = withIstanbul(8)
    setVariable(g, 'assembly.active', true)
    setVariable(g, 'assembly.everConvened', true)
    applyEvent(g, 'event.istanbulOccupied')
    upkeep(g)
    assert.equal(variable(g, 'assembly.active'), true, 'Ankara is the seat, and Ankara is still Turkish')
  })

  test('with Britain gone the City stays where it is', () => {
    const g = withIstanbul(9)
    const britain = faction(g, 'Britain')
    for (const t of [...britain.territories]) if (t.slug !== 'istanbul') give(g, t.slug, turkey(g))
    assert.equal(britain.eliminated, true)
    const occupationRound = roundOfEvent('event.istanbulOccupied')
    fireThrough(g, 1, occupationRound - 1)
    g.bySlug['istanbul'].troops = 9
    fireAt(g, occupationRound)
    assert.equal(g.bySlug['istanbul'].faction.name, 'Turkey', 'nobody left to send an occupation force')
    assert.equal(g.bySlug['istanbul'].troops, 9)
  })

  test('the card keeps trying through 1920, then retires', () => {
    const event = HISTORICAL_EVENTS.find((e) => e.id === 'event.istanbulOccupied')!
    assert.deepEqual(event.retry, { mode: 'window', rounds: 3 }, 'the occupation was continuous, not a single quarter')
    // measured on what actually fires, not on the gate alone: the gate says
    // "Turkey holds the City", the event's own round says "not before March 1920"
    const bites: number[] = []
    for (let round = 4; round <= 10; round++) {
      const at = fresh()
      give(at, 'istanbul', turkey(at))
      if (fireAt(at, round).includes('event.istanbulOccupied')) bites.push(round)
    }
    assert.deepEqual(bites, [5, 6, 7], 'March to November 1920, and no later')
  })

  test('and it cannot lie in wait for a City taken years later', () => {
    const g = fresh()
    const event = HISTORICAL_EVENTS.find((e) => e.id === 'event.istanbulOccupied')!
    g.turn.configure({ round: 16 })
    give(g, 'istanbul', turkey(g))
    assert.equal(CAMPAIGN_EVENTS.conditionsPass(event.id, g), false, 'by 1923 the occupation is a spent force')
  })
})
