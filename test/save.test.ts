import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game, { SAVE_VERSION, GameSnapshot } from '../src/game/game'
import { fresh, give, faction, turkey, fireAt, PACT } from './helpers'

/** Serialize, restore into a new game, and hand back the pair. */
const roundTrip = (g: Game) => {
  const snapshot = JSON.parse(JSON.stringify(g.serialize())) as GameSnapshot
  const restored = new Game()
  restored.restore(snapshot)
  return { snapshot, restored }
}

/** A game with as much state set as possible. */
const busy = () => {
  const g = fresh()
  for (let r = 1; r <= 12; r++) {
    g.round = r
    g.startTurn()
    if (g.pendingDecision) g.resolveDecision('requisition')
  }
  give(g, 'izmir', turkey(g), 9)
  give(g, 'ankara', faction(g, 'Greece'), 11)
  faction(g, 'Britain').grudges.add('Turkey')
  faction(g, 'Italy').peaceBroken = true
  turkey(g).hand.push('infantry', 'cavalry')
  g.liberatedThisTurn = true
  g.fortifiesUsed = 1
  g.conqueredThisTurn = true
  return g
}

describe('save round trip', () => {
  test('carries the version', () => {
    const { snapshot } = roundTrip(fresh())
    assert.equal(snapshot.v, SAVE_VERSION)
  })

  test('restores the turn state', () => {
    const g = busy()
    const { restored } = roundTrip(g)
    assert.equal(restored.round, g.round)
    assert.equal(restored.phase, g.phase)
    assert.equal(restored.currentPlayerIndex, g.currentPlayerIndex)
    assert.equal(restored.reinforcementsLeft, g.reinforcementsLeft)
    assert.equal(restored.fortifiesUsed, g.fortifiesUsed)
    assert.equal(restored.conqueredThisTurn, g.conqueredThisTurn)
    assert.equal(restored.tradeCount, g.tradeCount)
  })

  test('restores every province exactly', () => {
    const g = busy()
    const { restored } = roundTrip(g)
    for (const t of g.territories) {
      const other = restored.bySlug[t.slug]
      assert.equal(other.faction.name, t.faction.name, `${t.slug} owner`)
      assert.equal(other.troops, t.troops, `${t.slug} troops`)
      assert.equal(other.entrenched, t.entrenched, `${t.slug} entrenched`)
      assert.equal(other.quietTurns, t.quietTurns, `${t.slug} quietTurns`)
      assert.equal(other.heldSince, t.heldSince, `${t.slug} heldSince`)
    }
  })

  test('restores faction hands, grudges and broken peaces', () => {
    const g = busy()
    const { restored } = roundTrip(g)
    for (const f of g.factions) {
      const other = restored.factions.find(x => x.name === f.name)
      assert.ok(other, f.name)
      assert.deepEqual(other?.hand, f.hand, `${f.name} hand`)
      assert.deepEqual([...(other?.grudges ?? [])].sort(), [...f.grudges].sort(), `${f.name} grudges`)
      assert.equal(other?.peaceBroken, f.peaceBroken, `${f.name} peaceBroken`)
      assert.equal(other?.territories.length, f.territories.length, `${f.name} province count`)
    }
  })

  test('restores every campaign flag added this cycle', () => {
    const g = busy()
    const { restored } = roundTrip(g)
    const flags = [
      'assemblyOpened',
      'assemblyEverOpened',
      'assemblySeatTurns',
      'requisitionUntil',
      'sevresRound',
      'sakaryaRound',
      'karsTreatySigned',
      'britainStoodDown',
      'greeceCollapsed',
      'fortifyBonus',
      'liberatedThisTurn'
    ] as const
    for (const flag of flags) assert.equal(restored[flag], g[flag], flag)
  })

  test('restores which events have already been announced', () => {
    const g = busy()
    const { restored } = roundTrip(g)
    // nothing already seen should fire again
    const before = fireAt(restored, g.round)
    assert.deepEqual(before, [], 'a restored game should not replay its news')
  })

  test('restores the gate retry counters', () => {
    const g = fresh()
    give(g, 'ankara', faction(g, 'Greece'))
    fireAt(g, 5)
    fireAt(g, 6)
    assert.ok((g.gateRetries['event.tbmm'] ?? 0) >= 2)
    const { restored } = roundTrip(g)
    assert.deepEqual(restored.gateRetries, g.gateRetries)
  })

  test('restores the log', () => {
    const g = busy()
    const { restored } = roundTrip(g)
    assert.equal(restored.log.length, g.log.length)
    assert.deepEqual(restored.log[0], g.log[0])
  })

  test('a restored game plays on identically', () => {
    const g = busy()
    const { restored } = roundTrip(g)
    assert.equal(restored.reinforcementsFor(restored.humanPlayer.faction), g.reinforcementsFor(turkey(g)))
    assert.equal(restored.pactProgress, g.pactProgress)
    assert.equal(restored.fortifyLimit, g.fortifyLimit)
    assert.equal(restored.requisitionActive, g.requisitionActive)
  })

  test('a pending decision survives a save', () => {
    const g = fresh()
    for (let r = 1; r <= 10; r++) {
      g.round = r
      g.startTurn()
      if (g.pendingDecision) break
    }
    assert.equal(g.pendingDecision?.textKey, 'event.tekalif')
    const { restored } = roundTrip(g)
    assert.equal(restored.pendingDecision?.textKey, 'event.tekalif')
    restored.resolveDecision('requisition')
    assert.ok(restored.requisitionActive)
  })

  test('queued notices survive a save', () => {
    const g = fresh()
    g.round = 5
    g.startTurn()
    const queued = [...g.pendingCards]
    assert.ok(queued.length > 0)
    const { restored } = roundTrip(g)
    assert.deepEqual(restored.pendingCards, queued)
  })
})

describe('backwards compatibility', () => {
  test('a save without the new flags loads with safe defaults', () => {
    const g = fresh()
    const snapshot = JSON.parse(JSON.stringify(g.serialize())) as Record<string, unknown>
    for (const flag of [
      'assemblyOpened',
      'assemblyEverOpened',
      'assemblySeatTurns',
      'requisitionUntil',
      'sevresRound',
      'sakaryaRound',
      'karsTreatySigned',
      'britainStoodDown',
      'greeceCollapsed',
      'fortifyBonus',
      'liberatedThisTurn',
      'gateRetries',
      'heldSince',
      'pendingCards',
      'pendingDecision'
    ])
      delete snapshot[flag]
    const restored = new Game()
    restored.restore(snapshot as never)
    assert.equal(restored.assemblySeatTurns, 0)
    assert.equal(restored.karsTreatySigned, false)
    assert.equal(restored.fortifyBonus, 0)
    assert.deepEqual(restored.pendingCards, [])
    assert.equal(restored.pendingDecision, null)
    for (const t of restored.territories) assert.equal(t.heldSince, 1, `${t.slug} should read as long-settled`)
  })

  test('an old save infers the Assembly from the calendar', () => {
    const g = fresh()
    g.round = 9
    const snapshot = JSON.parse(JSON.stringify(g.serialize())) as Record<string, unknown>
    delete snapshot.assemblyOpened
    delete snapshot.assemblyEverOpened
    const restored = new Game()
    restored.restore(snapshot as never)
    assert.equal(restored.assemblyOpened, true, 'a mid-war save should keep its economy')
    assert.equal(restored.assemblyEverOpened, true)
  })

  test('v1 round-number announcements migrate to textKeys', () => {
    const g = fresh()
    g.round = 6
    const snapshot = JSON.parse(JSON.stringify(g.serialize())) as Record<string, unknown>
    // v1 stored round numbers rather than keys
    snapshot.announcedEvents = [5]
    const restored = new Game()
    restored.restore(snapshot as never)
    assert.ok(!fireAt(restored, 6).includes('event.tbmm'), 'round 5 covered TBMM')
  })

  test('a save missing a territory is rejected rather than silently wrong', () => {
    const g = fresh()
    const snapshot = JSON.parse(JSON.stringify(g.serialize())) as GameSnapshot
    delete (snapshot.territories as Record<string, unknown>)['ankara']
    const restored = new Game()
    assert.throws(() => restored.restore(snapshot), /ankara/)
  })
})

describe('save size', () => {
  test('stays small enough for localStorage', () => {
    const g = fresh()
    for (let r = 1; r <= 20; r++) {
      g.round = r
      g.startTurn()
      if (g.pendingDecision) g.resolveDecision('decline')
    }
    const bytes = JSON.stringify(g.serialize()).length
    assert.ok(bytes < 120_000, `snapshot is ${bytes} bytes`)
  })

  test('sparse fields are omitted when empty', () => {
    const g = fresh()
    const snapshot = g.serialize()
    assert.equal(Object.keys(snapshot.heldSince ?? {}).length, 0, 'nothing has changed hands yet')
    assert.ok(PACT.length > 0)
  })
})
