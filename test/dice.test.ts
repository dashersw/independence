import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { fresh, give, faction, turkey, PACT, findBorder } from './helpers'

/** A Turkish province attacking an occupied Pact province, and the reverse. */
const fronts = (g: Game) => {
  const out = findBorder(g, slug => PACT.includes(slug))
  let invader: { from: Game['territories'][number]; to: Game['territories'][number] } | null = null
  for (const t of g.territories)
    for (const a of t.adjacent)
      if (!invader && t.faction.alliance !== 'turkey' && a.faction === turkey(g) && PACT.includes(a.slug))
        invader = { from: t, to: a }
  return { turkish: out, invader: invader as NonNullable<typeof invader> }
}

describe('dice caps by era', () => {
  test('both sides are capped at 2 before the Great Offensive', () => {
    const g = fresh()
    const { turkish, invader } = fronts(g)
    for (const r of [1, 5, 9, 13]) {
      g.round = r
      assert.equal(g.diceCapsFor(turkish.from, turkish.to).attacker, 2, `TR attack at ${r}`)
      assert.equal(g.diceCapsFor(invader.from, invader.to).attacker, 2, `invader attack at ${r}`)
      assert.equal(g.diceCapsFor(invader.from, invader.to).defender, 2, `homeland defence at ${r}`)
    }
  })

  test('the Great Offensive lifts all three at once', () => {
    const g = fresh()
    const { turkish, invader } = fronts(g)
    g.round = 14
    assert.equal(g.diceCapsFor(turkish.from, turkish.to).attacker, 3)
    assert.equal(g.diceCapsFor(invader.from, invader.to).attacker, 3)
    assert.equal(g.diceCapsFor(invader.from, invader.to).defender, 3)
  })

  test('defenders outside the homeland never get the third die', () => {
    const g = fresh()
    g.round = 20
    const { to: nonPact } = findBorder(g, slug => !PACT.includes(slug))
    const from = nonPact.adjacent.find(a => a.faction === turkey(g)) as Game['territories'][number]
    assert.equal(g.diceCapsFor(from, nonPact).defender, 2)
  })
})

describe('the Tekâlif-i Milliye window', () => {
  const opened = (round: number) => {
    const g = fresh()
    g.round = round
    g.requisitionUntil = round + 1
    return g
  }

  test('boosts only the first two exchanges of a battle', () => {
    const g = opened(11)
    const { turkish } = fronts(g)
    turkish.from.troops = 80
    turkish.to.troops = 60
    g.phase = 'attack'
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    g.beginAttack(turkish.from.slug, turkish.to.slug)
    const seen: number[] = []
    for (let i = 0; i < 5; i++) {
      seen.push(g.diceCapsFor(turkish.from, turkish.to).attacker)
      g.attackRound(turkish.from.slug, turkish.to.slug)
    }
    assert.deepEqual(seen, [3, 3, 2, 2, 2])
  })

  test('a fresh battle gets its own allowance', () => {
    const g = opened(11)
    const { turkish } = fronts(g)
    turkish.from.troops = 80
    turkish.to.troops = 40
    g.phase = 'attack'
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    g.beginAttack(turkish.from.slug, turkish.to.slug)
    g.attackRound(turkish.from.slug, turkish.to.slug)
    g.attackRound(turkish.from.slug, turkish.to.slug)
    assert.equal(g.diceCapsFor(turkish.from, turkish.to).attacker, 2, 'allowance spent')
    g.pullBack()
    const other = turkish.from.adjacent.find(
      a => a.faction !== turkey(g) && a !== turkish.to && PACT.includes(a.slug)
    )
    if (!other) return // map-dependent; the single-battle case above is the invariant
    other.troops = 20
    turkish.from.troops = 80
    g.beginAttack(turkish.from.slug, other.slug)
    assert.equal(g.diceCapsFor(turkish.from, other).attacker, 3, 'a new battle resets it')
  })

  test('does nothing outside the homeland', () => {
    const g = opened(11)
    const { from, to } = findBorder(g, slug => !PACT.includes(slug))
    assert.equal(g.diceCapsFor(from, to).attacker, 2)
  })

  test('closes when the window expires', () => {
    const g = fresh()
    const { turkish } = fronts(g)
    g.round = 13
    g.requisitionUntil = 12
    assert.equal(g.requisitionActive, false)
    assert.equal(g.diceCapsFor(turkish.from, turkish.to).attacker, 2)
  })

  test('requisition() opens exactly three rounds', () => {
    const g = fresh()
    g.round = 10
    g.requisition()
    assert.equal(g.requisitionUntil, 12)
    for (const [round, open] of [
      [10, true],
      [11, true],
      [12, true],
      [13, false]
    ] as [number, boolean][]) {
      g.round = round
      assert.equal(g.requisitionActive, open, `round ${round}`)
    }
  })
})

describe('Sakarya breaks the Greek offensive', () => {
  test('Greece is capped at 2 attack dice for the rest of the war', () => {
    const g = fresh()
    const { invader } = fronts(g)
    const greek = g.territories.find(t => t.faction.name === 'Greece' && t.adjacent.some(a => a.faction === turkey(g)))
    const target = greek?.adjacent.find(a => a.faction === turkey(g))
    if (!greek || !target) return
    g.round = 20
    assert.equal(g.diceCapsFor(greek, target).attacker, 3, 'uncapped after the Great Offensive')
    g.sakaryaRound = 11
    assert.equal(g.diceCapsFor(greek, target).attacker, 2, 'Sakarya caps it permanently')
    assert.ok(invader)
  })

  test('but only into Anatolia — Macedonia is a different war', () => {
    // Sakarya broke the drive on Ankara, not Greece's fight with Bulgaria over
    // Salonica. Attacking to hold Macedonia is unbroken.
    const g = fresh()
    g.round = 20
    g.sakaryaRound = 11
    give(g, 'kozani', faction(g, 'Bulgaria')) // a non-Pact Greek homeland province
    const from = g.bySlug['kozani'].adjacent.find(a => a.faction === faction(g, 'Greece'))
    if (from) {
      from.troops = 20
      assert.equal(g.diceCapsFor(from, g.bySlug['kozani']).attacker, 3, 'the Balkan front is not broken')
    }
    // and into the Misak-ı Millî it is still capped
    const greek = g.territories.find(t => t.faction.name === 'Greece' && t.adjacent.some(a => a.faction === turkey(g)))
    const anatolia = greek?.adjacent.find(a => a.faction === turkey(g))
    if (greek && anatolia) assert.equal(g.diceCapsFor(greek, anatolia).attacker, 2, 'Anatolia still broken')
  })

  test('the freeze lasts exactly two rounds', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    g.sakaryaRound = 11
    g.round = 11
    assert.equal(g.frozen(greece), true)
    g.round = 12
    assert.equal(g.frozen(greece), true)
    g.round = 13
    assert.equal(g.frozen(greece), false)
  })

  test('only Greece is frozen', () => {
    const g = fresh()
    g.sakaryaRound = 11
    g.round = 11
    assert.equal(g.frozen(faction(g, 'Britain')), false)
  })
})

describe('the Treaty of Kars shuts the eastern front', () => {
  test('Armenia cannot attack the four border provinces once signed', () => {
    const g = fresh()
    const armenia = faction(g, 'Armenia')
    for (const slug of ['kars', 'igdir', 'erzurum', 'van', 'trabzon']) {
      give(g, slug, turkey(g))
      assert.equal(g.frontClosed(armenia, g.bySlug[slug]), false, 'not closed before the treaty')
    }
    g.karsTreatySigned = true
    for (const slug of ['kars', 'igdir', 'erzurum', 'van', 'trabzon'])
      assert.equal(g.frontClosed(armenia, g.bySlug[slug]), true, `${slug} should be shut`)
  })

  test('Trabzon is covered too, since it borders Gyumri directly', () => {
    const g = fresh()
    assert.ok(g.bySlug['trabzon'].adjacent.some(a => a.slug === 'gyumri'), 'the border is real')
    g.karsTreatySigned = true
    assert.equal(g.frontClosed(faction(g, 'Armenia'), g.bySlug['trabzon']), true)
  })

  test('other provinces and other factions are unaffected', () => {
    const g = fresh()
    g.karsTreatySigned = true
    assert.equal(g.frontClosed(faction(g, 'Armenia'), g.bySlug['sivas']), false)
    assert.equal(g.frontClosed(faction(g, 'Greece'), g.bySlug['kars']), false)
  })
})

describe('Iraq is a bystander', () => {
  test('nobody may attack it and it may not attack', () => {
    const g = fresh()
    const iraq = faction(g, 'Iraq')
    g.round = 23
    g.settleMosulQuestion()
    assert.ok(iraq.territories.length > 0, 'Iraq should hold something after the award')
    assert.equal(g.mayAttack(turkey(g), iraq), false)
    assert.equal(g.mayAttack(iraq, turkey(g)), false)
  })

  test('a grudge does not open the door', () => {
    const g = fresh()
    const iraq = faction(g, 'Iraq')
    g.round = 23
    g.settleMosulQuestion()
    turkey(g).grudges.add('Iraq')
    iraq.grudges.add('Turkey')
    assert.equal(g.mayAttack(turkey(g), iraq), false)
    assert.equal(g.mayAttack(iraq, turkey(g)), false)
  })

  test('beginAttack refuses outright', () => {
    const g = fresh()
    g.round = 23
    g.settleMosulQuestion()
    const mosul = g.bySlug['mosul']
    const neighbour = mosul.adjacent.find(a => a.faction === turkey(g))
    if (!neighbour) return
    neighbour.troops = 20
    g.phase = 'attack'
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    assert.equal(g.beginAttack(neighbour.slug, mosul.slug), null)
  })
})
