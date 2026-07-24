import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { HISTORICAL_EVENTS } from '../src/game/campaign-events'
import { applyEvent, conditionsPass, fresh, give, faction, turkey, fireAt, setVariable, variable } from './helpers'

const ARMENIAN_HOMELAND = ['gyumri', 'yerevan', 'vanadzor', 'sevan']

const swellArmenia = (g: Game, target: number) => {
  const armenia = faction(g, 'Armenia')
  for (const territory of [...turkey(g).territories]) {
    if (armenia.territories.length >= target) break
    if (territory.slug === 'ankara' || territory.slug === 'sivas') continue
    give(g, territory.slug, armenia)
  }
  return armenia
}

describe('the Treaty of Alexandropol is stateful', () => {
  test('it waits for an active Assembly to sign it', () => {
    const g = fresh()
    give(g, 'ankara', faction(g, 'Greece'))
    give(g, 'sivas', faction(g, 'Greece'))

    assert.ok(!fireAt(g, 8).includes('event.alexandropol'))
    assert.equal(variable(g, 'treaties.alexandropol.signed'), false)

    give(g, 'ankara', turkey(g))
    const fired = fireAt(g, 9)
    assert.ok(fired.includes('event.tbmm'))
    assert.ok(fired.includes('event.alexandropol'), 'the treaty signs once Ankara can represent Turkey')
    assert.equal(variable(g, 'treaties.alexandropol.signed'), true)
  })

  test('nothing demobilizes before the gated card actually appears', () => {
    const g = fresh()
    const armenia = swellArmenia(g, 12)

    assert.ok(!fireAt(g, 8).includes('event.alexandropol'))
    assert.equal(variable(g, 'treaties.alexandropol.signed'), false)
    assert.ok(g.campaign.reinforcementsFor(armenia) > 0)
    assert.equal(g.campaign.atPeace(armenia), false)
    assert.equal(g.campaign.isPassive(armenia), false)
    assert.equal(g.campaign.mayAttack(armenia, turkey(g)), true)

    const conquest = armenia.territories.find((t) => !ARMENIAN_HOMELAND.includes(t.slug))
    assert.ok(conquest)
    give(g, conquest!.slug, turkey(g))
    assert.ok(fireAt(g, 9).includes('event.alexandropol'))
    assert.equal(variable(g, 'treaties.alexandropol.signed'), true)
    assert.equal(g.campaign.reinforcementsFor(armenia), 0)
    assert.equal(g.campaign.atPeace(armenia), true)
    assert.equal(g.campaign.isPassive(armenia), true)
    assert.equal(g.campaign.mayAttack(armenia, turkey(g)), false)
  })

  test('Kars waits for Alexandropol as well as the Assembly', () => {
    const g = fresh()
    const kars = HISTORICAL_EVENTS.find((event) => event.id === 'event.karsTreaty')
    assert.ok(kars?.conditions?.length)

    setVariable(g, 'assembly.active', true)
    assert.equal(conditionsPass(g, kars!.id), false, 'the Assembly alone is insufficient')
    applyEvent(g, 'event.alexandropol')
    assert.equal(conditionsPass(g, kars!.id), false, 'Armenia still occupies Kars and Iğdır in the National Pact')
    give(g, 'kars', turkey(g))
    give(g, 'igdir', turkey(g))
    assert.equal(
      conditionsPass(g, kars!.id),
      true,
      'all four Armenian homeland provinces are held and the Pact is clear',
    )
    give(g, 'gyumri', turkey(g))
    assert.equal(conditionsPass(g, kars!.id), false, 'Armenia must also hold every homeland province')
    give(g, 'gyumri', faction(g, 'Armenia'))
    setVariable(g, 'assembly.active', false)
    assert.equal(conditionsPass(g, kars!.id), false, 'Alexandropol alone is insufficient')
  })
})

describe('the Treaty of Kars settles Armenian conquests', () => {
  test('every Armenian conquest returns to its homeland owner with a token garrison', () => {
    const g = fresh()
    fireAt(g, 5)
    fireAt(g, 8)
    const armenia = faction(g, 'Armenia')
    give(g, 'kars', turkey(g))
    give(g, 'igdir', turkey(g))
    give(g, 'sivas', armenia)
    give(g, 'antalya', armenia)
    give(g, 'salonica', armenia)
    g.bySlug['sivas'].troops = 37
    g.bySlug['antalya'].troops = 39
    g.bySlug['salonica'].troops = 42

    // Exercise the settlement itself with far-flung hypothetical conquests;
    // the event gate separately proves that ordinary play requires a clear Pact.
    applyEvent(g, 'event.karsTreaty')
    assert.equal(g.bySlug['sivas'].faction.name, 'Turkey')
    assert.equal(g.bySlug['antalya'].faction.name, 'Turkey', 'Pact homeland overrides the opening Italian occupier')
    assert.equal(g.bySlug['salonica'].faction.name, 'Greece')
    assert.equal(g.bySlug['sivas'].troops, 1)
    assert.equal(g.bySlug['antalya'].troops, 1)
    assert.equal(g.bySlug['salonica'].troops, 1)
    assert.ok(armenia.territories.every((t) => ARMENIAN_HOMELAND.includes(t.slug)))
  })

  test('after a breach Armenia may recover homeland but never attack beyond it', () => {
    const g = fresh()
    const armenia = faction(g, 'Armenia')
    setVariable(g, 'treaties.alexandropol.signed', true)
    setVariable(g, 'treaties.kars.signed', true)
    // A real breach is caused by an attacker and records a grudge against it
    // (see combat.ts breakPeace). Turkey took gyumri, so the grudge is with Turkey —
    // that is what lets a settled Armenia fight Turkey again (peace is reciprocal).
    armenia.peaceBroken = true
    armenia.grudges.add('Turkey')
    give(g, 'gyumri', turkey(g))
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === armenia) })
    g.turn.configure({ phase: 'attack' })
    g.bySlug['vanadzor'].troops = 10
    g.bySlug['yerevan'].troops = 10

    assert.ok(g.combat.targets('vanadzor').includes('gyumri'), 'a lost homeland province can be recovered')
    assert.ok(!g.combat.targets('yerevan').includes('kars'), 'the army cannot cross into the National Pact')
    assert.equal(g.campaign.frontClosed(armenia, g.bySlug['sivas']), true)
  })

  test('Kars closes the border to Turkey as well', () => {
    const g = fresh()
    const armenia = faction(g, 'Armenia')
    armenia.peaceBroken = true

    assert.equal(g.campaign.mayAttack(armenia, turkey(g)), true, 'a breach reopens Armenian attacks before Kars')
    assert.equal(g.campaign.frontClosed(armenia, g.bySlug['sivas']), false, 'Armenia is not territorially confined yet')
    assert.equal(g.campaign.mayAttack(turkey(g), armenia), true)

    setVariable(g, 'treaties.kars.signed', true)
    assert.equal(g.campaign.mayAttack(armenia, turkey(g)), true, 'Armenia may still fight to recover its homeland')
    assert.equal(g.campaign.frontClosed(armenia, g.bySlug['sivas']), true, 'Kars imposes the homeland boundary')
    assert.equal(g.campaign.mayAttack(turkey(g), armenia), false, 'Turkey may not invade Armenia after Kars')
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === turkey(g)) })
    g.bySlug['erzurum'].troops = 20
    assert.equal(g.combat.begin('erzurum', 'kars'), null, 'the combat engine enforces the settled border')
  })
})

describe('breaking the Armenian peace', () => {
  test("a Turkish attack grants a distributable twenty-unit pool on Armenia's next turn", () => {
    const g = fresh()
    fireAt(g, 8)
    const armenia = faction(g, 'Armenia')
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === turkey(g)) })
    g.bySlug['erzurum'].troops = 30
    g.bySlug['kars'].troops = 3

    assert.ok(g.combat.begin('erzurum', 'kars'))
    assert.equal(armenia.peaceBroken, true)
    assert.equal(variable(g, 'reinforcementPools.Armenia'), 20)
    g.combat.pullBack()

    const regularLevy = g.campaign.reinforcementsFor(armenia)
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === armenia) })
    g.turn.start()
    assert.equal(g.turn.reinforcementsLeft, regularLevy + 20)
    assert.equal(variable(g, 'reinforcementPools.Armenia'), 0)

    const beforeKars = g.bySlug['kars'].troops
    const beforeYerevan = g.bySlug['yerevan'].troops
    g.turn.placeReinforcements('kars', 7)
    g.turn.placeReinforcements('yerevan', 13)
    assert.equal(g.bySlug['kars'].troops, beforeKars + 7)
    assert.equal(g.bySlug['yerevan'].troops, beforeYerevan + 13)
  })
})
