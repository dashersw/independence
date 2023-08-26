import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fresh, give, faction, turkey, findBorder, stageAttack } from './helpers'

describe('reinforcement placement', () => {
  test('adds units and draws down the pool', () => {
    const g = fresh()
    g.phase = 'reinforce'
    g.reinforcementsLeft = 5
    const ankara = g.bySlug['ankara']
    const before = ankara.troops
    g.placeReinforcement('ankara', 2)
    assert.equal(ankara.troops, before + 2)
    assert.equal(g.reinforcementsLeft, 3)
  })

  test('never places more than remains', () => {
    const g = fresh()
    g.phase = 'reinforce'
    g.reinforcementsLeft = 2
    const before = g.bySlug['ankara'].troops
    g.placeReinforcement('ankara', 10)
    assert.equal(g.bySlug['ankara'].troops, before + 2)
    assert.equal(g.reinforcementsLeft, 0)
  })

  test('moves to the attack phase once the pool is empty', () => {
    const g = fresh()
    g.phase = 'reinforce'
    g.reinforcementsLeft = 1
    g.placeReinforcement('ankara')
    assert.equal(g.phase, 'attack')
  })

  test('refuses a province you do not hold', () => {
    const g = fresh()
    g.phase = 'reinforce'
    g.reinforcementsLeft = 3
    const before = g.bySlug['izmir'].troops
    g.placeReinforcement('izmir')
    assert.equal(g.bySlug['izmir'].troops, before)
    assert.equal(g.reinforcementsLeft, 3)
  })

  test('refuses outside the reinforce phase', () => {
    const g = fresh()
    g.phase = 'attack'
    g.reinforcementsLeft = 3
    const before = g.bySlug['ankara'].troops
    g.placeReinforcement('ankara')
    assert.equal(g.bySlug['ankara'].troops, before)
  })

  test('auto-deploy spends the whole pool on the front line', () => {
    const g = fresh()
    g.phase = 'reinforce'
    g.reinforcementsLeft = 7
    const interior = g.territories.find(
      t => t.faction === turkey(g) && t.adjacent.every(a => a.faction === turkey(g))
    )
    const before = interior?.troops
    g.autoPlaceReinforcements()
    assert.equal(g.reinforcementsLeft, 0)
    assert.equal(g.phase, 'attack')
    if (interior) assert.equal(interior.troops, before, 'nothing is wasted inland')
  })

  test('auto-deploy on an empty pool just advances the phase', () => {
    const g = fresh()
    g.phase = 'reinforce'
    g.reinforcementsLeft = 0
    g.autoPlaceReinforcements()
    assert.equal(g.phase, 'attack')
  })
})

describe('threat', () => {
  test('an interior province has no threat at all', () => {
    const g = fresh()
    const interior = g.territories.find(
      t => t.faction === turkey(g) && t.adjacent.every(a => a.faction === turkey(g))
    )
    if (!interior) return
    assert.equal(g.threatOf(interior), -Infinity)
  })

  test('threat is enemy strength minus your own', () => {
    const g = fresh()
    const { to } = findBorder(g, () => true)
    const own = to.adjacent.find(a => a.faction === turkey(g))
    if (!own) return
    own.troops = 5
    const enemies = own.adjacent
      .filter(a => a.faction !== turkey(g) && (g.mayAttack(a.faction, turkey(g)) || g.mayAttack(turkey(g), a.faction)))
      .reduce((sum, a) => sum + a.troops, 0)
    assert.equal(g.threatOf(own), enemies - 5)
  })
})

describe('fortifying', () => {
  test('moves units between adjacent friendly provinces', () => {
    const g = fresh()
    g.phase = 'fortify'
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    const from = g.territories.find(t => t.faction === turkey(g) && t.adjacent.some(a => a.faction === turkey(g)))
    const to = from?.adjacent.find(a => a.faction === turkey(g))
    if (!from || !to) return
    from.troops = 10
    const target = to.troops
    g.fortify(from.slug, to.slug, 4)
    assert.equal(from.troops, 6)
    assert.equal(to.troops, target + 4)
    assert.equal(g.fortifiesUsed, 1)
  })

  test('never empties the source', () => {
    const g = fresh()
    g.phase = 'fortify'
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    const from = g.territories.find(t => t.faction === turkey(g) && t.adjacent.some(a => a.faction === turkey(g)))
    const to = from?.adjacent.find(a => a.faction === turkey(g))
    if (!from || !to) return
    from.troops = 5
    g.fortify(from.slug, to.slug, 99)
    assert.ok(from.troops >= 1, 'a province is never left empty')
  })

  test('refuses a move to an enemy province', () => {
    const g = fresh()
    g.phase = 'fortify'
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    const { from, to } = findBorder(g, () => true)
    from.troops = 10
    const before = to.troops
    g.fortify(from.slug, to.slug, 3)
    assert.equal(to.troops, before)
  })

  test('Turkey gets two moves on interior lines, others one', () => {
    const g = fresh()
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    assert.equal(g.fortifyLimit, 2)
    g.currentPlayerIndex = g.players.findIndex(p => p.faction.name === 'Greece')
    assert.equal(g.fortifyLimit, 1)
  })
})

describe('turn order', () => {
  test('the round advances only when play wraps back around', () => {
    const g = fresh()
    const round = g.round
    const players = g.players.length
    for (let i = 0; i < players - 1; i++) {
      g.endTurn()
      assert.equal(g.round, round, 'mid-round')
    }
    g.endTurn()
    assert.equal(g.round, round + 1)
  })

  test('eliminated factions are skipped', () => {
    const g = fresh()
    const italy = faction(g, 'Italy')
    for (const t of [...italy.territories]) give(g, t.slug, turkey(g))
    assert.ok(italy.eliminated)
    const seen = new Set<string>()
    for (let i = 0; i < g.players.length * 2; i++) {
      g.endTurn()
      seen.add(g.currentPlayer.faction.name)
    }
    assert.ok(!seen.has('Italy'), 'a knocked-out faction never takes a turn')
  })

  test('a new turn resets the per-turn flags', () => {
    const g = fresh()
    g.conqueredThisTurn = true
    g.liberatedThisTurn = true
    g.fortifiesUsed = 2
    g.round = 6
    g.startTurn()
    assert.equal(g.conqueredThisTurn, false)
    assert.equal(g.liberatedThisTurn, false)
    assert.equal(g.fortifiesUsed, 0)
    assert.equal(g.phase, 'reinforce')
  })

  test('endTurn does nothing once the war is over', () => {
    const g = fresh()
    g.phase = 'gameover'
    const round = g.round
    const index = g.currentPlayerIndex
    g.endTurn()
    assert.equal(g.round, round)
    assert.equal(g.currentPlayerIndex, index)
  })

  test('phases advance in order', () => {
    const g = fresh()
    g.phase = 'reinforce'
    g.reinforcementsLeft = 0
    g.endPhase()
    assert.equal(g.phase, 'attack')
    g.endPhase()
    assert.equal(g.phase, 'fortify')
  })
})

describe('elimination', () => {
  test('a faction with no provinces is eliminated', () => {
    const g = fresh()
    const italy = faction(g, 'Italy')
    assert.equal(italy.eliminated, false)
    for (const t of [...italy.territories]) give(g, t.slug, turkey(g))
    assert.equal(italy.eliminated, true)
  })

  test('troopTotal tracks the board', () => {
    const g = fresh()
    const f = turkey(g)
    assert.equal(
      f.troopTotal,
      f.territories.reduce((n, t) => n + t.troops, 0)
    )
    f.territories[0].troops += 5
    assert.equal(
      f.troopTotal,
      f.territories.reduce((n, t) => n + t.troops, 0)
    )
  })

  test('losing every province ends the war for Turkey', () => {
    const g = fresh()
    for (const t of [...turkey(g).territories]) give(g, t.slug, faction(g, 'Greece'))
    g.checkGameEnd()
    assert.equal(g.phase, 'gameover')
    assert.equal(g.humanDefeated, true)
  })

  test('changeControl keeps both faction lists consistent', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    const izmit = g.bySlug['izmit']
    const previous = izmit.faction
    const beforeOld = previous.territories.length
    const beforeNew = greece.territories.length
    izmit.changeControl(greece, 4)
    assert.equal(previous.territories.length, beforeOld - 1)
    assert.equal(greece.territories.length, beforeNew + 1)
    assert.ok(greece.territories.includes(izmit))
    assert.ok(!previous.territories.includes(izmit))
  })
})

describe('the AI turn', () => {
  test('runs all three stages without leaving the phase open', () => {
    const g = fresh()
    g.currentPlayerIndex = g.players.findIndex(p => p.faction.name === 'Greece')
    g.startTurn()
    g.clearEventCards()
    g.playAiTurn()
    assert.notEqual(g.currentPlayer.faction.name, 'Greece', 'the turn should have passed on')
  })

  test('a passive faction takes no attacks', () => {
    const g = fresh()
    g.round = 12
    const italy = faction(g, 'Italy')
    g.currentPlayerIndex = g.players.findIndex(p => p.faction === italy)
    g.startTurn()
    g.aiBeginTurn()
    assert.equal(g.isPassive(italy), true)
    assert.equal(g.aiAttacksLeft, 0)
  })

  test('a frozen Greece takes no attacks even when not passive', () => {
    const g = fresh()
    g.sakaryaRound = 11
    g.round = 11
    const greece = faction(g, 'Greece')
    g.currentPlayerIndex = g.players.findIndex(p => p.faction === greece)
    g.startTurn()
    g.aiBeginTurn()
    assert.equal(g.aiAttacksLeft, 0)
  })

  test('aiAttackStep reports when it has nothing left to do', () => {
    const g = fresh()
    g.currentPlayerIndex = g.players.findIndex(p => p.faction.name === 'Greece')
    g.phase = 'attack'
    g.aiAttacksLeft = 0
    assert.equal(g.aiAttackStep(), false)
  })

  test('the human seat is never driven by the AI', () => {
    const g = fresh()
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    g.phase = 'attack'
    g.aiAttacksLeft = 5
    assert.equal(g.aiAttackStep(), false)
  })
})

describe('who may fight whom', () => {
  test('the Entente only attacks Turkey', () => {
    const g = fresh()
    assert.equal(g.mayAttack(faction(g, 'Greece'), turkey(g)), true)
    assert.equal(g.mayAttack(faction(g, 'Greece'), faction(g, 'Britain')), false)
    assert.equal(g.mayAttack(faction(g, 'Britain'), faction(g, 'France')), false)
  })

  test('Turkey may attack anyone', () => {
    const g = fresh()
    for (const name of ['Greece', 'Britain', 'France', 'Italy', 'Armenia', 'Bulgaria'])
      assert.equal(g.mayAttack(turkey(g), faction(g, name)), true, name)
  })

  test('Bulgaria has a score to settle with Greece only', () => {
    const g = fresh()
    assert.equal(g.mayAttack(faction(g, 'Bulgaria'), faction(g, 'Greece')), true)
    assert.equal(g.mayAttack(faction(g, 'Bulgaria'), faction(g, 'Britain')), false)
    assert.equal(g.mayAttack(faction(g, 'Bulgaria'), turkey(g)), false)
  })

  test('Bulgaria chases Greece wherever Greece went, Anatolia included', () => {
    const g = fresh()
    g.round = 6 // after San Remo hands Thrace to Athens
    const bulgaria = faction(g, 'Bulgaria')
    const greece = faction(g, 'Greece')
    give(g, 'izmir', greece)
    assert.equal(g.mayAttack(bulgaria, greece), true, 'the quarrel is real')
    assert.equal(g.frontClosed(bulgaria, g.bySlug['salonica']), false, 'Macedonia is fair game')
    assert.equal(g.frontClosed(bulgaria, g.bySlug['western-thrace']), false, 'so is Thrace')
    assert.equal(g.frontClosed(bulgaria, g.bySlug['izmir']), false, 'and so is the Greek army in İzmir')
  })

  test('but not before San Remo — the Entente is still garrisoning Thrace', () => {
    const g = fresh()
    const bulgaria = faction(g, 'Bulgaria')
    assert.equal(g.round, 1)
    assert.equal(g.frontClosed(bulgaria, g.bySlug['western-thrace']), true, 'shut in 1919')
    assert.equal(g.frontClosed(bulgaria, g.bySlug['salonica']), true, 'Macedonia too')
    // and the quarrel itself is not in doubt — only the date
    assert.equal(g.mayAttack(bulgaria, faction(g, 'Greece')), true)
  })

  test('the line opens the round San Remo lands, and not before', () => {
    const g = fresh()
    const bulgaria = faction(g, 'Bulgaria')
    const thrace = g.bySlug['western-thrace']
    const opens = []
    for (g.round = 1; g.round <= 8; g.round++) if (!g.frontClosed(bulgaria, thrace)) opens.push(g.round)
    assert.deepEqual(opens, [5, 6, 7, 8], 'shut through the spring of 1920, open after')
  })

  test('the gate is about Greek ground, not about Bulgaria being frozen', () => {
    const g = fresh()
    const bulgaria = faction(g, 'Bulgaria')
    give(g, 'edirne', faction(g, 'Turkey'))
    assert.equal(g.round, 1)
    assert.equal(g.frontClosed(bulgaria, g.bySlug['edirne']), false, 'Edirne is Turkish and open from the start')
  })

  test('a grudge overrides the alliance rules', () => {
    const g = fresh()
    const bulgaria = faction(g, 'Bulgaria')
    assert.equal(g.mayAttack(bulgaria, turkey(g)), false)
    bulgaria.grudges.add('Turkey')
    assert.equal(g.mayAttack(bulgaria, turkey(g)), true)
  })
})
