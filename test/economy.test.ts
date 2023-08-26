import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { fresh, give, faction, turkey, PACT, fireAt, roundOfEvent } from './helpers'

const levy = (g: Game, name = 'Turkey') => g.reinforcementsFor(faction(g, name))

describe('Turkish levy stages', () => {
  test('improves at the Assembly and again at the Great Offensive', () => {
    const g = fresh()
    g.assemblyOpened = false
    g.round = 3
    const irregular = levy(g)
    g.assemblyOpened = true
    g.round = 8
    const assembly = levy(g)
    g.round = 14
    const offensive = levy(g)
    assert.ok(assembly > irregular, 'the Assembly should raise more')
    assert.ok(offensive > assembly, 'full mobilization should raise more still')
  })

  test('follows the Assembly flag, not the calendar', () => {
    const g = fresh()
    g.round = 8
    g.assemblyOpened = false
    const without = levy(g)
    g.assemblyOpened = true
    const with_ = levy(g)
    assert.ok(with_ > without)
  })

  test('never drops below the floor of 2', () => {
    const g = fresh()
    for (const t of [...turkey(g).territories]) give(g, t.slug, faction(g, 'Greece'))
    give(g, 'ankara', turkey(g))
    g.round = 3
    assert.ok(levy(g) >= 2)
  })
})

describe('Sèvres', () => {
  test('halves the levy for two rounds then leaves a standing bonus', () => {
    const g = fresh()
    g.assemblyOpened = true
    g.round = 6
    const base = levy(g)
    g.sevresRound = 6
    assert.ok(levy(g) < base, 'shock round 1')
    g.round = 7
    assert.ok(levy(g) < base + 1, 'shock round 2')
    // compare at a single round so the Soviet-aid bump at t7 does not confound it
    g.round = 8
    const shocked = levy(g)
    g.sevresRound = 0
    assert.equal(shocked, levy(g) + 1, 'and permanently better afterwards')
  })
})

describe('the requisition costs what the card promises', () => {
  test('exactly −3 a turn while open', () => {
    const g = fresh()
    g.assemblyOpened = true
    g.round = 11
    g.requisitionUntil = 0
    const off = levy(g)
    g.requisitionUntil = 12
    assert.equal(levy(g), off - 3)
  })

  test('and nothing once it closes', () => {
    const g = fresh()
    g.assemblyOpened = true
    g.round = 13
    g.requisitionUntil = 12
    const closed = levy(g)
    g.requisitionUntil = 0
    assert.equal(levy(g), closed)
  })

  test('freezes militia growth while open', () => {
    const g = fresh()
    const sivas = g.bySlug['sivas']
    g.round = 11
    g.requisitionUntil = 12
    const before = sivas.troops
    for (let i = 0; i < 8; i++) g.entrench()
    assert.equal(sivas.troops, before, 'no militia while the countryside is stripped')
  })
})

describe('occupier levies', () => {
  test('Greece raises men at home whatever happens in Anatolia', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    for (const t of [...greece.territories]) if (PACT.includes(t.slug)) give(g, t.slug, turkey(g))
    g.round = 16
    g.greeceCollapsed = true
    assert.ok(levy(g, 'Greece') >= 1, 'Selanik and Thrace keep recruiting')
  })

  test('the Anatolian half is what dries up', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    for (const slug of ['balikesir', 'usak', 'kutahya', 'eskisehir']) give(g, slug, greece)
    g.round = 6
    const occupying = levy(g, 'Greece')
    g.greeceCollapsed = true
    const collapsed = levy(g, 'Greece')
    assert.ok(collapsed < occupying, 'the occupation levy should stop')
  })

  test('exhaustion caps the levy at what a power raises off its own soil', () => {
    const g = fresh()
    g.round = 16
    // Bulgaria holds no Pact province at all, so exhaustion cannot touch it
    assert.ok(levy(g, 'Bulgaria') >= 1)
    // Britain holds mostly Pact provinces, so it is gutted
    assert.equal(levy(g, 'Britain'), 0)
  })

  test('Armenia stops fielding troops after Gümrü unless provoked', () => {
    const g = fresh()
    g.round = 9
    assert.equal(levy(g, 'Armenia'), 0)
    faction(g, 'Armenia').peaceBroken = true
    assert.ok(levy(g, 'Armenia') > 0, 'breaking the peace re-mobilizes them')
  })

  test('the field levy holds through 1921 and thins only at Sakarya', () => {
    // the royalist army kept advancing after Venizelos fell — the decline is
    // military, at Sakarya, not political, at his fall
    const g = fresh()
    const greece = faction(g, 'Greece')
    for (const slug of ['balikesir', 'usak', 'kutahya', 'eskisehir', 'konya', 'antalya']) give(g, slug, greece)
    g.round = 6
    const peak = levy(g, 'Greece')
    g.round = 8 // Venizelos has fallen (round 7), but the army is still advancing
    assert.equal(levy(g, 'Greece'), peak, 'his fall costs no field division')
    g.round = 11 // Sakarya halts the advance
    assert.equal(levy(g, 'Greece'), peak - 1, 'now the levy thins')
  })
})

describe('militia and entrenchment', () => {
  test('Turkish militia ticks +1 every four rounds', () => {
    const g = fresh()
    const sivas = g.bySlug['sivas']
    const start = sivas.troops
    const ticks: number[] = []
    for (let r = 1; r <= 24; r++) {
      g.round = r
      const before = sivas.troops
      g.entrench()
      if (sivas.troops > before) ticks.push(r)
    }
    assert.deepEqual(ticks, [4, 8, 12], 'ticks on the fourth, eighth and twelfth rounds')
    assert.equal(sivas.troops, start + 3)
  })

  test('the militia cap of 4 is unreachable in practice', () => {
    // Growth is +1 every 4 rounds and stops dead at the Great Offensive on t14,
    // so a province can only ever tick three times. TR_ENTRENCH_MAX = 4 is one
    // higher than anything the calendar allows.
    const g = fresh()
    const sivas = g.bySlug['sivas']
    const start = sivas.troops
    for (let r = 1; r <= 40; r++) {
      g.round = r
      g.entrench()
    }
    assert.equal(sivas.troops - start, 3, 'three is the real ceiling, not four')
  })

  test('militia growth ends at the Great Offensive', () => {
    const g = fresh()
    const sivas = g.bySlug['sivas']
    g.round = 14
    const before = sivas.troops
    for (let i = 0; i < 12; i++) g.entrench()
    assert.equal(sivas.troops, before)
  })

  test('invader entrenchment is +1 every two rounds, capped at 6', () => {
    const g = fresh()
    const izmir = g.bySlug['izmir']
    const start = izmir.troops
    for (let r = 1; r <= 13; r++) {
      g.round = r
      g.entrench()
    }
    assert.equal(izmir.troops - start, 6)
  })

  test('invader entrenchment stops at exhaustion', () => {
    const g = fresh()
    const izmir = g.bySlug['izmir']
    g.round = 14
    const before = izmir.troops
    for (let i = 0; i < 8; i++) g.entrench()
    assert.equal(izmir.troops, before)
  })

  test('only Pact provinces entrench for an occupier', () => {
    const g = fresh()
    const sofia = g.bySlug['sofia']
    const before = sofia.troops
    for (let r = 1; r <= 12; r++) {
      g.round = r
      g.entrench()
    }
    assert.equal(sofia.troops, before, 'Bulgaria does not dig in at home')
  })

  test('a province that changes hands is not dug in', () => {
    const g = fresh()
    const izmir = g.bySlug['izmir']
    for (let r = 1; r <= 9; r++) {
      g.round = r
      g.entrench()
    }
    assert.ok(izmir.entrenched > 0)
    give(g, 'izmir', turkey(g))
    assert.equal(izmir.entrenched, 0)
    assert.equal(izmir.quietTurns, 0)
  })
})

describe('Ankara levy', () => {
  test('adds one unit a turn while Turkey holds it', () => {
    const g = fresh()
    const before = g.bySlug['ankara'].troops
    g.ankaraLevy()
    assert.equal(g.bySlug['ankara'].troops, before + 1)
  })

  test('and nothing while it is occupied', () => {
    const g = fresh()
    give(g, 'ankara', faction(g, 'Greece'))
    const before = g.bySlug['ankara'].troops
    g.ankaraLevy()
    assert.equal(g.bySlug['ankara'].troops, before)
  })
})

describe('one-off grants', () => {
  test('Moscow lands +5 exactly once', () => {
    const g = fresh()
    g.round = 9
    const base = levy(g)
    g.startTurn()
    assert.equal(g.reinforcementsLeft, base + 5)
    const second = g.reinforcementsFor(turkey(g))
    g.startTurn()
    assert.equal(g.reinforcementsLeft, second, 'not granted twice')
  })

  test('the Great Offensive grants no troops', () => {
    const g = fresh()
    g.round = 14
    g.grantsTaken.add('sovietAid2')
    const base = levy(g)
    g.startTurn()
    assert.equal(g.reinforcementsLeft, base)
  })

  test('fortify limit rises with the Sultanate', () => {
    const g = fresh()
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    assert.equal(g.fortifyLimit, 2)
    fireAt(g, 15)
    assert.equal(g.fortifyBonus, 1)
    assert.equal(g.fortifyLimit, 3)
  })
})

describe('Salonica levies for Greece the way Ankara does for Turkey', () => {
  test('it raises a unit every round while Greece holds it', () => {
    const g = fresh()
    const before = g.bySlug['salonica'].troops
    g.salonicaLevy()
    g.salonicaLevy()
    assert.equal(g.bySlug['salonica'].troops, before + 2)
  })

  test('a Salonica in somebody else’s hands raises nobody', () => {
    const g = fresh()
    give(g, 'salonica', faction(g, 'Bulgaria'))
    const before = g.bySlug['salonica'].troops
    g.salonicaLevy()
    assert.equal(g.bySlug['salonica'].troops, before, 'Sofia does not recruit for Athens')
  })

  test('and it stops the day Venizelos loses the election', () => {
    const g = fresh()
    const before = g.bySlug['salonica'].troops
    g.salonicaLevy()
    assert.equal(g.bySlug['salonica'].troops, before + 1)
    g.venizelosFell = true
    g.salonicaLevy()
    assert.equal(g.bySlug['salonica'].troops, before + 1, 'the royalists raise nothing here')
  })

  test('an army that has collapsed does not levy either', () => {
    const g = fresh()
    g.greeceCollapsed = true
    const before = g.bySlug['salonica'].troops
    g.salonicaLevy()
    assert.equal(g.bySlug['salonica'].troops, before)
  })

  test('the election itself is what stops it, not the calendar', () => {
    // the card is gated — with Ankara Greek or no Assembly he stays — and the
    // levy has to follow the card, not the date it would usually fall on
    const g = fresh()
    g.assemblyOpened = true
    assert.equal(g.venizelosFell, false)
    fireAt(g, roundOfEvent('event.venizelos'))
    assert.equal(g.venizelosFell, true, 'the card sets it')

    const held = fresh()
    held.assemblyOpened = true
    give(held, 'ankara', faction(held, 'Greece'))
    fireAt(held, roundOfEvent('event.venizelos'))
    assert.equal(held.venizelosFell, false, 'a war that looks won keeps him in office')
    const before = held.bySlug['salonica'].troops
    held.salonicaLevy()
    assert.equal(held.bySlug['salonica'].troops, before + 1, 'and Salonica keeps levying')
  })

  test('it survives a save', () => {
    const g = fresh()
    g.venizelosFell = true
    const restored = new Game()
    restored.restore(JSON.parse(JSON.stringify(g.serialize())))
    assert.equal(restored.venizelosFell, true)
  })
})

describe('Greek levy is one force, not two floored buckets', () => {
  const VENIZELOS = roundOfEvent('event.venizelos')

  test('a healthy Greece raises the flat rate, not less', () => {
    // seven provinces at a third is two — the same any other power gets. The
    // old split floored home and occupied apart and handed Greece one, below
    // the floor everyone else stands on.
    const g = fresh()
    g.round = 1
    assert.equal(levy(g, 'Greece'), 2, 'floor(7/3), not floor(5/3)+floor(2/3)')
  })

  test('it never drops below the flat rate while Venizelos stands', () => {
    const g = fresh()
    g.round = VENIZELOS - 1
    assert.ok(levy(g, 'Greece') >= 2)
  })

  test('a larger Greece scales with the whole of it', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    let added = 0
    for (const t of [...turkey(g).territories]) {
      if (added >= 5) break
      give(g, t.slug, greece)
      added++
    }
    g.round = 1
    assert.equal(levy(g, 'Greece'), 4, 'floor(12/3), not the split 3')
  })

  test('Venizelos’ defeat leaves the field levy standing — it is Sakarya that thins it', () => {
    const peakAt = (round: number) => {
      const g = fresh()
      g.round = round
      return levy(g, 'Greece')
    }
    const peak = peakAt(VENIZELOS - 1)
    assert.equal(peakAt(VENIZELOS), peak, 'his fall is political, not a lost division')
    assert.equal(peakAt(roundOfEvent('event.sakarya')), Math.max(1, peak - 1), 'the advance halted, the levy thins')
  })

  test('collapse leaves only what the homeland raises', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    // hand it more Anatolia, then collapse it — the occupation levy should go,
    // the home levy stay
    let added = 0
    for (const t of [...turkey(g).territories]) {
      if (added >= 5) break
      give(g, t.slug, greece)
      added++
    }
    g.greeceCollapsed = true
    const home = greece.territories.filter(t => !PACT.includes(t.slug)).length
    assert.equal(levy(g, 'Greece'), Math.max(1, Math.floor(home / 3)))
  })
})

describe('the Greek summer offensive of 1921', () => {
  const OFFENSIVE = roundOfEvent('event.greekOffensive')

  test('it lands in July 1921, between İnönü and Sakarya', () => {
    assert.ok(OFFENSIVE > roundOfEvent('event.inonu'))
    assert.ok(OFFENSIVE < roundOfEvent('event.sakarya'))
  })

  test('it reinforces and digs in the Greek front in Anatolia', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    give(g, 'balikesir', greece) // a Pact province bordering Turkish ground
    const front = g.bySlug['balikesir']
    front.entrenched = 0
    const before = front.troops
    g.greekSummerOffensive()
    assert.ok(front.troops > before, 'the spearhead is reinforced')
    assert.ok(front.entrenched >= 1, 'and dug in')
  })

  test('it only touches the frontline, not a rear province', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    // izmir is Greek but every neighbour of a deep-rear province may be Greek —
    // pick one with no Turkish neighbour by clearing around it
    const rear = g.bySlug['rhodes'] // an island, no Turkish land border
    const before = rear.troops
    g.greekSummerOffensive()
    assert.equal(rear.troops, before, 'the islands are not the front')
  })

  test('a collapsed or eliminated Greece mounts nothing', () => {
    const g = fresh()
    g.greeceCollapsed = true
    const front = g.bySlug['izmir']
    const before = front.troops
    g.greekSummerOffensive()
    assert.equal(front.troops, before)
  })

  test('the card gate holds while Greece still fights on Anatolian soil', () => {
    const g = fresh()
    assert.ok(fireAt(g, OFFENSIVE).includes('event.greekOffensive'))
  })

  test('but not once Greece is off the mainland', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    for (const t of [...greece.territories]) if (PACT.includes(t.slug)) give(g, t.slug, turkey(g))
    assert.ok(!fireAt(g, OFFENSIVE).includes('event.greekOffensive'), 'no front, no offensive')
  })
})
