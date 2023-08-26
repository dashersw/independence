import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { tradeBonusAt } from '../src/game/game'
import { Card } from '../src/game/faction'
import { fresh, turkey, faction, findBorder, stageAttack, PACT } from './helpers'

const hand = (...cards: Card[]) => cards

describe('finding a tradable set', () => {
  test('three alike', () => {
    const g = fresh()
    assert.deepEqual(g.findTradeSet(hand('infantry', 'infantry', 'infantry')), [0, 1, 2])
    assert.deepEqual(g.findTradeSet(hand('cannon', 'cannon', 'cannon')), [0, 1, 2])
  })

  test('one of each', () => {
    const g = fresh()
    const set = g.findTradeSet(hand('infantry', 'cavalry', 'cannon'))
    assert.equal(set?.length, 3)
    assert.equal(new Set(set).size, 3)
  })

  test('picks a set out of a larger hand', () => {
    const g = fresh()
    const set = g.findTradeSet(hand('infantry', 'cavalry', 'cavalry', 'cavalry', 'cannon'))
    assert.equal(set?.length, 3)
  })

  test('no set from two kinds only', () => {
    const g = fresh()
    assert.equal(g.findTradeSet(hand('infantry', 'infantry', 'cavalry', 'cavalry')), null)
  })

  test('no set from an empty or short hand', () => {
    const g = fresh()
    assert.equal(g.findTradeSet([]), null)
    assert.equal(g.findTradeSet(hand('infantry', 'cavalry')), null)
  })
})

describe('trade bonuses escalate', () => {
  test('the published ladder', () => {
    assert.deepEqual([0, 1, 2, 3, 4, 5].map(tradeBonusAt), [4, 6, 8, 10, 12, 15])
  })

  test('and keep climbing by five past the table', () => {
    assert.equal(tradeBonusAt(6), 20)
    assert.equal(tradeBonusAt(7), 25)
    assert.equal(tradeBonusAt(10), 40)
  })

  test('pendingTradeBonus reflects how many trades have happened', () => {
    const g = fresh()
    assert.equal(g.pendingTradeBonus, 4)
    g.tradeCount = 3
    assert.equal(g.pendingTradeBonus, 10)
  })
})

describe('trading cards', () => {
  test('consumes exactly three cards and pays the bonus', () => {
    const g = fresh()
    const f = turkey(g)
    f.hand = hand('infantry', 'infantry', 'infantry', 'cannon')
    g.turn.configure({ phase: 'reinforce' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    const before = g.turn.reinforcementsLeft
    const bonus = g.tradeCards(f)
    assert.equal(bonus, 4)
    assert.equal(f.hand.length, 1)
    assert.deepEqual(f.hand, ['cannon'])
    assert.equal(g.turn.reinforcementsLeft, before + 4)
    assert.equal(g.tradeCount, 1)
  })

  test('pays nothing and changes nothing without a set', () => {
    const g = fresh()
    const f = turkey(g)
    f.hand = hand('infantry', 'cavalry')
    const before = g.turn.reinforcementsLeft
    assert.equal(g.tradeCards(f), 0)
    assert.equal(f.hand.length, 2)
    assert.equal(g.turn.reinforcementsLeft, before)
    assert.equal(g.tradeCount, 0)
  })

  test('an AI trading does not add to the human’s pool', () => {
    const g = fresh()
    g.turn.configure({ phase: 'reinforce' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    const greece = faction(g, 'Greece')
    greece.hand = hand('cannon', 'cannon', 'cannon')
    const before = g.turn.reinforcementsLeft
    const bonus = g.tradeCards(greece)
    assert.equal(bonus, 4, 'the bonus is still counted')
    assert.equal(g.turn.reinforcementsLeft, before, 'but it is not ours')
  })

  test('the bonus only lands during the reinforce phase', () => {
    const g = fresh()
    const f = turkey(g)
    f.hand = hand('infantry', 'infantry', 'infantry')
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    const before = g.turn.reinforcementsLeft
    g.tradeCards(f)
    assert.equal(g.turn.reinforcementsLeft, before)
  })

  test('successive trades pay more', () => {
    const g = fresh()
    const f = turkey(g)
    g.turn.configure({ phase: 'reinforce' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    const paid: number[] = []
    for (let i = 0; i < 3; i++) {
      f.hand = hand('infantry', 'cavalry', 'cannon')
      paid.push(g.tradeCards(f))
    }
    assert.deepEqual(paid, [4, 6, 8])
  })

  test('a hand of five or more is force-traded at the start of a turn', () => {
    const g = fresh()
    const f = turkey(g)
    f.hand = hand('infantry', 'infantry', 'infantry', 'cavalry', 'cannon')
    g.turn.configure({ round: 2 })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    g.turn.start()
    assert.ok(f.hand.length < 5, 'the classic Risk rule')
  })
})

describe('earning cards', () => {
  test('a conquest earns a card at the end of the turn', () => {
    const g = fresh()
    const { from, to } = findBorder(g, (slug) => PACT.includes(slug))
    stageAttack(g, from.slug, to.slug, 60, 2)
    g.combat.begin(from.slug, to.slug)
    g.combat.blitz(from.slug, to.slug)
    assert.equal(g.turn.conqueredTerritory, true)
    const before = turkey(g).hand.length
    g.turn.finish()
    assert.equal(turkey(g).hand.length, before + 1)
  })

  test('a turn without a conquest earns nothing', () => {
    const g = fresh()
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    g.turn.configure({ conqueredTerritory: false })
    const before = turkey(g).hand.length
    g.turn.finish()
    assert.equal(turkey(g).hand.length, before)
  })

  test('drawCard only ever deals a real card type', () => {
    const g = fresh()
    const f = turkey(g)
    for (let i = 0; i < 60; i++) g.drawCard(f)
    for (const card of f.hand) assert.ok(['infantry', 'cavalry', 'cannon'].includes(card), card)
  })

  test('a knocked-out faction hands its cards to its conqueror', () => {
    const g = fresh()
    const italy = faction(g, 'Italy')
    italy.hand = hand('cannon', 'cannon')
    // reduce Italy to a single province, then take it
    const last = italy.territories[0]
    for (const territory of italy.territories.slice(1)) g.board.changeControl(territory, faction(g, 'Greece'), 1)
    const attacker = last.adjacent.find((a) => a.faction === turkey(g))
    if (!attacker) return
    stageAttack(g, attacker.slug, last.slug, 60, 1)
    const before = turkey(g).hand.length
    g.combat.begin(attacker.slug, last.slug)
    const result = g.combat.blitz(attacker.slug, last.slug)
    assert.equal(result?.eliminatedFaction?.name, 'Italy')
    assert.equal(turkey(g).hand.length, before + 2, 'their hand comes with the last province')
    assert.equal(italy.hand.length, 0)
  })
})
