import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fresh, give, faction, turkey, fireAt } from './helpers'

const greece = (g: ReturnType<typeof fresh>) => faction(g, 'Greece')

describe('the Assembly convenes', () => {
  test('immediately at t5 when Ankara is held', () => {
    const g = fresh()
    assert.ok(fireAt(g, 5).includes('event.tbmm'))
    assert.equal(g.assemblyOpened, true)
    assert.equal(g.assemblyEverOpened, true)
  })

  test('an occupied Ankara postpones rather than cancels', () => {
    const g = fresh()
    give(g, 'ankara', greece(g))
    assert.ok(!fireAt(g, 5).includes('event.tbmm'))
    assert.ok(!fireAt(g, 6).includes('event.tbmm'))
    assert.equal(g.assemblyOpened, false)
    give(g, 'ankara', turkey(g))
    assert.ok(fireAt(g, 7).includes('event.tbmm'))
    assert.equal(g.assemblyOpened, true)
  })

  test('falls back to Sivas after three failed looks at Ankara', () => {
    const g = fresh()
    give(g, 'ankara', greece(g))
    for (const r of [5, 6, 7]) assert.ok(!fireAt(g, r).includes('event.tbmm'), `fired early at ${r}`)
    assert.ok(fireAt(g, 8).includes('event.tbmm'), 'Sivas should take it from the fourth attempt')
    assert.equal(g.assemblyOpened, true)
  })

  test('never convenes while both seats are lost, and waits indefinitely', () => {
    const g = fresh()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    for (let r = 5; r <= 20; r++) assert.ok(!fireAt(g, r).includes('event.tbmm'), `fired at ${r}`)
    assert.equal(g.assemblyOpened, false)
    // it is not burned — retaking a seat still brings it
    give(g, 'ankara', turkey(g))
    assert.ok(fireAt(g, 21).includes('event.tbmm'))
  })
})

describe('the Assembly can be driven out', () => {
  const opened = () => {
    const g = fresh()
    fireAt(g, 5)
    assert.equal(g.assemblyOpened, true)
    return g
  }

  test('losing Ankara alone does not suspend it — Sivas is a seat', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    g.assemblyUpkeep()
    assert.equal(g.assemblyOpened, true)
  })

  test('losing both seats suspends it', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    g.assemblyUpkeep()
    assert.equal(g.assemblyOpened, false)
  })

  test('it reconvenes after three consecutive turns holding a seat', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    g.assemblyUpkeep()
    give(g, 'sivas', turkey(g))
    g.assemblyUpkeep()
    assert.equal(g.assemblyOpened, false, 'one turn is not enough')
    g.assemblyUpkeep()
    assert.equal(g.assemblyOpened, false, 'two turns is not enough')
    g.assemblyUpkeep()
    assert.equal(g.assemblyOpened, true, 'three turns brings it back')
  })

  test('the reconvene counter resets if the seat is lost again', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    g.assemblyUpkeep()
    give(g, 'sivas', turkey(g))
    g.assemblyUpkeep()
    g.assemblyUpkeep()
    assert.equal(g.assemblySeatTurns, 2)
    give(g, 'sivas', greece(g))
    g.assemblyUpkeep()
    assert.equal(g.assemblySeatTurns, 0)
    assert.equal(g.assemblyOpened, false)
  })

  test('upkeep does nothing before the Assembly has ever met', () => {
    const g = fresh()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    g.assemblyUpkeep()
    assert.equal(g.assemblyEverOpened, false)
    assert.equal(g.assemblySeatTurns, 0)
  })

  test('suspension reverts the economy and restoring it brings it back', () => {
    const g = opened()
    g.round = 8
    const withAssembly = g.reinforcementsFor(turkey(g))
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    g.assemblyUpkeep()
    const suspended = g.reinforcementsFor(turkey(g))
    assert.ok(suspended < withAssembly, 'the divisor and exhaustion should worsen')
    give(g, 'ankara', turkey(g))
    g.assemblyUpkeep()
    g.assemblyUpkeep()
    g.assemblyUpkeep()
    assert.equal(g.assemblyOpened, true)
    assert.equal(g.reinforcementsFor(turkey(g)), withAssembly)
  })

  test('what the Assembly already did is not undone', () => {
    const g = opened()
    fireAt(g, 11) // Kars, Sakarya, the Ankara Agreement
    assert.equal(g.karsTreatySigned, true)
    const sakarya = g.sakaryaRound
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    g.assemblyUpkeep()
    assert.equal(g.assemblyOpened, false)
    assert.equal(g.karsTreatySigned, true, 'a signed treaty stays signed')
    assert.equal(g.sakaryaRound, sakarya, 'a won battle stays won')
  })

  test('Assembly-gated events wait while it is suspended and fire when it returns', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    g.assemblyUpkeep()
    assert.ok(!fireAt(g, 14).includes('event.greatOffensive'), 'must not fire without a government')
    give(g, 'ankara', turkey(g))
    g.assemblyUpkeep()
    g.assemblyUpkeep()
    g.assemblyUpkeep()
    assert.ok(fireAt(g, 18).includes('event.greatOffensive'), 'fires late once the Assembly is back')
  })

  test('battles give up rather than drifting out of their era', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    g.assemblyUpkeep()
    // İnönü allows three looks and then never happened
    for (const r of [9, 10, 11]) fireAt(g, r)
    give(g, 'ankara', turkey(g))
    g.assemblyUpkeep()
    g.assemblyUpkeep()
    g.assemblyUpkeep()
    assert.ok(!fireAt(g, 13).includes('event.inonu'), 'İnönü in 1922 is not İnönü')
  })
})

describe('the Assembly gates its own acts', () => {
  const withoutAssembly = () => {
    const g = fresh()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    return g
  }

  test('ten events depend on it', () => {
    const g = withoutAssembly()
    const fired = new Set<string>()
    for (let r = 1; r <= 27; r++) for (const k of fireAt(g, r)) fired.add(k)
    for (const key of [
      'event.tbmm',
      'event.inonu',
      'event.tekalif',
      'event.sakarya',
      'event.karsTreaty',
      'event.ankaraAgreement',
      'event.greatOffensive',
      'event.sultanate',
      'event.mubadele',
      'event.caliphate'
    ])
      assert.ok(!fired.has(key), `${key} fired without a government`)
  })

  test('events that do not depend on it still fire', () => {
    const g = withoutAssembly()
    const fired = new Set<string>()
    for (let r = 1; r <= 27; r++) for (const k of fireAt(g, r)) fired.add(k)
    for (const key of [
      'event.sevres',
      'event.sovietAid1',
      'event.sovietAid2',
      'event.alexandropol',
      'event.italyWithdraws',
      'event.exhaustion',
      'event.lloydGeorge',
      'event.greekCollapse',
      'event.lausanne'
    ])
      assert.ok(fired.has(key), `${key} should not need the Assembly`)
  })

  test('Çerkes Ethem needs the regular army he mutinied against', () => {
    const without = withoutAssembly()
    for (const r of [5, 6, 7]) fireAt(without, r)
    assert.ok(!fireAt(without, 8).includes('event.ethem'))

    const with_ = fresh()
    fireAt(with_, 5)
    assert.ok(fireAt(with_, 8).includes('event.ethem'))
  })
})
