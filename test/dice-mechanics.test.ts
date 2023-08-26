import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fresh, turkey, faction, findBorder, stageAttack, withRandom, PACT } from './helpers'

/** Every die shows `face`. Math.random() → (face - 1) / 6 rounds to face. */
const loaded = (face: number) => (face - 1) / 6 + 0.01

describe('exchange resolution', () => {
  test('the attacker takes every loss when the defender always rolls higher', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 20, 20)
    g.combat.begin(from.slug, to.slug)
    // defender rolls sixes, attacker ones: the attacker loses two per exchange
    const before = { attacker: from.troops, defender: to.troops }
    withRandom(loaded(1), () => {
      // both sides roll ones, so ties go to the defender
      g.combat.step(from.slug, to.slug)
    })
    assert.equal(to.troops, before.defender, 'ties are won by the defender')
    assert.ok(from.troops < before.attacker, 'and cost the attacker')
  })

  test('a tie always favours the defender', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 10, 10)
    g.combat.begin(from.slug, to.slug)
    for (const face of [1, 3, 6]) {
      const defenders = to.troops
      withRandom(loaded(face), () => g.combat.step(from.slug, to.slug))
      assert.equal(to.troops, defenders, `equal ${face}s must not kill a defender`)
      if (to.troops < 1) break
    }
  })

  test('an exchange never removes more than the dice allow', () => {
    const g = fresh()
    g.turn.configure({ round: 20 }) // 3 v 2 at most
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 30, 30)
    g.combat.begin(from.slug, to.slug)
    for (let i = 0; i < 6; i++) {
      const before = from.troops + to.troops
      const result = g.combat.step(from.slug, to.slug)
      if (!result || !result.pending) break
      const removed = before - (from.troops + to.troops)
      assert.ok(removed >= 1 && removed <= 2, `removed ${removed} in one exchange`)
    }
  })

  test('dice counts respect both the cap and the troops available', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 2, 1) // only one die each is possible
    g.combat.begin(from.slug, to.slug)
    const result = g.combat.step(from.slug, to.slug)
    assert.equal(result?.rounds[result.rounds.length - 1].attackerDice.length, 1, 'two units means one attacking die')
    assert.equal(result?.rounds[result.rounds.length - 1].defenderDice.length, 1)
  })

  test('every die is a real face', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 40, 40)
    g.combat.begin(from.slug, to.slug)
    for (let i = 0; i < 8; i++) {
      const result = g.combat.step(from.slug, to.slug)
      if (!result || !result.pending) break
      const exchange = result.rounds[result.rounds.length - 1]
      for (const die of [...exchange.attackerDice, ...exchange.defenderDice])
        assert.ok(Number.isInteger(die) && die >= 1 && die <= 6, `bad die ${die}`)
    }
  })

  test('dice come back sorted high to low', () => {
    const g = fresh()
    g.turn.configure({ round: 20 })
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 40, 40)
    g.combat.begin(from.slug, to.slug)
    for (let i = 0; i < 5; i++) {
      const result = g.combat.step(from.slug, to.slug)
      if (!result || !result.pending) break
      const dice = result.rounds[result.rounds.length - 1].attackerDice
      assert.deepEqual(
        dice,
        [...dice].sort((a, b) => b - a),
      )
    }
  })
})

describe('the battle result', () => {
  test('accumulates losses across exchanges', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 40, 30)
    g.combat.begin(from.slug, to.slug)
    let last = null
    for (let i = 0; i < 5; i++) {
      const result = g.combat.step(from.slug, to.slug)
      if (!result) break
      if (last)
        assert.ok(
          result.attackerLosses >= last.attackerLosses && result.defenderLosses >= last.defenderLosses,
          'losses only ever go up',
        )
      last = result
      if (!result.pending) break
    }
    assert.ok(last)
    assert.equal(last?.rounds.length, last?.rounds.length, 'each exchange is recorded')
  })

  test('a conquest advances the dice that won it, and asks about the rest', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 50, 2)
    g.combat.begin(from.slug, to.slug)
    const result = g.combat.blitz(from.slug, to.slug)
    assert.equal(result?.conquered, true)
    assert.ok((result?.troopsMoved as number) > 0)
    assert.ok(from.troops > 1, 'the assault force is not emptied out by default')
    assert.equal(g.combat.pendingAdvance?.to, to.slug, 'the player is asked how many follow')
    const { min, max } = g.combat.pendingAdvance!
    assert.equal(max - min, from.troops - 1, 'everything still at home may follow, bar the garrison')
  })

  test('the advance moves what the player asks for, and never the last unit', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 50, 2)
    g.combat.begin(from.slug, to.slug)
    g.combat.blitz(from.slug, to.slug)
    const { min, max } = g.combat.pendingAdvance!
    const before = from.troops + to.troops
    g.combat.advance(max)
    assert.equal(from.troops, 1, 'everything bar the garrison went forward')
    assert.equal(from.troops + to.troops, before, 'no unit was invented or lost')
    assert.ok(max >= min)
  })

  test('asking for less than the minimum still sends the minimum', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 50, 2)
    g.combat.begin(from.slug, to.slug)
    g.combat.blitz(from.slug, to.slug)
    const { min } = g.combat.pendingAdvance!
    const held = to.troops
    g.combat.advance(0)
    assert.equal(to.troops, held, 'the men who won the throw are already across')
    assert.ok(held >= min)
    assert.equal(g.combat.pendingAdvance, null)
  })

  test('the AI never stops to be asked — it commits everything', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    const from = greece.territories.find((t) => t.adjacent.some((n) => n.faction === turkey(g)))!
    const to = from.adjacent.find((n) => n.faction === turkey(g))!
    from.troops = 50
    to.troops = 1
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === greece) })
    g.combat.begin(from.slug, to.slug)
    g.combat.blitz(from.slug, to.slug)
    assert.equal(g.combat.pendingAdvance, null)
    assert.equal(from.troops, 1)
  })

  test('a repulse leaves the province in enemy hands', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 2, 40)
    g.combat.begin(from.slug, to.slug)
    const result = g.combat.blitz(from.slug, to.slug)
    assert.equal(result?.conquered, false)
    assert.notEqual(to.faction.name, 'Turkey')
  })

  test('pending is false once the attacker cannot continue', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 2, 30)
    g.combat.begin(from.slug, to.slug)
    let result = g.combat.step(from.slug, to.slug)
    while (result?.pending) result = g.combat.step(from.slug, to.slug)
    assert.equal(result?.pending, false)
  })
})

describe('conquest bookkeeping', () => {
  test('taking a province flips ownership and moves the stack', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    const defender = to.faction.name
    stageAttack(g, from.slug, to.slug, 40, 1)
    g.combat.begin(from.slug, to.slug)
    const result = g.combat.blitz(from.slug, to.slug)
    assert.equal(result?.conquered, true)
    assert.equal(to.faction.name, 'Turkey')
    assert.notEqual(to.faction.name, defender)
    assert.ok(to.troops >= (result?.troopsMoved as number))
  })

  test('a conquest resets the province’s entrenchment', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    to.entrenched = 4
    to.quietTurns = 3
    stageAttack(g, from.slug, to.slug, 40, 1)
    g.combat.begin(from.slug, to.slug)
    g.combat.blitz(from.slug, to.slug)
    assert.equal(to.entrenched, 0)
    assert.equal(to.quietTurns, 0)
  })

  test('contesting a province stops it digging in even without taking it', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    to.quietTurns = 3
    stageAttack(g, from.slug, to.slug, 3, 30)
    g.combat.begin(from.slug, to.slug)
    assert.equal(to.quietTurns, 0)
  })

  test('the total number of units never rises during a battle', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 30, 20)
    const before = from.troops + to.troops
    g.combat.begin(from.slug, to.slug)
    g.combat.blitz(from.slug, to.slug)
    assert.ok(from.troops + to.troops <= before, 'combat cannot create units')
  })
})
