// What the map is allowed to offer as a target. The rule lives in the engine
// precisely so it can be tested: when the UI carried its own copy it drifted,
// and provinces the restraint rule forbids were drawn as selectable.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fresh, give, faction, turkey, PACT, findBorder, setVariable } from './helpers'

const asAttacker = (g: ReturnType<typeof fresh>) => {
  g.turn.configure({ phase: 'attack' })
  g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
  return g
}

describe('attackTargets', () => {
  test('offers an adjacent enemy inside the Pact', () => {
    const g = asAttacker(fresh())
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    from.troops = 10
    assert.ok(g.combat.targets(from.slug).includes(to.slug))
  })

  test('never offers a province outside the Pact while the aim is unmet', () => {
    const g = asAttacker(fresh())
    const { from, to } = findBorder(g, (slug) => !PACT.includes(slug))
    from.troops = 10
    assert.equal(g.campaign.frontClosed(turkey(g), to), true, 'the order would be refused')
    assert.ok(!g.combat.targets(from.slug).includes(to.slug), 'so it must not look selectable')
  })

  test('and offers it the moment the Pact is complete', () => {
    const g = asAttacker(fresh())
    const { from, to } = findBorder(g, (slug) => !PACT.includes(slug))
    from.troops = 10
    for (const slug of PACT) give(g, slug, turkey(g))
    assert.ok(g.combat.targets(from.slug).includes(to.slug))
  })

  test('a province that raided you is offered while the licence lasts', () => {
    const g = asAttacker(fresh())
    const { from, to } = findBorder(g, (slug) => !PACT.includes(slug))
    from.troops = 10
    to.raidedOn = g.turn.round
    assert.ok(g.combat.targets(from.slug).includes(to.slug))
    g.turn.configure({ round: g.turn.round + 4 })
    assert.ok(!g.combat.targets(from.slug).includes(to.slug), 'and dropped when it lapses')
  })

  test('the Kars line is never offered to Armenia once the treaty is signed', () => {
    const g = fresh()
    const armenia = faction(g, 'Armenia')
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === armenia) })
    setVariable(g, 'treaties.kars.signed', true)
    const from = armenia.territories.find((t) => t.adjacent.some((n) => n.faction === turkey(g)))
    assert.ok(from, 'Armenia borders Turkey')
    from!.troops = 10
    const shut = from!.adjacent.filter((n) => n.faction === turkey(g) && g.campaign.frontClosed(armenia, n))
    assert.ok(shut.length > 0, 'the treaty shuts something here')
    for (const t of shut) assert.ok(!g.combat.targets(from!.slug).includes(t.slug))
  })

  test('a single unit cannot attack, so it offers nothing', () => {
    const g = asAttacker(fresh())
    const { from } = findBorder(g, (slug) => PACT.includes(slug))
    from.troops = 1
    assert.deepEqual(g.combat.targets(from.slug), [])
  })

  test('an army that cannot mount an attack at all offers nothing', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === greece) })
    const from = greece.territories.find((t) => t.adjacent.some((n) => n.faction === turkey(g)))!
    from.troops = 20
    assert.ok(g.combat.targets(from.slug).length > 0)
    setVariable(g, 'sakarya.round', g.turn.round) // beaten, and frozen for a while
    assert.equal(g.campaign.frozen(greece), true)
    assert.deepEqual(g.combat.targets(from.slug), [])
  })

  test('nothing is a target outside the attack phase, or on somebody else’s turn', () => {
    const g = asAttacker(fresh())
    const { from } = findBorder(g, (slug) => PACT.includes(slug))
    from.troops = 10
    assert.ok(g.combat.targets(from.slug).length > 0)
    g.turn.configure({ phase: 'fortify' })
    assert.deepEqual(g.combat.targets(from.slug), [])
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => !p.isHuman) })
    assert.deepEqual(g.combat.targets(from.slug), [])
  })

  test('every target it offers is an order beginAttack accepts', () => {
    const g = asAttacker(fresh())
    for (const own of turkey(g).territories) {
      own.troops = 10
      for (const slug of g.combat.targets(own.slug)) {
        // Each pair is an independent probe of target/order agreement, not
        // another battle in one faction's operational turn.
        g.turn.configure({ attacks: { used: 0, advanceDepth: {} } })
        assert.notEqual(g.combat.begin(own.slug, slug), null, `${own.slug} → ${slug} was offered but refused`)
        g.combat.pullBack()
      }
    }
  })

  test('and every order it refuses to offer is one beginAttack would refuse', () => {
    const g = asAttacker(fresh())
    for (const own of turkey(g).territories) {
      own.troops = 10
      const offered = g.combat.targets(own.slug)
      for (const next of own.adjacent) {
        if (next.faction === turkey(g) || offered.includes(next.slug)) continue
        assert.equal(g.combat.begin(own.slug, next.slug), null, `${own.slug} → ${next.slug} was hidden but allowed`)
      }
    }
  })
})
