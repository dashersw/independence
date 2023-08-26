import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  attackAllowed,
  eventAvailable,
  fresh,
  give,
  faction,
  turkey,
  fireAt,
  findBorder,
  setVariable,
  upkeep,
  variable,
} from './helpers'

const loseAssembly = (g: ReturnType<typeof fresh>) => {
  give(g, 'ankara', faction(g, 'Greece'))
  give(g, 'sivas', faction(g, 'Greece'))
  setVariable(g, 'assembly.active', false)
}

describe('delayed cards own their mechanics', () => {
  test('the first Soviet shipment improves the levy only when its card arrives', () => {
    const g = fresh()
    fireAt(g, 6)
    g.turn.configure({ round: 7 })
    const beforeCard = g.campaign.reinforcementsFor(turkey(g))
    assert.equal(variable(g, 'sovietAid.first.received'), false)

    g.turn.configure({ reinforcementsLeft: beforeCard })
    assert.ok(fireAt(g, 7).includes('event.sovietAid1'))
    assert.equal(variable(g, 'sovietAid.first.received'), true)
    assert.equal(g.turn.reinforcementsLeft, beforeCard + 1, 'the current reinforcement phase receives the improvement')
  })

  test('the Great Offensive changes nothing until its gated card fires', () => {
    const g = fresh()
    setVariable(g, 'sovietAid.first.received', true)
    loseAssembly(g)
    g.turn.configure({ round: 13 })
    const levyBefore = g.campaign.reinforcementsFor(turkey(g))
    g.turn.configure({ round: 14 })
    assert.equal(g.campaign.reinforcementsFor(turkey(g)), levyBefore)
    assert.ok(!fireAt(g, 14).includes('event.greatOffensive'))
    assert.equal(variable(g, 'greatOffensive.round'), 0)
    const { from, to } = findBorder(g, (slug) => attackAllowed(g, turkey(g), g.bySlug[slug]))
    assert.equal(g.combat.diceCaps(from, to).attacker, 2)

    give(g, 'sivas', turkey(g))
    setVariable(g, 'assembly.active', true)
    assert.ok(fireAt(g, 15).includes('event.greatOffensive'))
    assert.equal(variable(g, 'greatOffensive.round'), 15)
    assert.equal(g.combat.diceCaps(from, to).attacker, 3)
  })

  test('occupation exhaustion does not leak through a failed ascendance gate', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    const acquired: string[] = []
    for (const territory of [...turkey(g).territories]) {
      if (greece.territories.length >= 14) break
      if (territory.slug === 'ankara' || territory.slug === 'sivas') continue
      acquired.push(territory.slug)
      give(g, territory.slug, greece)
    }
    g.turn.configure({ round: 13 })
    const britishLevy = g.campaign.reinforcementsFor(faction(g, 'Britain'))
    g.turn.configure({ round: 14 })
    assert.ok(!fireAt(g, 14).includes('event.exhaustion'))
    assert.equal(variable(g, 'exhaustion.round'), 0)
    assert.equal(g.campaign.reinforcementsFor(faction(g, 'Britain')), britishLevy)
    const izmir = g.bySlug['izmir']
    izmir.quietTurns = 1
    izmir.entrenched = 0
    const before = izmir.troops
    upkeep(g)
    assert.equal(izmir.troops, before + 1, 'occupation entrenchment continues while the card is blocked')

    give(g, acquired[0], turkey(g))
    assert.ok(fireAt(g, 15).includes('event.exhaustion'))
    assert.equal(variable(g, 'exhaustion.round'), 15)
    assert.equal(g.campaign.reinforcementsFor(faction(g, 'Britain')), 0)
  })

  test('the Ankara Agreement neither pacifies France nor cedes land without the Assembly', () => {
    const g = fresh()
    give(g, 'salonica', faction(g, 'France'))
    loseAssembly(g)
    assert.ok(!fireAt(g, 11).includes('event.ankaraAgreement'))
    assert.equal(variable(g, 'treaties.ankara.signed'), false)
    assert.equal(g.campaign.atPeace(faction(g, 'France')), false)
    assert.equal(g.bySlug['adana'].faction.name, 'France')
    assert.equal(g.bySlug['salonica'].faction.name, 'France')

    give(g, 'sivas', turkey(g))
    setVariable(g, 'assembly.active', true)
    assert.ok(fireAt(g, 12).includes('event.ankaraAgreement'))
    assert.equal(variable(g, 'treaties.ankara.signed'), true)
    assert.equal(g.campaign.atPeace(faction(g, 'France')), true)
    assert.equal(g.bySlug['adana'].faction.name, 'Turkey')
    assert.equal(g.bySlug['salonica'].faction.name, 'Greece')
  })

  test('Sakarya does not thin the Greek levy until the battle card occurs', () => {
    const g = fresh()
    loseAssembly(g)
    g.turn.configure({ round: 10 })
    const before = g.campaign.reinforcementsFor(faction(g, 'Greece'))
    g.turn.configure({ round: 11 })
    assert.equal(g.campaign.reinforcementsFor(faction(g, 'Greece')), before)
    assert.ok(!fireAt(g, 11).includes('event.sakarya'))
    assert.equal(variable(g, 'sakarya.round'), 0)

    give(g, 'ankara', turkey(g))
    setVariable(g, 'assembly.active', true)
    g.turn.configure({ round: 12 })
    const beforeCard = g.campaign.reinforcementsFor(faction(g, 'Greece'))
    assert.ok(fireAt(g, 12).includes('event.sakarya'))
    assert.equal(variable(g, 'sakarya.round'), 12)
    assert.equal(g.campaign.reinforcementsFor(faction(g, 'Greece')), Math.max(1, beforeCard - 1))
  })
})

describe('event counterparties and causal gates', () => {
  test('Mudanya waits specifically for a British-held İstanbul', () => {
    const g = fresh()
    setVariable(g, 'assembly.active', true)
    for (const slug of ['izmit', 'gelibolu', 'canakkale']) give(g, slug, turkey(g))
    give(g, 'istanbul', faction(g, 'Greece'))
    assert.ok(!fireAt(g, 15).includes('event.mudanya'))
    assert.equal(g.bySlug['istanbul'].faction.name, 'Greece')

    give(g, 'istanbul', faction(g, 'Britain'))
    assert.ok(fireAt(g, 16).includes('event.mudanya'))
    assert.equal(g.bySlug['istanbul'].faction.name, 'Turkey')
  })

  test('the Treaty of Moscow waits for the Assembly and grants its shipment with the card', () => {
    const g = fresh()
    loseAssembly(g)
    assert.ok(!fireAt(g, 9).includes('event.sovietAid2'))
    assert.equal(variable(g, 'sovietAid.moscow.received'), false)
    assert.equal(variable(g, 'grants.sovietAid2'), false)

    give(g, 'sivas', turkey(g))
    setVariable(g, 'assembly.active', true)
    g.turn.configure({ reinforcementsLeft: 0 })
    assert.ok(fireAt(g, 10).includes('event.sovietAid2'))
    assert.equal(variable(g, 'sovietAid.moscow.received'), true)
    assert.equal(g.turn.reinforcementsLeft, 5)
    assert.equal(variable(g, 'grants.sovietAid2'), true)
  })

  test('Şeyh Said waits until the Caliphate has actually been abolished', () => {
    const g = fresh()
    loseAssembly(g)
    assert.ok(!fireAt(g, 21).includes('event.caliphate'))
    assert.ok(!fireAt(g, 24).includes('event.sheikhSaid'))
    assert.equal(variable(g, 'caliphate.abolished'), false)

    give(g, 'sivas', turkey(g))
    setVariable(g, 'assembly.active', true)
    const fired = fireAt(g, 25)
    assert.ok(fired.includes('event.caliphate'))
    assert.ok(fired.includes('event.sheikhSaid'))
    assert.equal(variable(g, 'caliphate.abolished'), true)
  })

  test('negotiated Lausanne terms wait for an active Assembly', () => {
    const g = fresh()
    fireAt(g, 10, 'decline')
    loseAssembly(g)
    assert.equal(eventAvailable(g, 'event.conference'), false)
    assert.ok(!fireAt(g, 18).includes('event.conference'))

    give(g, 'sivas', turkey(g))
    setVariable(g, 'assembly.active', true)
    assert.equal(eventAvailable(g, 'event.conference'), true)
    assert.ok(fireAt(g, 19).includes('event.conference'))
    assert.equal(variable(g, 'conference.rejectedAt'), 19)
  })
})
