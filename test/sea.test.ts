import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game, { SEA_LANES } from '../src/game/game'
import { fresh, give, faction, turkey } from './helpers'

// Puts the named faction in the seat, in the transfer phase, with a garrison at
// Salonica big enough to ship something out of.
const shipping = (name = 'Greece', garrison = 20) => {
  const g = fresh()
  g.currentPlayerIndex = g.players.findIndex(p => p.faction.name === name)
  g.phase = 'fortify'
  g.bySlug['salonica'].troops = garrison
  return g
}

describe('sea lanes', () => {
  test('Salonica and İzmir are joined across the Aegean', () => {
    const g = shipping()
    assert.deepEqual(g.seaTargets('salonica'), ['izmir'])
    assert.deepEqual(g.seaTargets('izmir'), ['salonica'], 'and the lane runs both ways')
  })

  test('a lane is drawn in open water, not on top of either port', () => {
    for (const lane of SEA_LANES) {
      const [x, y] = lane.at
      assert.ok(Number.isFinite(x) && Number.isFinite(y), 'the convoy has somewhere to be drawn')
      assert.equal(lane.ports.length, 2)
    }
  })

  test('a province with no lane can ship nowhere', () => {
    const g = shipping()
    assert.deepEqual(g.seaTargets('kozani'), [])
  })

  test('both ends have to be yours — this is a transfer, not a landing', () => {
    const g = shipping()
    give(g, 'izmir', turkey(g))
    assert.deepEqual(g.seaTargets('salonica'), [], 'you cannot ship into a port you have lost')
  })

  test('a garrison of one goes nowhere', () => {
    const g = shipping('Greece', 1)
    assert.deepEqual(g.seaTargets('salonica'), [])
  })
})

describe('who has a fleet', () => {
  test('Turkey has none — everything it moves goes overland', () => {
    const g = shipping('Turkey')
    give(g, 'salonica', turkey(g))
    give(g, 'izmir', turkey(g))
    assert.deepEqual(g.seaTargets('salonica'), [], 'no crossing for the nationalists')
    assert.equal(g.embark('salonica', 'izmir', 5), false)
  })

  test('nor does Bulgaria, which Neuilly left without a coast to sail from', () => {
    const g = shipping('Bulgaria')
    give(g, 'salonica', faction(g, 'Bulgaria'))
    give(g, 'izmir', faction(g, 'Bulgaria'))
    assert.deepEqual(g.seaTargets('salonica'), [])
  })

  test('Greece does, and it is the lane it actually used', () => {
    const g = shipping()
    assert.deepEqual(g.seaTargets('salonica'), ['izmir'])
  })
})

describe('a crossing takes two rounds', () => {
  test('the men leave the province at once and are at sea', () => {
    const g = shipping()
    const before = g.bySlug['salonica'].troops
    const izmir = g.bySlug['izmir'].troops
    assert.equal(g.embark('salonica', 'izmir', 5), true)
    assert.equal(g.bySlug['salonica'].troops, before - 5, 'gone from Macedonia')
    assert.equal(g.bySlug['izmir'].troops, izmir, 'and not yet in Anatolia')
    assert.equal(g.convoys.length, 1)
    assert.equal(g.convoys[0].troops, 5)
    assert.equal(g.convoys[0].arrives, g.round + 2)
  })

  test('they are in neither theatre while the crossing lasts', () => {
    const g = shipping()
    g.embark('salonica', 'izmir', 5)
    const greece = faction(g, 'Greece')
    const onLand = greece.territories.reduce((n, t) => n + t.troops, 0)
    assert.equal(greece.troopTotal, onLand, 'a convoy defends nothing')
  })

  test('they come ashore at the top of the turn two rounds on', () => {
    const g = shipping()
    g.embark('salonica', 'izmir', 5)
    const izmir = g.bySlug['izmir'].troops
    g.round += 1
    g.landConvoys()
    assert.equal(g.bySlug['izmir'].troops, izmir, 'still at sea after one round')
    g.round += 1
    g.landConvoys()
    assert.equal(g.bySlug['izmir'].troops, izmir + 5, 'ashore on the second')
    assert.equal(g.convoys.length, 0)
  })

  test('a convoy only lands on its owner’s turn', () => {
    const g = shipping()
    g.embark('salonica', 'izmir', 5)
    g.round += 2
    g.currentPlayerIndex = g.players.findIndex(p => p.faction.name === 'Bulgaria')
    g.landConvoys()
    assert.equal(g.convoys.length, 1, 'Sofia does not unload Greek transports')
  })
})

describe('a port lost while the ships are at sea', () => {
  test('turns the convoy around', () => {
    const g = shipping()
    g.embark('salonica', 'izmir', 5)
    const home = g.bySlug['salonica'].troops
    give(g, 'izmir', turkey(g))
    g.round += 2
    g.landConvoys()
    assert.equal(g.bySlug['izmir'].faction, turkey(g), 'İzmir stays Turkish')
    assert.equal(g.bySlug['salonica'].troops, home + 5, 'and the men are back where they sailed from')
    assert.equal(g.convoys.length, 0)
  })

  test('and with both ports gone they are lost at sea', () => {
    const g = shipping()
    g.embark('salonica', 'izmir', 5)
    give(g, 'izmir', turkey(g))
    give(g, 'salonica', faction(g, 'Bulgaria'))
    g.round += 2
    const bulgar = g.bySlug['salonica'].troops
    g.landConvoys()
    assert.equal(g.convoys.length, 0)
    assert.equal(g.bySlug['salonica'].troops, bulgar, 'they do not reinforce whoever took the harbour')
  })
})

describe('a crossing costs a transfer', () => {
  test('it spends the move, so you cannot ship and march in the same turn', () => {
    const g = shipping()
    assert.equal(g.embark('salonica', 'izmir', 5), true)
    assert.equal(g.fortify('salonica', 'kozani', 1), false, 'the transfer is spent')
    assert.deepEqual(g.seaTargets('salonica'), [], 'and so is the crossing')
  })

  test('a small garrison ships what it can spare and no more', () => {
    const g = shipping('Greece', 5)
    assert.equal(g.embark('salonica', 'izmir', 99), true)
    assert.equal(g.convoys[0].troops, 4, 'everything but the garrison')
    assert.equal(g.bySlug['salonica'].troops, 1)
  })

  test('but a port inside the Misak-ı Millî loads at half speed', () => {
    // sailing home out of İzmir is an occupier moving on occupied ground, and
    // that is slow whoever is doing it
    const g = shipping('Greece', 3)
    g.bySlug['izmir'].troops = 9
    assert.equal(g.embark('izmir', 'salonica', 99), true)
    assert.equal(g.convoys[0].troops, 4, 'half of the eight it could spare')
  })

  test('and tonnage caps what a large one can, however much it is holding', () => {
    const g = shipping('Greece', 40)
    g.embark('salonica', 'izmir', 99)
    assert.equal(g.convoys[0].troops, 6, 'a hull carries what a hull carries')
    assert.equal(g.bySlug['salonica'].troops, 34, 'the rest stays in Macedonia')
  })

  test('the ceiling holds no matter how big the army gets', () => {
    for (const garrison of [13, 20, 50, 200]) {
      const g = shipping('Greece', garrison)
      g.embark('salonica', 'izmir', 99)
      assert.equal(g.convoys[0].troops, 6, `${garrison} still ships 6`)
    }
  })

  test('it cuts the rescue as well as the offensive', () => {
    // the lane is not an escape hatch either: an army caught in Anatolia comes
    // home six at a time, which is the point of a tonnage limit
    const g = shipping('Greece', 3)
    g.bySlug['izmir'].troops = 30
    g.currentPlayerIndex = g.players.findIndex(p => p.faction.name === 'Greece')
    g.embark('izmir', 'salonica', 99)
    assert.equal(g.convoys[0].troops, 6)
  })

  test('the garrison itself never sails', () => {
    const g = shipping('Greece', 3)
    g.embark('salonica', 'izmir', 99)
    assert.ok(g.bySlug['salonica'].troops >= 1, 'somebody is always left holding the port')
  })
})

describe('convoys survive a save', () => {
  test('a crossing in progress is still in progress after a reload', () => {
    const g = shipping()
    g.embark('salonica', 'izmir', 5)
    const restored = new Game()
    restored.restore(JSON.parse(JSON.stringify(g.serialize())))
    assert.equal(restored.convoys.length, 1)
    assert.deepEqual(restored.convoys[0], g.convoys[0])
  })

  test('an old save with no convoys in it loads clean', () => {
    const g = fresh()
    const save = JSON.parse(JSON.stringify(g.serialize()))
    delete save.convoys
    const restored = new Game()
    restored.restore(save)
    assert.deepEqual(restored.convoys, [])
  })
})

describe('moving on occupied ground is slower than moving at home', () => {
  const at = (name: string, slug: string, troops: number) => {
    const g = fresh()
    give(g, slug, faction(g, name))
    g.bySlug[slug].troops = troops
    return g
  }

  test('an occupier inside the Misak-ı Millî moves half of what it can spare', () => {
    const g = at('Greece', 'izmir', 11)
    assert.equal(g.movable(g.bySlug['izmir']), 5, 'ten spare, five march')
  })

  test('the same army moves at full speed on its own ground', () => {
    const g = at('Greece', 'salonica', 11)
    assert.equal(g.movable(g.bySlug['salonica']), 10, 'Macedonia is not occupied ground')
  })

  test('it is the ground, not the flag: every occupier feels it', () => {
    for (const [name, slug] of [
      ['Britain', 'istanbul'],
      ['France', 'adana'],
      ['Italy', 'antalya'],
      ['Armenia', 'kars'],
      ['Bulgaria', 'edirne']
    ] as const) {
      const g = at(name, slug, 11)
      assert.equal(g.movable(g.bySlug[slug]), 5, `${name} in ${slug}`)
    }
  })

  test('and Turkey does not — it is the interior line, and it is home', () => {
    const g = at('Turkey', 'izmir', 11)
    assert.equal(g.movable(g.bySlug['izmir']), 10)
    assert.equal(g.movable(g.bySlug['ankara']), g.bySlug['ankara'].troops - 1)
  })

  test('an occupier outside the Pact is unhindered too', () => {
    const g = at('Britain', 'baghdad', 11)
    assert.equal(g.movable(g.bySlug['baghdad']), 10, 'Mesopotamia is not the quarrel')
  })

  test('a garrison of one releases nobody, wherever it stands', () => {
    assert.equal(at('Greece', 'izmir', 1).movable(at('Greece', 'izmir', 1).bySlug['izmir']), 0)
  })

  test('the transfer phase honours it', () => {
    const g = fresh()
    give(g, 'izmir', faction(g, 'Greece'))
    give(g, 'aydin', faction(g, 'Greece'))
    g.bySlug['izmir'].troops = 11
    g.bySlug['aydin'].troops = 1
    g.currentPlayerIndex = g.players.findIndex(p => p.faction.name === 'Greece')
    g.phase = 'fortify'
    assert.equal(g.fortify('izmir', 'aydin', 99), true)
    assert.equal(g.bySlug['aydin'].troops, 6, 'five arrived')
    assert.equal(g.bySlug['izmir'].troops, 6)
  })
})
