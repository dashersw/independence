import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fresh, give, faction, turkey, fireAt, upkeep, variable } from './helpers'

const greece = (g: ReturnType<typeof fresh>) => faction(g, 'Greece')

describe('the Assembly convenes', () => {
  test('immediately at t5 when Ankara is held', () => {
    const g = fresh()
    assert.ok(fireAt(g, 5).includes('event.tbmm'))
    assert.equal(variable(g, 'assembly.active'), true)
    assert.equal(variable(g, 'assembly.everConvened'), true)
  })

  test('an occupied Ankara postpones rather than cancels', () => {
    const g = fresh()
    give(g, 'ankara', greece(g))
    assert.ok(!fireAt(g, 5).includes('event.tbmm'))
    assert.ok(!fireAt(g, 6).includes('event.tbmm'))
    assert.equal(variable(g, 'assembly.active'), false)
    give(g, 'ankara', turkey(g))
    assert.ok(fireAt(g, 7).includes('event.tbmm'))
    assert.equal(variable(g, 'assembly.active'), true)
  })

  test('falls back to Sivas after three failed looks at Ankara', () => {
    const g = fresh()
    give(g, 'ankara', greece(g))
    for (const r of [5, 6, 7]) assert.ok(!fireAt(g, r).includes('event.tbmm'), `fired early at ${r}`)
    assert.ok(fireAt(g, 8).includes('event.tbmm'), 'Sivas should take it from the fourth attempt')
    assert.equal(variable(g, 'assembly.active'), true)
  })

  test('never convenes while both seats are lost, and waits indefinitely', () => {
    const g = fresh()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    for (let r = 5; r <= 20; r++) assert.ok(!fireAt(g, r).includes('event.tbmm'), `fired at ${r}`)
    assert.equal(variable(g, 'assembly.active'), false)
    // it is not burned — retaking a seat still brings it
    give(g, 'ankara', turkey(g))
    assert.ok(fireAt(g, 21).includes('event.tbmm'))
  })
})

describe('the Assembly can be driven out', () => {
  const opened = () => {
    const g = fresh()
    fireAt(g, 5)
    assert.equal(variable(g, 'assembly.active'), true)
    return g
  }

  test('losing Ankara alone does not suspend it — Sivas is a seat', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    upkeep(g)
    assert.equal(variable(g, 'assembly.active'), true)
  })

  test('losing both seats suspends it', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    upkeep(g)
    assert.equal(variable(g, 'assembly.active'), false)
  })

  test('it reconvenes after three consecutive turns holding a seat', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    upkeep(g)
    give(g, 'sivas', turkey(g))
    upkeep(g)
    assert.equal(variable(g, 'assembly.active'), false, 'one turn is not enough')
    upkeep(g)
    assert.equal(variable(g, 'assembly.active'), false, 'two turns is not enough')
    upkeep(g)
    assert.equal(variable(g, 'assembly.active'), true, 'three turns brings it back')
  })

  test('the reconvene counter resets if the seat is lost again', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    upkeep(g)
    give(g, 'sivas', turkey(g))
    upkeep(g)
    upkeep(g)
    assert.equal(variable(g, 'assembly.reconveneTurns'), 2)
    give(g, 'sivas', greece(g))
    upkeep(g)
    assert.equal(variable(g, 'assembly.reconveneTurns'), 0)
    assert.equal(variable(g, 'assembly.active'), false)
  })

  test('upkeep does nothing before the Assembly has ever met', () => {
    const g = fresh()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    upkeep(g)
    assert.equal(variable(g, 'assembly.everConvened'), false)
    assert.equal(variable(g, 'assembly.reconveneTurns'), 0)
  })

  test('suspension reverts the economy and restoring it brings it back', () => {
    const g = opened()
    g.turn.configure({ round: 8 })
    const withAssembly = g.campaign.reinforcementsFor(turkey(g))
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    upkeep(g)
    const suspended = g.campaign.reinforcementsFor(turkey(g))
    assert.ok(suspended < withAssembly, 'the divisor and exhaustion should worsen')
    give(g, 'ankara', turkey(g))
    upkeep(g)
    upkeep(g)
    upkeep(g)
    assert.equal(variable(g, 'assembly.active'), true)
    assert.equal(g.campaign.reinforcementsFor(turkey(g)), withAssembly)
  })

  test('what the Assembly already did is not undone', () => {
    const g = opened()
    give(g, 'kars', turkey(g))
    give(g, 'igdir', turkey(g))
    fireAt(g, 11) // Kars, Sakarya, the Ankara Agreement
    assert.equal(variable(g, 'treaties.kars.signed'), true)
    const sakarya = variable(g, 'sakarya.round')
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    upkeep(g)
    assert.equal(variable(g, 'assembly.active'), false)
    assert.equal(variable(g, 'treaties.kars.signed'), true, 'a signed treaty stays signed')
    assert.equal(variable(g, 'sakarya.round'), sakarya, 'a won battle stays won')
  })

  test('Assembly-gated events wait while it is suspended and fire when it returns', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    upkeep(g)
    assert.ok(!fireAt(g, 14).includes('event.greatOffensive'), 'must not fire without a government')
    give(g, 'ankara', turkey(g))
    upkeep(g)
    upkeep(g)
    upkeep(g)
    assert.ok(fireAt(g, 18).includes('event.greatOffensive'), 'fires late once the Assembly is back')
  })

  test('battles give up rather than drifting out of their era', () => {
    const g = opened()
    give(g, 'ankara', greece(g))
    give(g, 'sivas', greece(g))
    upkeep(g)
    // İnönü allows three looks and then never happened
    for (const r of [9, 10, 11]) fireAt(g, r)
    give(g, 'ankara', turkey(g))
    upkeep(g)
    upkeep(g)
    upkeep(g)
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

  test('thirteen events depend on it', () => {
    const g = withoutAssembly()
    const fired = new Set<string>()
    for (let r = 1; r <= 27; r++) for (const k of fireAt(g, r)) fired.add(k)
    for (const key of [
      'event.tbmm',
      'event.alexandropol',
      'event.sovietAid2',
      'event.inonu',
      'event.tekalif',
      'event.sakarya',
      'event.karsTreaty',
      'event.ankaraAgreement',
      'event.greatOffensive',
      'event.sultanate',
      'event.mubadele',
      'event.caliphate',
      'event.conference',
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
      'event.italyWithdraws',
      'event.exhaustion',
      'event.lloydGeorge',
      'event.greekCollapse',
      'event.lausanne',
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
