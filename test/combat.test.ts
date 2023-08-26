import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { fresh, give, faction, turkey, PACT, findBorder, stageAttack } from './helpers'

describe('staging a battle', () => {
  test('beginAttack rolls no dice', () => {
    const g = fresh()
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    const { from: f, to: t } = stageAttack(g, from.slug, to.slug, 10, 5)
    const result = g.beginAttack(f.slug, t.slug)
    assert.ok(result)
    assert.equal(result?.pending, true)
    assert.equal(result?.attackerLosses, 0)
    assert.equal(result?.defenderLosses, 0)
    assert.equal(f.troops, 10, 'no losses before pressing')
    assert.equal(t.troops, 5)
  })

  test('a single unit cannot attack', () => {
    const g = fresh()
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 1, 5)
    assert.equal(g.beginAttack(from.slug, to.slug), null)
  })

  test('attacking is refused outside the attack phase', () => {
    const g = fresh()
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 10, 2)
    g.phase = 'reinforce'
    assert.equal(g.beginAttack(from.slug, to.slug), null)
  })

  test('non-adjacent provinces cannot be attacked', () => {
    const g = fresh()
    const own = turkey(g).territories[0]
    const far = g.territories.find(t => t.faction !== turkey(g) && !own.adjacent.includes(t))
    g.phase = 'attack'
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    own.troops = 20
    assert.equal(g.beginAttack(own.slug, (far as Game['territories'][number]).slug), null)
  })

  test('attacking a faction at peace breaks the peace', () => {
    const g = fresh()
    g.round = 12
    const italy = faction(g, 'Italy')
    assert.equal(g.atPeace(italy), true)
    const own = turkey(g).territories.find(t => t.adjacent.some(a => a.faction === italy))
    const target = own?.adjacent.find(a => a.faction === italy)
    if (!own || !target) return
    stageAttack(g, own.slug, target.slug, 20, 3)
    g.beginAttack(own.slug, target.slug)
    assert.equal(italy.peaceBroken, true)
    assert.equal(g.isPassive(italy), false, 'a broken peace re-mobilizes them')
  })
})

describe('resolving a battle', () => {
  test('an exchange always costs somebody', () => {
    const g = fresh()
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 30, 20)
    g.beginAttack(from.slug, to.slug)
    for (let i = 0; i < 10; i++) {
      const before = from.troops + to.troops
      const r = g.attackRound(from.slug, to.slug)
      if (!r || !r.pending) break
      assert.ok(from.troops + to.troops < before, 'an exchange must remove at least one unit')
    }
  })

  test('blitzing runs to a conclusion', () => {
    const g = fresh()
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 60, 3)
    g.beginAttack(from.slug, to.slug)
    const r = g.attack(from.slug, to.slug)
    assert.equal(r?.pending, false)
    assert.equal(r?.conquered, true)
    assert.equal(to.faction.name, 'Turkey')
    assert.ok(from.troops > 1, 'how much of the stack follows is the player\u2019s call')
    g.advance(g.pendingAdvance!.max)
    assert.equal(from.troops, 1, 'and it can be all of it')
  })

  test('pulling back leaves both sides where they stand', () => {
    const g = fresh()
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 30, 20)
    g.beginAttack(from.slug, to.slug)
    g.attackRound(from.slug, to.slug)
    const attackers = from.troops
    const defenders = to.troops
    g.pullBack()
    assert.equal(from.troops, attackers)
    assert.equal(to.troops, defenders)
    assert.notEqual(to.faction.name, 'Turkey')
  })

  test('switching targets abandons the running battle', () => {
    const g = fresh()
    const own = turkey(g).territories.find(
      t => t.adjacent.filter(a => a.faction !== turkey(g) && PACT.includes(a.slug)).length >= 2
    )
    if (!own) return
    const [first, second] = own.adjacent.filter(a => a.faction !== turkey(g) && PACT.includes(a.slug))
    own.troops = 40
    first.troops = 10
    second.troops = 10
    g.phase = 'attack'
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    g.beginAttack(own.slug, first.slug)
    g.attackRound(own.slug, first.slug)
    const staged = g.beginAttack(own.slug, second.slug)
    assert.equal(staged?.to.slug, second.slug)
    assert.equal(staged?.attackerLosses, 0, 'the new battle starts clean')
  })
})

describe('worthPressing', () => {
  test('is false when the attacker cannot roll', () => {
    const g = fresh()
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    from.troops = 1
    to.troops = 5
    assert.equal(g.worthPressing(from, to), false)
  })

  test('is false against an empty province', () => {
    const g = fresh()
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    from.troops = 10
    to.troops = 0
    assert.equal(g.worthPressing(from, to), false)
  })

  test('a big stack against a token garrison is worth pressing', () => {
    const g = fresh()
    g.round = 20 // uncapped dice
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    from.troops = 50
    to.troops = 2
    assert.equal(g.worthPressing(from, to), true)
  })

  test('a losing trade is not worth pressing', () => {
    const g = fresh()
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    from.troops = 3
    to.troops = 40
    assert.equal(g.worthPressing(from, to), false)
  })
})

describe('retaliation', () => {
  test('an unprovoked Britain sits out after standing down', () => {
    const g = fresh()
    g.round = 16
    g.britainStoodDown = true
    const britain = faction(g, 'Britain')
    g.currentPlayerIndex = g.players.findIndex(p => p.faction === britain)
    g.aiBeginTurn()
    assert.equal(g.aiAttacksLeft, 0)
  })

  test('a grudge alone buys attacks, even from a faction that stood down', () => {
    const g = fresh()
    g.round = 16
    g.britainStoodDown = true
    const britain = faction(g, 'Britain')
    britain.grudges.add('Turkey')
    g.currentPlayerIndex = g.players.findIndex(p => p.faction === britain)
    g.aiBeginTurn()
    assert.ok(g.aiAttacksLeft >= 4, 'grudges override reluctance')
  })

  test('actually attacking Britain breaks its peace and un-passives it', () => {
    const g = fresh()
    g.round = 16
    g.britainStoodDown = true
    const britain = faction(g, 'Britain')
    assert.equal(g.isPassive(britain), true)
    const own = turkey(g).territories.find(t => t.adjacent.some(a => a.faction === britain))
    const target = own?.adjacent.find(a => a.faction === britain)
    if (!own || !target) return
    stageAttack(g, own.slug, target.slug, 20, 4)
    g.beginAttack(own.slug, target.slug)
    assert.equal(britain.peaceBroken, true)
    assert.equal(g.isPassive(britain), false, 'a broken peace re-mobilizes them')
    assert.ok(britain.grudges.has('Turkey'))
  })

  test('being attacked adds the grudge', () => {
    const g = fresh()
    const { from, to } = findBorder(g, slug => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 20, 5)
    g.beginAttack(from.slug, to.slug)
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
      g.round = 9
      g.phase = 'attack'
      g.currentPlayerIndex = g.players.findIndex(p => p.faction === greece)
      g.aiAttacksLeft = 1
      const konyaBefore = g.bySlug['konya'].troops
      g.aiAttackStep()
      if (g.bySlug['konya'].troops === konyaBefore && g.bySlug['konya'].faction !== greece) ankara++
    }
    assert.equal(ankara, 12, 'Konya should never be chosen over Ankara')
  })
})
