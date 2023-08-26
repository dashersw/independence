import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { SEA_LANES } from '../src/game/movement'
import { restoreGame, snapshotGame } from '../src/game/snapshot'
import { fresh, give, faction, turkey } from './helpers'

// Puts the named faction in the seat, in the transfer phase, with a garrison at
// Salonica big enough to ship something out of.
const shipping = (name = 'Greece', garrison = 20) => {
  const g = fresh()
  g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction.name === name) })
  g.turn.configure({ phase: 'fortify' })
  g.bySlug['salonica'].troops = garrison
  return g
}

describe('sea lanes', () => {
  test('Salonica reaches İzmir and the islands across the Aegean', () => {
    const g = shipping()
    g.bySlug['lesbos'].troops = 5
    g.bySlug['rhodes'].troops = 5
    assert.deepEqual(g.movement.seaTargets('salonica'), ['izmir', 'lesbos', 'rhodes'])
    assert.deepEqual(g.movement.seaTargets('izmir'), ['salonica'], 'and the İzmir lane runs both ways')
    assert.deepEqual(g.movement.seaTargets('lesbos'), ['salonica'], 'as does the one to Lesbos')
    assert.deepEqual(g.movement.seaTargets('rhodes'), ['salonica'], 'and the one to Rhodes')
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
    assert.deepEqual(g.movement.seaTargets('kozani'), [])
  })

  test('both ends have to be yours — this is a transfer, not a landing', () => {
    const g = shipping()
    give(g, 'izmir', turkey(g))
    assert.ok(!g.movement.seaTargets('salonica').includes('izmir'), 'you cannot ship into a port you have lost')
  })

  test('a garrison of one goes nowhere', () => {
    const g = shipping('Greece', 1)
    assert.deepEqual(g.movement.seaTargets('salonica'), [])
  })
})

describe('who has a fleet', () => {
  test('Turkey has none — everything it moves goes overland', () => {
    const g = shipping('Turkey')
    give(g, 'salonica', turkey(g))
    give(g, 'izmir', turkey(g))
    assert.deepEqual(g.movement.seaTargets('salonica'), [], 'no crossing for the nationalists')
    assert.equal(g.movement.embark('salonica', 'izmir', 5), false)
  })

  test('nor does Bulgaria, which Neuilly left without a coast to sail from', () => {
    const g = shipping('Bulgaria')
    give(g, 'salonica', faction(g, 'Bulgaria'))
    give(g, 'izmir', faction(g, 'Bulgaria'))
    assert.deepEqual(g.movement.seaTargets('salonica'), [])
  })

  test('Greece does, and it is the lane it actually used', () => {
    const g = shipping()
    assert.deepEqual(g.movement.seaTargets('salonica'), ['izmir', 'lesbos', 'rhodes'])
  })
})

describe('a crossing takes two rounds', () => {
  test('the men leave the province at once and are at sea', () => {
    const g = shipping()
    const before = g.bySlug['salonica'].troops
    const izmir = g.bySlug['izmir'].troops
    assert.equal(g.movement.embark('salonica', 'izmir', 5), true)
    assert.equal(g.bySlug['salonica'].troops, before - 5, 'gone from Macedonia')
    assert.equal(g.bySlug['izmir'].troops, izmir, 'and not yet in Anatolia')
    assert.equal(g.movement.convoys.length, 1)
    assert.equal(g.movement.convoys[0].troops, 5)
    assert.equal(g.movement.convoys[0].arrives, g.turn.round + 2)
  })

  test('they are in neither theatre while the crossing lasts', () => {
    const g = shipping()
    g.movement.embark('salonica', 'izmir', 5)
    const greece = faction(g, 'Greece')
    const onLand = greece.territories.reduce((n, t) => n + t.troops, 0)
    assert.equal(greece.troopTotal, onLand, 'a convoy defends nothing')
  })

  test('they come ashore at the top of the turn two rounds on', () => {
    const g = shipping()
    g.movement.embark('salonica', 'izmir', 5)
    const izmir = g.bySlug['izmir'].troops
    g.turn.configure({ round: g.turn.round + 1 })
    g.movement.landConvoys()
    assert.equal(g.bySlug['izmir'].troops, izmir, 'still at sea after one round')
    g.turn.configure({ round: g.turn.round + 1 })
    g.movement.landConvoys()
    assert.equal(g.bySlug['izmir'].troops, izmir + 5, 'ashore on the second')
    assert.equal(g.movement.convoys.length, 0)
  })

  test('a convoy only lands on its owner’s turn', () => {
    const g = shipping()
    g.movement.embark('salonica', 'izmir', 5)
    g.turn.configure({ round: g.turn.round + 2 })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction.name === 'Bulgaria') })
    g.movement.landConvoys()
    assert.equal(g.movement.convoys.length, 1, 'Sofia does not unload Greek transports')
  })
})

describe('a port lost while the ships are at sea', () => {
  test('the AI turns a hopeless landing around — and the voyage home is another two rounds', () => {
    const g = shipping()
    g.movement.embark('salonica', 'izmir', 5)
    const home = g.bySlug['salonica'].troops
    give(g, 'izmir', turkey(g))
    g.bySlug['izmir'].troops = 12 // far too strong to storm with five
    g.turn.configure({ round: g.turn.round + 2 })
    g.movement.landConvoys()
    assert.equal(g.bySlug['izmir'].faction, turkey(g), 'İzmir stays Turkish')
    assert.equal(g.bySlug['salonica'].troops, home, 'the men are not home yet — they are still sailing back')
    assert.equal(g.movement.convoys.length, 1, 'a return crossing is under way')
    assert.equal(g.movement.convoys[0].returning, true)
    assert.equal(g.movement.convoys[0].to, 'salonica')
    assert.equal(g.movement.convoys[0].arrives, g.turn.round + 2, 'two more rounds at sea')
    g.turn.configure({ round: g.turn.round + 2 })
    g.movement.landConvoys()
    assert.equal(g.bySlug['salonica'].troops, home + 5, 'and now they are back where they sailed from')
    assert.equal(g.movement.convoys.length, 0)
  })

  test('the AI storms a lightly held shore instead of sailing home', () => {
    const g = shipping()
    g.movement.embark('salonica', 'izmir', 5)
    const home = g.bySlug['salonica'].troops
    give(g, 'izmir', turkey(g))
    g.bySlug['izmir'].troops = 1 // five against one is worth a landing
    g.turn.configure({ round: g.turn.round + 2 })
    g.movement.landConvoys()
    assert.equal(g.movement.convoys.length, 0, 'nobody turned back')
    assert.equal(g.bySlug['salonica'].troops, home, 'and nobody came home')
    assert.deepEqual(g.movement.pendingLandings, [], 'the AI never waits to be asked')
  })

  test('with no home to return to, the troops storm the beach', () => {
    const g = shipping()
    g.movement.embark('salonica', 'izmir', 5)
    give(g, 'izmir', turkey(g))
    give(g, 'salonica', faction(g, 'Bulgaria'))
    g.turn.configure({ round: g.turn.round + 2 })
    const bulgar = g.bySlug['salonica'].troops
    g.movement.landConvoys()
    assert.equal(g.movement.convoys.length, 0, 'the crossing is spent')
    assert.equal(g.bySlug['salonica'].troops, bulgar, 'they do not reinforce whoever took their harbour')
  })

  test('a convoy sailing home to a fallen port storms it rather than putting to sea again', () => {
    const g = shipping()
    g.movement.convoys.push({
      faction: 'Greece',
      from: 'izmir',
      to: 'salonica',
      troops: 5,
      arrives: g.turn.round,
      returning: true,
    })
    give(g, 'salonica', turkey(g)) // home fell too
    g.bySlug['salonica'].troops = 1
    g.movement.landConvoys()
    assert.equal(g.movement.convoys.length, 0, 'it does not turn around a second time')
    assert.deepEqual(g.movement.pendingLandings, [], 'and it is never a question — there is nowhere left to run')
  })
})

describe('the human chooses at the water’s edge', () => {
  // Seat the fleet-owning faction as the human, so its landing waits for a call.
  const humanShipping = () => {
    const g = shipping('Greece')
    g.players.forEach((player) => (player.isHuman = player.faction.name === 'Greece'))
    return g
  }

  // A human turn that opens with a convoy arriving at İzmir, which the enemy took
  // mid-crossing and left undefended, with Greece's holdings lined up so retaking
  // İzmir lifts the draft by exactly one. `start()` suspends it on the choice.
  const suspendedOnIzmir = () => {
    const g = humanShipping()
    const greece = faction(g, 'Greece')
    g.movement.embark('salonica', 'izmir', 5)
    give(g, 'izmir', faction(g, 'Turkey'))
    g.bySlug['izmir'].troops = 0
    while (greece.territories.length % 3 !== 2) {
      const spare = g.territories.find((terr) => terr.faction !== greece && terr.slug !== 'izmir')!
      give(g, spare.slug, greece)
    }
    g.turn.configure({ round: g.turn.round + 2 })
    g.turn.start()
    return g
  }

  test('a lost target waits for the player to storm or turn back', () => {
    const g = humanShipping()
    g.movement.embark('salonica', 'izmir', 5)
    give(g, 'izmir', faction(g, 'Turkey'))
    g.turn.configure({ round: g.turn.round + 2 })
    g.movement.landConvoys()
    assert.equal(g.movement.convoys.length, 0, 'the crossing is over')
    assert.equal(g.movement.pendingLandings.length, 1, 'but the choice is not made for them')
    assert.equal(g.movement.pendingLandings[0].to, 'izmir')
  })

  test('turning back sends them home on another two-round voyage', () => {
    const g = humanShipping()
    g.movement.embark('salonica', 'izmir', 5)
    const home = g.bySlug['salonica'].troops
    give(g, 'izmir', faction(g, 'Turkey'))
    g.turn.configure({ round: g.turn.round + 2 })
    g.movement.landConvoys()
    g.movement.resolveLanding(false)
    assert.deepEqual(g.movement.pendingLandings, [])
    assert.equal(g.movement.convoys.length, 1, 'a homeward crossing')
    assert.equal(g.movement.convoys[0].returning, true)
    assert.equal(g.movement.convoys[0].to, 'salonica')
    assert.equal(g.bySlug['salonica'].troops, home, 'not landed yet — two rounds to go')
  })

  test('storming resolves the landing then and there', () => {
    const g = humanShipping()
    g.movement.embark('salonica', 'izmir', 5)
    give(g, 'izmir', faction(g, 'Turkey'))
    g.bySlug['izmir'].troops = 1
    g.turn.configure({ round: g.turn.round + 2 })
    g.movement.landConvoys()
    g.movement.resolveLanding(true)
    assert.deepEqual(g.movement.pendingLandings, [], 'the question is answered')
    assert.equal(g.movement.convoys.length, 0, 'and no one sails home')
  })

  test('the turn pauses on the decision, and a captured port counts toward its draft', () => {
    const suspended = suspendedOnIzmir()
    assert.equal(suspended.turn.awaitingLanding, true, 'the turn waits for the call')
    assert.equal(suspended.turn.reinforcementsLeft, 0, 'and draws no draft until it is made')

    const stormed = suspendedOnIzmir()
    stormed.movement.resolveLanding(true)
    const turned = suspendedOnIzmir()
    turned.movement.resolveLanding(false)

    assert.equal(stormed.bySlug['izmir'].faction, faction(stormed, 'Greece'), 'the storm takes İzmir')
    assert.equal(stormed.turn.awaitingLanding, false, 'the turn has opened')
    assert.equal(
      stormed.turn.reinforcementsLeft,
      turned.turn.reinforcementsLeft + 1,
      'the recaptured province adds a unit the turn-back never sees',
    )
  })

  test('a turn suspended on a landing survives a save, then opens when resolved after reload', () => {
    const g = suspendedOnIzmir()
    assert.equal(g.turn.awaitingLanding, true)

    const restored = new Game()
    restoreGame(restored, JSON.parse(JSON.stringify(snapshotGame(g))))
    assert.equal(restored.turn.awaitingLanding, true, 'the pause is remembered')
    assert.equal(restored.turn.reinforcementsLeft, 0, 'no draft was drawn before the save')
    assert.equal(restored.movement.pendingLandings.length, 1, 'the decision is still waiting')

    restored.movement.resolveLanding(true)
    assert.equal(restored.turn.awaitingLanding, false, 'resolving after reload opens the turn')
    assert.ok(restored.turn.reinforcementsLeft > 0, 'and the draft is finally drawn')
    assert.equal(restored.bySlug['izmir'].faction, faction(restored, 'Greece'), 'on the board the storm left behind')
  })

  test('several landings in one turn hold it open until the last is settled', () => {
    const g = humanShipping()
    const round = g.turn.round
    // Two Greek convoys reach İzmir and Lesbos — both ports fell mid-crossing.
    give(g, 'izmir', faction(g, 'Turkey'))
    give(g, 'lesbos', faction(g, 'Turkey'))
    g.movement.convoys.push(
      { faction: 'Greece', from: 'salonica', to: 'izmir', troops: 5, arrives: round },
      { faction: 'Greece', from: 'salonica', to: 'lesbos', troops: 5, arrives: round },
    )
    g.turn.start()

    assert.equal(g.movement.pendingLandings.length, 2, 'both landings await a call')
    assert.equal(g.turn.awaitingLanding, true)

    g.movement.resolveLanding(false)
    assert.equal(g.movement.pendingLandings.length, 1, 'one settled')
    assert.equal(g.turn.awaitingLanding, true, 'but the turn stays paused for the other')
    assert.equal(g.turn.reinforcementsLeft, 0, 'and still draws no draft')

    g.movement.resolveLanding(false)
    assert.equal(g.movement.pendingLandings.length, 0, 'the last is settled')
    assert.equal(g.turn.awaitingLanding, false, 'so the turn finally opens')
    assert.ok(g.turn.reinforcementsLeft > 0, 'and the draft is drawn')
  })
})

describe('an ally holding the target', () => {
  test('is never assaulted — the troops turn back for home', () => {
    const g = shipping('Greece')
    g.movement.embark('salonica', 'izmir', 5)
    const home = g.bySlug['salonica'].troops
    give(g, 'izmir', faction(g, 'Britain')) // a fellow Entente power
    g.turn.configure({ round: g.turn.round + 2 })
    g.movement.landConvoys()
    assert.equal(g.bySlug['izmir'].faction, faction(g, 'Britain'), 'we do not storm our friends')
    assert.equal(g.movement.convoys.length, 1, 'they sail home instead')
    assert.equal(g.movement.convoys[0].returning, true)
    assert.equal(g.bySlug['salonica'].troops, home, 'still at sea')
  })

  test('is reinforced unopposed when there is no home to sail back to', () => {
    const g = shipping('Greece')
    g.movement.embark('salonica', 'izmir', 5)
    give(g, 'izmir', faction(g, 'Britain'))
    give(g, 'salonica', faction(g, 'Turkey')) // home lost; nowhere to retreat
    const before = g.bySlug['izmir'].troops
    g.turn.configure({ round: g.turn.round + 2 })
    g.movement.landConvoys()
    assert.equal(g.movement.convoys.length, 0)
    assert.equal(g.bySlug['izmir'].faction, faction(g, 'Britain'), 'the port stays British')
    assert.equal(g.bySlug['izmir'].troops, before + 5, 'and our men bolster the garrison')
  })
})

describe('a crossing costs a transfer', () => {
  test('it spends the move, so you cannot ship and march in the same turn', () => {
    const g = shipping()
    assert.equal(g.movement.embark('salonica', 'izmir', 5), true)
    assert.equal(g.movement.fortify('salonica', 'kozani', 1), false, 'the transfer is spent')
    assert.deepEqual(g.movement.seaTargets('salonica'), [], 'and so is the crossing')
  })

  test('a small garrison ships what it can spare and no more', () => {
    const g = shipping('Greece', 5)
    assert.equal(g.movement.embark('salonica', 'izmir', 99), true)
    assert.equal(g.movement.convoys[0].troops, 4, 'everything but the garrison')
    assert.equal(g.bySlug['salonica'].troops, 1)
  })

  test('but a port inside the Misak-ı Millî loads at half speed', () => {
    // sailing home out of İzmir is an occupier moving on occupied ground, and
    // that is slow whoever is doing it
    const g = shipping('Greece', 3)
    g.bySlug['izmir'].troops = 9
    assert.equal(g.movement.embark('izmir', 'salonica', 99), true)
    assert.equal(g.movement.convoys[0].troops, 4, 'half of the eight it could spare')
  })

  test('and tonnage caps what a large one can, however much it is holding', () => {
    const g = shipping('Greece', 40)
    g.movement.embark('salonica', 'izmir', 99)
    assert.equal(g.movement.convoys[0].troops, 6, 'a hull carries what a hull carries')
    assert.equal(g.bySlug['salonica'].troops, 34, 'the rest stays in Macedonia')
  })

  test('the ceiling holds no matter how big the army gets', () => {
    for (const garrison of [13, 20, 50, 200]) {
      const g = shipping('Greece', garrison)
      g.movement.embark('salonica', 'izmir', 99)
      assert.equal(g.movement.convoys[0].troops, 6, `${garrison} still ships 6`)
    }
  })

  test('it cuts the rescue as well as the offensive', () => {
    // the lane is not an escape hatch either: an army caught in Anatolia comes
    // home six at a time, which is the point of a tonnage limit
    const g = shipping('Greece', 3)
    g.bySlug['izmir'].troops = 30
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction.name === 'Greece') })
    g.movement.embark('izmir', 'salonica', 99)
    assert.equal(g.movement.convoys[0].troops, 6)
  })

  test('the garrison itself never sails', () => {
    const g = shipping('Greece', 3)
    g.movement.embark('salonica', 'izmir', 99)
    assert.ok(g.bySlug['salonica'].troops >= 1, 'somebody is always left holding the port')
  })
})

describe('convoys survive a save', () => {
  test('a crossing in progress is still in progress after a reload', () => {
    const g = shipping()
    g.movement.embark('salonica', 'izmir', 5)
    const restored = new Game()
    restoreGame(restored, JSON.parse(JSON.stringify(snapshotGame(g))))
    assert.equal(restored.movement.convoys.length, 1)
    assert.deepEqual(restored.movement.convoys[0], g.movement.convoys[0])
  })

  test('an old save with no convoys in it loads clean', () => {
    const g = fresh()
    const save = JSON.parse(JSON.stringify(snapshotGame(g)))
    delete save.convoys
    const restored = new Game()
    restoreGame(restored, save)
    assert.deepEqual(restored.movement.convoys, [])
    assert.deepEqual(restored.movement.pendingLandings, [], 'and no landing is left dangling')
  })

  test('a landing awaiting the player’s decision survives a reload', () => {
    const g = shipping()
    g.movement.pendingLandings.push({ faction: 'Greece', from: 'salonica', to: 'izmir', troops: 5 })
    const restored = new Game()
    restoreGame(restored, JSON.parse(JSON.stringify(snapshotGame(g))))
    assert.deepEqual(restored.movement.pendingLandings, [
      { faction: 'Greece', from: 'salonica', to: 'izmir', troops: 5 },
    ])
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
    assert.equal(g.movement.movable(g.bySlug['izmir']), 5, 'ten spare, five march')
  })

  test('the same army moves at full speed on its own ground', () => {
    const g = at('Greece', 'salonica', 11)
    assert.equal(g.movement.movable(g.bySlug['salonica']), 10, 'Macedonia is not occupied ground')
  })

  test('it is the ground, not the flag: every occupier feels it', () => {
    for (const [name, slug] of [
      ['Britain', 'istanbul'],
      ['France', 'adana'],
      ['Italy', 'antalya'],
      ['Armenia', 'kars'],
      ['Bulgaria', 'edirne'],
    ] as const) {
      const g = at(name, slug, 11)
      assert.equal(g.movement.movable(g.bySlug[slug]), 5, `${name} in ${slug}`)
    }
  })

  test('and Turkey does not — it is the interior line, and it is home', () => {
    const g = at('Turkey', 'izmir', 11)
    assert.equal(g.movement.movable(g.bySlug['izmir']), 10)
    assert.equal(g.movement.movable(g.bySlug['ankara']), g.bySlug['ankara'].troops - 1)
  })

  test('an occupier outside the Pact is unhindered too', () => {
    const g = at('Britain', 'baghdad', 11)
    assert.equal(g.movement.movable(g.bySlug['baghdad']), 10, 'Mesopotamia is not the quarrel')
  })

  test('a garrison of one releases nobody, wherever it stands', () => {
    assert.equal(at('Greece', 'izmir', 1).movement.movable(at('Greece', 'izmir', 1).bySlug['izmir']), 0)
  })

  test('the transfer phase honours it', () => {
    const g = fresh()
    give(g, 'izmir', faction(g, 'Greece'))
    give(g, 'aydin', faction(g, 'Greece'))
    g.bySlug['izmir'].troops = 11
    g.bySlug['aydin'].troops = 1
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction.name === 'Greece') })
    g.turn.configure({ phase: 'fortify' })
    assert.equal(g.movement.fortify('izmir', 'aydin', 99), true)
    assert.equal(g.bySlug['aydin'].troops, 6, 'five arrived')
    assert.equal(g.bySlug['izmir'].troops, 6)
  })
})
