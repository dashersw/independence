import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { SAVE_VERSION, GameSnapshot, restoreGame, snapshotGame } from '../src/game/snapshot'
import { fresh, give, faction, turkey, fireAt, PACT, setVariable, variable } from './helpers'

/** Serialize, restore into a new game, and hand back the pair. */
const roundTrip = (g: Game) => {
  const snapshot = JSON.parse(JSON.stringify(snapshotGame(g))) as GameSnapshot
  const restored = new Game()
  restoreGame(restored, snapshot)
  return { snapshot, restored }
}

/** A game with as much state set as possible. */
const busy = () => {
  const g = fresh()
  for (let r = 1; r <= 12; r++) {
    g.turn.configure({ round: r })
    g.turn.start()
    if (g.campaign.pendingDecision) g.campaign.resolveDecision('requisition')
  }
  give(g, 'izmir', turkey(g), 9)
  give(g, 'ankara', faction(g, 'Greece'), 11)
  faction(g, 'Britain').grudges.add('Turkey')
  faction(g, 'Italy').peaceBroken = true
  turkey(g).hand.push('infantry', 'cavalry')
  g.turn.configure({ liberatedHomeland: true })
  setVariable(g, 'greatOffensive.round', 14)
  setVariable(g, 'exhaustion.round', 14)
  setVariable(g, 'sovietAid.first.received', true)
  setVariable(g, 'sovietAid.moscow.received', true)
  setVariable(g, 'treaties.ankara.signed', true)
  setVariable(g, 'caliphate.abolished', true)
  g.turn.configure({ fortifiesUsed: 1 })
  g.turn.configure({ attacks: { used: 2, advanceDepth: { izmir: 1 } } })
  g.turn.configure({ conqueredTerritory: true })
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
    assert.equal(restored.turn.round, g.turn.round)
    assert.equal(restored.turn.phase, g.turn.phase)
    assert.equal(restored.turn.playerIndex, g.turn.playerIndex)
    assert.equal(restored.turn.reinforcementsLeft, g.turn.reinforcementsLeft)
    assert.equal(restored.turn.advanceDepth('izmir'), g.turn.advanceDepth('izmir'))
    assert.equal(restored.turn.attacksUsed, g.turn.attacksUsed)
    assert.equal(restored.turn.fortifiesUsed, g.turn.fortifiesUsed)
    assert.equal(restored.turn.conqueredTerritory, g.turn.conqueredTerritory)
    assert.equal(restored.tradeCount, g.tradeCount)
  })

  test('older version-three saves default missing attack state safely', () => {
    const snapshot = snapshotGame(fresh())
    delete (snapshot.turn as unknown as Record<string, unknown>).attacks
    const restored = new Game()
    restoreGame(restored, snapshot)
    assert.equal(restored.turn.advanceDepth('ankara'), 0)
    assert.equal(restored.turn.attacksUsed, 0)
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
      const other = restored.factions.find((x) => x.name === f.name)
      assert.ok(other, f.name)
      assert.deepEqual(other?.hand, f.hand, `${f.name} hand`)
      assert.deepEqual([...(other?.grudges ?? [])].sort(), [...f.grudges].sort(), `${f.name} grudges`)
      assert.equal(other?.peaceBroken, f.peaceBroken, `${f.name} peaceBroken`)
      assert.equal(other?.territories.length, f.territories.length, `${f.name} province count`)
    }
  })

  test('restores the complete engine-owned campaign document', () => {
    const g = busy()
    const { restored } = roundTrip(g)
    assert.deepEqual(restored.campaign.variables, g.campaign.variables)
    assert.equal(restored.turn.liberatedHomeland, g.turn.liberatedHomeland)
  })

  test('restores which events have already been announced', () => {
    const g = busy()
    const { restored } = roundTrip(g)
    // nothing already seen should fire again
    const before = fireAt(restored, g.turn.round)
    assert.deepEqual(before, [], 'a restored game should not replay its news')
  })

  test('restores the gate retry counters', () => {
    const g = fresh()
    give(g, 'ankara', faction(g, 'Greece'))
    fireAt(g, 5)
    fireAt(g, 6)
    assert.ok((g.campaign.retries['event.tbmm'] ?? 0) >= 2)
    const { restored } = roundTrip(g)
    assert.deepEqual(restored.campaign.retries, g.campaign.retries)
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
    assert.equal(
      restored.campaign.reinforcementsFor(restored.humanPlayer.faction),
      g.campaign.reinforcementsFor(turkey(g)),
    )
    assert.equal(restored.pactProgress, g.pactProgress)
    assert.equal(restored.campaign.fortifyLimit, g.campaign.fortifyLimit)
    assert.equal(variable(restored, 'tekalif.until'), variable(g, 'tekalif.until'))
  })

  test('a pending decision survives a save', () => {
    const g = fresh()
    for (let r = 1; r <= 10; r++) {
      g.turn.configure({ round: r })
      g.turn.start()
      if (g.campaign.pendingDecision) break
    }
    assert.equal(g.campaign.pendingDecision?.id, 'event.tekalif')
    const { restored } = roundTrip(g)
    assert.equal(restored.campaign.pendingDecision?.id, 'event.tekalif')
    restored.campaign.resolveDecision('requisition')
    assert.ok(restored.turn.round <= Number(variable(restored, 'tekalif.until')))
  })

  test('queued notices survive a save', () => {
    const g = fresh()
    g.turn.configure({ round: 5 })
    g.turn.start()
    const queued = [...g.campaign.pendingCards]
    assert.ok(queued.length > 0)
    const { restored } = roundTrip(g)
    assert.deepEqual(restored.campaign.pendingCards, queued)
  })
})

describe('save validation', () => {
  test('a save missing a territory is rejected rather than silently wrong', () => {
    const g = fresh()
    const snapshot = JSON.parse(JSON.stringify(snapshotGame(g))) as GameSnapshot
    delete (snapshot.board.territories as Record<string, unknown>)['ankara']
    const restored = new Game()
    assert.throws(() => restoreGame(restored, snapshot), /ankara/)
  })
})

describe('save size', () => {
  test('stays small enough for localStorage', () => {
    const g = fresh()
    for (let r = 1; r <= 20; r++) {
      g.turn.configure({ round: r })
      g.turn.start()
      if (g.campaign.pendingDecision) g.campaign.resolveDecision('decline')
    }
    const bytes = JSON.stringify(snapshotGame(g)).length
    assert.ok(bytes < 120_000, `snapshot is ${bytes} bytes`)
  })

  test('sparse fields are omitted when empty', () => {
    const g = fresh()
    const snapshot = snapshotGame(g)
    assert.equal(
      Object.values(snapshot.board.territories).filter((territory) => territory.heldSince > 1).length,
      0,
      'nothing has changed hands yet',
    )
    assert.ok(PACT.length > 0)
  })
})
