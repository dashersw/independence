import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { HISTORICAL_EVENTS } from '../src/game/game'
import { fresh, give, faction, turkey, fireAt, fireThrough, eventKeys } from './helpers'

describe('event table shape', () => {
  test('every event has a stable key and a round', () => {
    for (const e of HISTORICAL_EVENTS) {
      assert.ok(e.textKey.startsWith('event.'), `${e.textKey} is not namespaced`)
      assert.ok(Number.isFinite(e.round) && e.round >= 1, `${e.textKey} has no round`)
    }
  })

  test('a gated event that can never retry declares no attempts, and vice versa', () => {
    for (const e of HISTORICAL_EVENTS) {
      if (e.attempts !== undefined) assert.ok(e.gate, `${e.textKey} sets attempts without a gate`)
    }
  })

  test('two events ask the player a question', () => {
    const decisions = HISTORICAL_EVENTS.filter(e => e.choices)
    assert.deepEqual(decisions.map(e => e.textKey).sort(), ['event.conference', 'event.tekalif'])
    const tekalif = decisions.find(e => e.textKey === 'event.tekalif')
    assert.deepEqual(tekalif?.choices?.map(c => c.key), ['requisition', 'decline'])
    const conference = decisions.find(e => e.textKey === 'event.conference')
    assert.deepEqual(conference?.choices?.map(c => c.key), ['accept', 'reject'])
  })

  test('TBMM is ordered before everything that depends on the Assembly', () => {
    // fireEvents walks the table in order; a gate reading assemblyOpened on the
    // same turn TBMM fires must sit after it. This caught a real bug.
    const keys = eventKeys()
    const tbmm = keys.indexOf('event.tbmm')
    const dependants = [
      'event.inonu',
      'event.sakarya',
      'event.karsTreaty',
      'event.ankaraAgreement',
      'event.greatOffensive',
      'event.mudanya',
      'event.sultanate',
      'event.mubadele',
      'event.caliphate',
      'event.tekalif'
    ]
    for (const key of dependants) assert.ok(keys.indexOf(key) > tbmm, `${key} is evaluated before TBMM`)
  })
})

describe('fireEvents', () => {
  test('nothing fires before its round', () => {
    const g = fresh()
    assert.deepEqual(fireAt(g, 1), [])
  })

  test('an event fires exactly once', () => {
    const g = fresh()
    assert.ok(fireAt(g, 5).includes('event.tbmm'))
    assert.ok(!fireAt(g, 6).includes('event.tbmm'))
    assert.ok(!fireAt(g, 7).includes('event.tbmm'))
  })

  test('a late arrival still fires — rounds are a floor, not a window', () => {
    const g = fresh()
    // jump straight to round 9: everything due by then arrives at once
    const seen = fireAt(g, 9)
    assert.ok(seen.includes('event.erzurumCongress'))
    assert.ok(seen.includes('event.tbmm'))
    assert.ok(seen.includes('event.sevres'))
  })

  test('a failed one-shot gate burns the event for good', () => {
    const g = fresh()
    give(g, 'erzurum', faction(g, 'Armenia'))
    assert.ok(!fireAt(g, 2).includes('event.erzurumCongress'))
    give(g, 'erzurum', turkey(g))
    assert.ok(!fireAt(g, 3).includes('event.erzurumCongress'), 'retaking should not revive a burned event')
  })

  test('a gate with attempts waits instead of burning', () => {
    const g = fresh()
    give(g, 'ankara', faction(g, 'Greece'))
    assert.ok(!fireAt(g, 5).includes('event.tbmm'))
    assert.ok(!fireAt(g, 6).includes('event.tbmm'))
    give(g, 'ankara', turkey(g))
    assert.ok(fireAt(g, 7).includes('event.tbmm'), 'should fire once the gate passes')
  })

  test('an eliminated faction makes no news', () => {
    const g = fresh()
    const italy = faction(g, 'Italy')
    for (const t of [...italy.territories]) give(g, t.slug, turkey(g))
    assert.ok(italy.eliminated)
    assert.ok(!fireAt(g, 10).includes('event.italyWithdraws'))
  })

  test('a decision halts the pass and resumes after it is answered', () => {
    const g = fresh()
    // jump to 14 with Tekâlif still unanswered: the Great Offensive sits AFTER
    // it in the table and is also due, so it must wait behind the question
    g.round = 14
    g.phase = 'reinforce'
    g.pendingCards.length = 0
    g.fireEvents()
    assert.equal(g.pendingDecision?.textKey, 'event.tekalif')
    assert.ok(!g.pendingCards.includes('event.greatOffensive'), 'later events must wait behind a decision')
    g.resolveDecision('decline')
    assert.equal(g.pendingDecision, null)
    assert.ok(g.pendingCards.includes('event.greatOffensive'), 'the pass resumes once answered')
  })

  test('a decision reached on an AI seat is deferred, not consumed', () => {
    const g = fresh()
    fireAt(g, 9)
    g.currentPlayerIndex = g.players.findIndex(p => !p.isHuman)
    g.round = 10
    g.pendingCards.length = 0
    g.fireEvents()
    assert.equal(g.pendingDecision, null, 'the AI must not be asked')
    // and it is still available on the human's turn
    assert.ok(fireAt(g, 10).includes('event.tekalif'))
  })

  test('answering a decision runs only the chosen branch', () => {
    const a = fresh()
    fireAt(a, 9)
    fireAt(a, 10, 'requisition')
    assert.ok(a.requisitionActive, 'requisition should open the window')

    const b = fresh()
    fireAt(b, 9)
    fireAt(b, 10, 'decline')
    assert.equal(b.requisitionUntil, 0, 'declining should cost nothing')
  })

  test('clearEventCards empties the queue', () => {
    const g = fresh()
    fireAt(g, 9)
    assert.ok(g.pendingCards.length > 0)
    g.clearEventCards()
    assert.deepEqual(g.pendingCards, [])
  })

  test('a full campaign fires each event at most once', () => {
    const g = fresh()
    const seen = fireThrough(g, 1, 27)
    const counts = new Map<string, number>()
    for (const { key } of seen) counts.set(key, (counts.get(key) ?? 0) + 1)
    for (const [key, n] of counts) assert.equal(n, 1, `${key} fired ${n} times`)
  })

  test('a full campaign fires events no earlier than their round', () => {
    const g = fresh()
    for (const { round, key } of fireThrough(g, 1, 27)) {
      const scheduled = HISTORICAL_EVENTS.find(e => e.textKey === key)?.round as number
      assert.ok(round >= scheduled, `${key} fired at ${round}, scheduled ${scheduled}`)
    }
  })

  test('an undisturbed campaign fires the expected set', () => {
    const g = fresh()
    const fired = new Set(fireThrough(g, 1, 27).map(x => x.key))
    // every event should fire in a game where Turkey simply holds its start
    for (const key of eventKeys()) {
      if (key === 'event.istanbulOccupied') continue // Britain starts with İstanbul
      if (key === 'event.mudanya') continue // needs the Straits taken
      assert.ok(fired.has(key), `${key} never fired in a clean campaign`)
    }
  })
})
