// A transfer order is two clicks, and either one can be taken back. Pressing
// the destination used to fall through to the "pick a new source" branch, which
// moved the source onto the destination and left the destination standing: the
// amount panel then described a province transferring into itself, and offered
// that province's own garrison to do it with.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import type Game from '../src/game/game'
import {
  NO_FORTIFY_SELECTION,
  fortifyTargets,
  resolveFortifyClick,
  type FortifySelection,
} from '../src/components/game/hooks/fortify-selection'
import { fresh, faction, give, turkey } from './helpers'

/** Turkey in the transfer phase, every province holding enough to move. */
const transferring = (garrison = 10) => {
  const g = fresh()
  g.turn.configure({ phase: 'fortify' })
  for (const territory of turkey(g).territories) territory.troops = garrison
  return g
}

/** A source with at least two places to send troops, so retargeting has somewhere to go. */
const route = (g: Game) => {
  const from = turkey(g).territories.find((territory) => fortifyTargets(g, territory.slug).length > 1)
  assert.ok(from, 'the opening board gives Turkey a province with two transfer targets')
  const [to, other] = fortifyTargets(g, from.slug)
  return { from: from.slug, to, other }
}

/** The state the amount panel is drawn from: source and destination both chosen. */
const ordered = (g: Game): FortifySelection => {
  const { from, to } = route(g)
  return { selected: from, fortifyTarget: to }
}

describe('fortify selection', () => {
  test('the first press arms a source, the second sets its destination', () => {
    const g = transferring()
    const { from, to } = route(g)
    const armed = resolveFortifyClick(g, NO_FORTIFY_SELECTION, from)
    assert.deepEqual(armed, { selected: from, fortifyTarget: null })
    assert.deepEqual(resolveFortifyClick(g, armed, to), { selected: from, fortifyTarget: to })
  })

  test('pressing the source calls the whole transfer off', () => {
    const g = transferring()
    assert.deepEqual(resolveFortifyClick(g, ordered(g), ordered(g).selected!), NO_FORTIFY_SELECTION)
  })

  test('pressing the destination hands back the destination and keeps the source', () => {
    const g = transferring()
    const state = ordered(g)
    assert.deepEqual(resolveFortifyClick(g, state, state.fortifyTarget!), {
      selected: state.selected,
      fortifyTarget: null,
    })
  })

  test('pressing another legal destination redirects the transfer', () => {
    const g = transferring()
    const { from, to, other } = route(g)
    assert.deepEqual(resolveFortifyClick(g, { selected: from, fortifyTarget: to }, other), {
      selected: from,
      fortifyTarget: other,
    })
  })

  test('pressing a third province takes the stale destination with it', () => {
    const g = transferring()
    const { from, to } = route(g)
    const elsewhere = turkey(g).territories.find(
      (territory) =>
        territory.slug !== from && territory.slug !== to && !fortifyTargets(g, from).includes(territory.slug),
    )
    assert.ok(elsewhere, 'Turkey holds a province that is not on this route')
    assert.deepEqual(resolveFortifyClick(g, { selected: from, fortifyTarget: to }, elsewhere.slug), {
      selected: elsewhere.slug,
      fortifyTarget: null,
    })
  })

  test('no press can leave a province transferring into itself', () => {
    const g = transferring()
    const state = ordered(g)
    for (const territory of g.territories) {
      const next = resolveFortifyClick(g, state, territory.slug)
      assert.ok(
        !next.selected || next.selected !== next.fortifyTarget,
        `pressing ${territory.slug} pointed ${next.selected} at itself`,
      )
    }
  })

  test('a garrison of one cannot be marched out of, so it takes no order', () => {
    const g = transferring()
    const { from, to } = route(g)
    const spent = turkey(g).territories.find(
      (territory) =>
        territory.slug !== from && territory.slug !== to && !fortifyTargets(g, from).includes(territory.slug),
    )!
    spent.troops = 1
    const state = { selected: from, fortifyTarget: to }
    assert.deepEqual(resolveFortifyClick(g, state, spent.slug), state)
  })

  test('somebody else’s province is not an order either', () => {
    const g = transferring()
    const state = ordered(g)
    const theirs = g.territories.find((territory) => territory.faction !== turkey(g))!
    assert.deepEqual(resolveFortifyClick(g, state, theirs.slug), state)
  })

  test('once the transfers are spent, nothing on the map answers', () => {
    const g = transferring()
    const state = ordered(g)
    g.turn.configure({ fortifiesUsed: g.campaign.fortifyLimit })
    for (const territory of g.territories) assert.deepEqual(resolveFortifyClick(g, state, territory.slug), state)
  })

  test('nothing is a target outside the transfer phase, or on somebody else’s turn', () => {
    const g = transferring()
    const { from } = route(g)
    assert.ok(fortifyTargets(g, from).length > 0)
    g.turn.configure({ phase: 'attack' })
    assert.deepEqual(fortifyTargets(g, from), [])
    g.turn.configure({ phase: 'fortify' })
    g.turn.configure({ playerIndex: g.players.findIndex((player) => !player.isHuman) })
    assert.deepEqual(fortifyTargets(g, from), [])
  })

  test('every destination it offers is an order the engine accepts', () => {
    const g = transferring()
    for (const own of turkey(g).territories) {
      for (const slug of fortifyTargets(g, own.slug)) {
        // Each pair is an independent probe of target/order agreement, not a
        // second transfer inside one faction's turn.
        g.turn.configure({ fortifiesUsed: 0 })
        const overland = g.bySlug[own.slug].isAdjacentTo(g.bySlug[slug])
        const accepted = overland ? g.movement.fortify(own.slug, slug, 1) : g.movement.embark(own.slug, slug, 1)
        assert.equal(accepted, true, `${own.slug} → ${slug} was offered but refused`)
      }
    }
  })

  test('and a destination it withholds is one the engine would refuse', () => {
    const g = transferring()
    const { from } = route(g)
    const offered = fortifyTargets(g, from)
    for (const next of g.bySlug[from].adjacent) {
      if (offered.includes(next.slug)) continue
      g.turn.configure({ fortifiesUsed: 0 })
      assert.equal(g.movement.fortify(from, next.slug, 1), false, `${from} → ${next.slug} was hidden but allowed`)
    }
  })

  test('a province lost mid-turn stops being a destination', () => {
    const g = transferring()
    const { from, to } = route(g)
    assert.ok(fortifyTargets(g, from).includes(to))
    give(g, to, faction(g, 'Greece'))
    assert.ok(!fortifyTargets(g, from).includes(to), 'and so cannot be pressed into an order')
  })
})
