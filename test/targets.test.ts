// What the map is allowed to offer as a target. The rule lives in the engine
// precisely so it can be tested: when the UI carried its own copy it drifted,
// and provinces the restraint rule forbids were drawn as selectable.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fresh, give, faction, turkey, PACT, findBorder } from './helpers'

const asAttacker = (g: ReturnType<typeof fresh>) => {
  g.phase = 'attack'
  g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
  return g
}

describe('attackTargets', () => {
  test('offers an adjacent enemy inside the Pact', () => {
    const g = asAttacker(fresh())
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    from.troops = 10
    assert.ok(g.attackTargets(from.slug).includes(to.slug))
  })

  test('never offers a province outside the Pact while the aim is unmet', () => {
    const g = asAttacker(fresh())
    const { from, to } = findBorder(g, slug => !PACT.includes(slug))
    from.troops = 10
    assert.equal(g.frontClosed(turkey(g), to), true, 'the order would be refused')
    assert.ok(!g.attackTargets(from.slug).includes(to.slug), 'so it must not look selectable')
  })

  test('and offers it the moment the Pact is complete', () => {
    const g = asAttacker(fresh())
    const { from, to } = findBorder(g, slug => !PACT.includes(slug))
    from.troops = 10
    for (const slug of PACT) give(g, slug, turkey(g))
    assert.ok(g.attackTargets(from.slug).includes(to.slug))
  })

  test('a province that raided you is offered while the licence lasts', () => {
    const g = asAttacker(fresh())
    const { from, to } = findBorder(g, slug => !PACT.includes(slug))
    from.troops = 10
    to.raidedOn = g.round
    assert.ok(g.attackTargets(from.slug).includes(to.slug))
    g.round += 4
    assert.ok(!g.attackTargets(from.slug).includes(to.slug), 'and dropped when it lapses')
  })

  test('the Kars line is never offered to Armenia once the treaty is signed', () => {
    const g = fresh()
    const armenia = faction(g, 'Armenia')
    g.phase = 'attack'
    g.currentPlayerIndex = g.players.findIndex(p => p.faction === armenia)
    g.karsTreatySigned = true
    const from = armenia.territories.find(t => t.adjacent.some(n => n.faction === turkey(g)))
    assert.ok(from, 'Armenia borders Turkey')
    from!.troops = 10
    const shut = from!.adjacent.filter(n => n.faction === turkey(g) && g.frontClosed(armenia, n))
    assert.ok(shut.length > 0, 'the treaty shuts something here')
    for (const t of shut) assert.ok(!g.attackTargets(from!.slug).includes(t.slug))
  })

  test('a single unit cannot attack, so it offers nothing', () => {
    const g = asAttacker(fresh())
    const { from } = findBorder(g, slug => PACT.includes(slug))
    from.troops = 1
    assert.deepEqual(g.attackTargets(from.slug), [])
  })

  test('an army that cannot mount an attack at all offers nothing', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    g.phase = 'attack'
    g.currentPlayerIndex = g.players.findIndex(p => p.faction === greece)
    const from = greece.territories.find(t => t.adjacent.some(n => n.faction === turkey(g)))!
    from.troops = 20
    assert.ok(g.attackTargets(from.slug).length > 0)
    g.sakaryaRound = g.round // beaten, and frozen for a while
    assert.equal(g.frozen(greece), true)
    assert.deepEqual(g.attackTargets(from.slug), [])
  })

  test('nothing is a target outside the attack phase, or on somebody else’s turn', () => {
    const g = asAttacker(fresh())
    const { from } = findBorder(g, slug => PACT.includes(slug))
    from.troops = 10
    assert.ok(g.attackTargets(from.slug).length > 0)
    g.phase = 'fortify'
    assert.deepEqual(g.attackTargets(from.slug), [])
    g.phase = 'attack'
    g.currentPlayerIndex = g.players.findIndex(p => !p.isHuman)
    assert.deepEqual(g.attackTargets(from.slug), [])
  })

  test('every target it offers is an order beginAttack accepts', () => {
    const g = asAttacker(fresh())
    for (const own of turkey(g).territories) {
      own.troops = 10
      for (const slug of g.attackTargets(own.slug)) {
        assert.notEqual(g.beginAttack(own.slug, slug), null, `${own.slug} → ${slug} was offered but refused`)
        g.pullBack()
      }
    }
  })

  test('and every order it refuses to offer is one beginAttack would refuse', () => {
    const g = asAttacker(fresh())
    for (const own of turkey(g).territories) {
      own.troops = 10
      const offered = g.attackTargets(own.slug)
      for (const next of own.adjacent) {
        if (next.faction === turkey(g) || offered.includes(next.slug)) continue
        assert.equal(g.beginAttack(own.slug, next.slug), null, `${own.slug} → ${next.slug} was hidden but allowed`)
      }
    }
  })
})
