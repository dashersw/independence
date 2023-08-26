import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { applyEvent, fresh, give, turkey, PACT, findBorder } from './helpers'

/** Take a province with overwhelming force and report the militia bonus. */
const liberate = (round: number, heldSince: number, wantPact = true, offensive = false) => {
  const g = fresh()
  const { from, to } = findBorder(g, (slug) => (wantPact ? PACT.includes(slug) : !PACT.includes(slug)))
  to.heldSince = heldSince
  from.troops = 200
  to.troops = 1
  g.turn.configure({ round: round })
  if (offensive) applyEvent(g, 'event.greatOffensive')
  g.turn.configure({ phase: 'attack' })
  g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
  g.combat.begin(from.slug, to.slug)
  const result = g.combat.blitz(from.slug, to.slug)
  assert.ok(result?.conquered, 'the attack should have taken the province')
  return { bonus: to.troops - (result?.troopsMoved as number), game: g, to }
}

describe('liberation before the Great Offensive', () => {
  test('a province snatched back within a turn draws +2', () => {
    assert.equal(liberate(11, 10).bonus, 2)
    assert.equal(liberate(11, 11).bonus, 2, 'taken back the same round counts as swift')
  })

  test('a province the occupier has settled into draws +1', () => {
    assert.equal(liberate(11, 9).bonus, 1)
    assert.equal(liberate(11, 4).bonus, 1)
  })

  test('the boundary is exactly one turn of occupation', () => {
    assert.equal(liberate(12, 11).bonus, 2, 'held 1 turn — swift')
    assert.equal(liberate(12, 10).bonus, 1, 'held 2 turns — settled')
  })

  test('non-Pact provinces cannot even be attacked before the Pact is complete', () => {
    // the restraint rule bars them, so there is no liberation to speak of
    assert.throws(() => liberate(11, 10, false), /should have taken/)
  })

  test('and draw no militia once the Pact is complete and they are legal targets', () => {
    const g = fresh()
    for (const slug of PACT) give(g, slug, turkey(g), 1)
    // the Pact is complete, so the restraint rule lifts — but the war only ends
    // once it has been held, so there is still a turn to fight in
    const { from, to } = findBorder(g, (slug) => !PACT.includes(slug))
    from.troops = 200
    to.troops = 1
    g.turn.configure({ round: 11 })
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    g.combat.begin(from.slug, to.slug)
    const result = g.combat.blitz(from.slug, to.slug)
    assert.equal(result?.conquered, true)
    assert.equal(to.troops - (result?.troopsMoved as number), 0, 'no militia outside the homeland')
  })
})

describe('liberation from the Great Offensive', () => {
  test('tenure stops mattering — both cases draw +1', () => {
    assert.equal(liberate(14, 13, true, true).bonus, 1)
    assert.equal(liberate(14, 6, true, true).bonus, 1)
    assert.equal(liberate(20, 6, true, true).bonus, 1)
  })

  test('only the first province freed each turn draws anything', () => {
    const g = fresh()
    g.turn.configure({ round: 16 })
    applyEvent(g, 'event.greatOffensive')
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    g.turn.configure({ liberatedHomeland: false })
    const bonuses: number[] = []
    for (let n = 0; n < 3; n++) {
      let taken = false
      for (const own of turkey(g).territories) {
        if (taken) break
        for (const next of own.adjacent) {
          if (next.faction === turkey(g) || !PACT.includes(next.slug)) continue
          next.heldSince = 6
          own.troops = 200
          next.troops = 1
          g.combat.begin(own.slug, next.slug)
          const r = g.combat.blitz(own.slug, next.slug)
          if (r?.conquered) {
            bonuses.push(next.troops - (r.troopsMoved as number))
            taken = true
          }
          break
        }
      }
    }
    assert.equal(bonuses[0], 1, 'the first draws a garrison')
    for (const b of bonuses.slice(1)) assert.equal(b, 0, 'the rest draw nothing')
  })

  test('the allowance resets on the next turn', () => {
    const g = fresh()
    g.turn.configure({ round: 16 })
    g.turn.configure({ liberatedHomeland: true })
    g.turn.start()
    assert.equal(g.turn.liberatedHomeland, false)
  })
})

describe('tenure bookkeeping', () => {
  test('changeControl stamps the round a province was taken', () => {
    const g = fresh()
    const izmir = g.bySlug['izmir']
    g.board.changeControl(izmir, turkey(g), 9)
    assert.equal(izmir.heldSince, 9)
  })

  test('conquest stamps the current round', () => {
    const { game, to } = liberate(11, 4)
    assert.equal(to.heldSince, game.turn.round)
  })

  test('a fresh game starts everything at round 1', () => {
    const g = new Game()
    for (const t of g.territories) assert.equal(t.heldSince, 1)
  })
})
