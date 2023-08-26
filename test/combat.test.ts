import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { AiTurnController } from '../src/ai/turn-controller'
import Game from '../src/game/game'
import { applyEvent, fresh, give, faction, turkey, PACT, findBorder, stageAttack, setVariable } from './helpers'

describe('staging a battle', () => {
  test('beginAttack rolls no dice', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    const { from: f, to: t } = stageAttack(g, from.slug, to.slug, 10, 5)
    const result = g.combat.begin(f.slug, t.slug)
    assert.ok(result)
    assert.equal(result?.pending, true)
    assert.equal(result?.attackerLosses, 0)
    assert.equal(result?.defenderLosses, 0)
    assert.equal(f.troops, 10, 'no losses before pressing')
    assert.equal(t.troops, 5)
  })

  test('a single unit cannot attack', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 1, 5)
    assert.equal(g.combat.begin(from.slug, to.slug), null)
  })

  test('attacking is refused outside the attack phase', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 10, 2)
    g.turn.configure({ phase: 'reinforce' })
    assert.equal(g.combat.begin(from.slug, to.slug), null)
  })

  test('non-adjacent provinces cannot be attacked', () => {
    const g = fresh()
    const own = turkey(g).territories[0]
    const far = g.territories.find((t) => t.faction !== turkey(g) && !own.adjacent.includes(t))
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    own.troops = 20
    assert.equal(g.combat.begin(own.slug, (far as Game['territories'][number]).slug), null)
  })

  test('attacking a faction at peace breaks the peace', () => {
    const g = fresh()
    g.turn.configure({ round: 12 })
    const italy = faction(g, 'Italy')
    setVariable(g, 'withdrawals.Italy', true)
    assert.equal(g.campaign.atPeace(italy), true)
    const own = turkey(g).territories.find((t) => t.adjacent.some((a) => a.faction === italy))
    const target = own?.adjacent.find((a) => a.faction === italy)
    if (!own || !target) return
    stageAttack(g, own.slug, target.slug, 20, 3)
    g.combat.begin(own.slug, target.slug)
    assert.equal(italy.peaceBroken, true)
    assert.equal(g.campaign.isPassive(italy), false, 'a broken peace re-mobilizes them')
  })
})

describe('operational limits', () => {
  test('a turn permits three new battles, and dice exchanges do not consume the budget', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 40, 20)

    assert.ok(g.combat.begin(from.slug, to.slug), 'battle 1 may begin')
    assert.equal(g.turn.attacksUsed, 1)
    g.combat.step(from.slug, to.slug)
    g.combat.step(from.slug, to.slug)
    assert.equal(g.turn.attacksUsed, 1, 'dice exchanges do not consume the operational budget')
    g.combat.pullBack()

    assert.ok(g.combat.begin(from.slug, to.slug), 'battle 2 may begin')
    g.combat.pullBack()
    assert.ok(g.combat.begin(from.slug, to.slug), 'battle 3 may begin')
    g.combat.pullBack()

    assert.equal(g.turn.attacksUsed, 3)
    assert.equal(g.turn.attacksLeft, 0)
    assert.equal(g.combat.begin(from.slug, to.slug), null, 'a fourth battle is refused')
    assert.deepEqual(g.combat.targets(from.slug), [], 'a spent budget offers no targets')
  })

  test('invalid orders remain invalid without an attack budget', () => {
    const g = fresh()
    const own = turkey(g).territories[0]
    const far = g.territories.find((territory) => territory.faction !== turkey(g) && !own.isAdjacentTo(territory))!
    stageAttack(g, own.slug, far.slug, 20, 2)
    assert.equal(g.combat.begin(own.slug, far.slug), null)
  })

  test('an advancing army may cross two territories', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    for (const slug of ['eskisehir', 'kutahya', 'usak']) {
      give(g, slug, greece)
      g.bySlug[slug].troops = 0
    }
    g.bySlug['ankara'].troops = 50
    g.turn.configure({ phase: 'attack', playerIndex: g.players.findIndex((player) => player.isHuman) })

    const conquer = (from: string, to: string) => {
      assert.ok(g.combat.begin(from, to), `${from} may attack ${to}`)
      const result = g.combat.step(from, to)
      assert.equal(result?.conquered, true)
      if (g.combat.pendingAdvance) g.combat.advance(g.combat.pendingAdvance.max)
    }

    conquer('ankara', 'eskisehir')
    assert.equal(g.turn.advanceDepth('eskisehir'), 1)
    conquer('eskisehir', 'kutahya')
    assert.equal(g.turn.advanceDepth('kutahya'), 2)
    assert.ok(!g.combat.targets('kutahya').includes('usak'))
    assert.equal(g.combat.begin('kutahya', 'usak'), null, 'the same army cannot cross a third province')
  })

  test('Büyük Taarruz lets Turkey advance three provinces inside Misak-ı Millî', () => {
    const g = fresh()
    applyEvent(g, 'event.greatOffensive')
    const greece = faction(g, 'Greece')
    for (const slug of ['eskisehir', 'kutahya', 'usak', 'izmir']) {
      give(g, slug, greece)
      g.bySlug[slug].troops = 0
    }
    g.bySlug['ankara'].troops = 50
    g.turn.configure({ phase: 'attack', playerIndex: g.players.findIndex((player) => player.isHuman) })

    for (const [from, to] of [
      ['ankara', 'eskisehir'],
      ['eskisehir', 'kutahya'],
      ['kutahya', 'usak'],
    ] as const) {
      assert.ok(g.combat.begin(from, to), `${from} may attack ${to}`)
      assert.equal(g.combat.step(from, to)?.conquered, true)
      if (g.combat.pendingAdvance) g.combat.advance(g.combat.pendingAdvance.max)
    }

    assert.equal(g.turn.advanceDepth('usak'), 3)
    assert.equal(g.combat.begin('usak', 'izmir'), null, 'a fourth province is out of reach even for the offensive')
  })

  test('foreign advances stop after two provinces, even after Büyük Taarruz', () => {
    const g = fresh()
    applyEvent(g, 'event.greatOffensive')
    const greece = faction(g, 'Greece')
    for (const slug of PACT) give(g, slug, turkey(g))
    for (const slug of ['western-thrace', 'salonica', 'kozani']) {
      give(g, slug, greece)
      g.bySlug[slug].troops = 0
    }
    g.bySlug['edirne'].troops = 50
    g.turn.configure({ phase: 'attack', playerIndex: g.players.findIndex((player) => player.isHuman) })

    for (const [from, to] of [
      ['edirne', 'western-thrace'],
      ['western-thrace', 'salonica'],
    ] as const) {
      assert.ok(g.combat.begin(from, to), `${from} may attack ${to}`)
      assert.equal(g.combat.step(from, to)?.conquered, true)
      if (g.combat.pendingAdvance) g.combat.advance(g.combat.pendingAdvance.max)
    }

    assert.equal(g.turn.advanceDepth('salonica'), 2)
    assert.equal(g.combat.begin('salonica', 'kozani'), null)
  })
})

describe('resolving a battle', () => {
  test('an exchange always costs somebody', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 30, 20)
    g.combat.begin(from.slug, to.slug)
    for (let i = 0; i < 10; i++) {
      const before = from.troops + to.troops
      const r = g.combat.step(from.slug, to.slug)
      if (!r || !r.pending) break
      assert.ok(from.troops + to.troops < before, 'an exchange must remove at least one unit')
    }
  })

  test('blitzing runs to a conclusion', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 60, 3)
    g.combat.begin(from.slug, to.slug)
    const r = g.combat.blitz(from.slug, to.slug)
    assert.equal(r?.pending, false)
    assert.equal(r?.conquered, true)
    assert.equal(to.faction.name, 'Turkey')
    assert.ok(from.troops > 1, 'how much of the stack follows is the player\u2019s call')
    g.combat.advance(g.combat.pendingAdvance!.max)
    assert.equal(from.troops, 1, 'and it can be all of it')
  })

  test('pulling back leaves both sides where they stand', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 30, 20)
    g.combat.begin(from.slug, to.slug)
    g.combat.step(from.slug, to.slug)
    const attackers = from.troops
    const defenders = to.troops
    g.combat.pullBack()
    assert.equal(from.troops, attackers)
    assert.equal(to.troops, defenders)
    assert.notEqual(to.faction.name, 'Turkey')
  })

  test('switching targets abandons the running battle', () => {
    const g = fresh()
    const own = turkey(g).territories.find(
      (t) => t.adjacent.filter((a) => a.faction !== turkey(g) && PACT.includes(a.slug)).length >= 2,
    )
    if (!own) return
    const [first, second] = own.adjacent.filter((a) => a.faction !== turkey(g) && PACT.includes(a.slug))
    own.troops = 40
    first.troops = 10
    second.troops = 10
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    g.combat.begin(own.slug, first.slug)
    g.combat.step(own.slug, first.slug)
    const staged = g.combat.begin(own.slug, second.slug)
    assert.equal(staged?.to.slug, second.slug)
    assert.equal(staged?.attackerLosses, 0, 'the new battle starts clean')
  })
})

describe('worthPressing', () => {
  test('is false when the attacker cannot roll', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    from.troops = 1
    to.troops = 5
    assert.equal(g.combat.worthPressing(from, to), false)
  })

  test('is false against an empty province', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    from.troops = 10
    to.troops = 0
    assert.equal(g.combat.worthPressing(from, to), false)
  })

  test('a big stack against a token garrison is worth pressing', () => {
    const g = fresh()
    g.turn.configure({ round: 20 })
    applyEvent(g, 'event.greatOffensive')
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    from.troops = 50
    to.troops = 2
    assert.equal(g.combat.worthPressing(from, to), true)
  })

  test('a losing trade is not worth pressing', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    from.troops = 3
    to.troops = 40
    assert.equal(g.combat.worthPressing(from, to), false)
  })
})

describe('retaliation', () => {
  test('an unprovoked Britain sits out after standing down', () => {
    const g = fresh()
    g.turn.configure({ round: 16 })
    setVariable(g, 'britain.stoodDown', true)
    const britain = faction(g, 'Britain')
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === britain) })
    const ai = new AiTurnController(g)
    ai.beginTurn()
    assert.equal(ai.attackStep(), false)
  })

  test('a grudge alone buys attacks, even from a faction that stood down', () => {
    const g = fresh()
    g.turn.configure({ round: 16 })
    setVariable(g, 'britain.stoodDown', true)
    const britain = faction(g, 'Britain')
    britain.grudges.add('Turkey')
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === britain) })
    const ai = new AiTurnController(g)
    ai.beginTurn()
    assert.equal(g.campaign.isPassive(britain), true)
    assert.ok(britain.grudges.has('Turkey'), 'the grudge is available to override passivity')
  })

  test('actually attacking Britain breaks its peace and un-passives it', () => {
    const g = fresh()
    g.turn.configure({ round: 16 })
    setVariable(g, 'britain.stoodDown', true)
    const britain = faction(g, 'Britain')
    assert.equal(g.campaign.isPassive(britain), true)
    const own = turkey(g).territories.find((t) => t.adjacent.some((a) => a.faction === britain))
    const target = own?.adjacent.find((a) => a.faction === britain)
    if (!own || !target) return
    stageAttack(g, own.slug, target.slug, 20, 4)
    g.combat.begin(own.slug, target.slug)
    assert.equal(britain.peaceBroken, true)
    assert.equal(g.campaign.isPassive(britain), false, 'a broken peace re-mobilizes them')
    assert.ok(britain.grudges.has('Turkey'))
  })

  test('being attacked adds the grudge', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 20, 5)
    g.combat.begin(from.slug, to.slug)
    assert.ok(to.faction.grudges.has('Turkey'))
  })
})

describe('the AI values the Assembly seats', () => {
  test('it prefers Ankara over an equally soft neighbour', () => {
    let ankara = 0
    for (let i = 0; i < 12; i++) {
      const g = fresh()
      const greece = faction(g, 'Greece')
      const stage = g.bySlug['eskisehir']
      give(g, 'eskisehir', greece)
      stage.troops = 60
      for (const n of stage.adjacent) if (n.faction === turkey(g)) n.troops = 200
      g.bySlug['ankara'].troops = 6
      g.bySlug['konya'].troops = 6
      g.turn.configure({ round: 9 })
      g.turn.configure({ phase: 'attack' })
      g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === greece) })
      const ai = new AiTurnController(g)
      ai.beginTurn()
      const konyaBefore = g.bySlug['konya'].troops
      ai.attackStep()
      if (g.bySlug['konya'].troops === konyaBefore && g.bySlug['konya'].faction !== greece) ankara++
    }
    assert.equal(ankara, 12, 'Konya should never be chosen over Ankara')
  })
})
