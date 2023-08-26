import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { AiTurnController, playAiTurn } from '../src/ai/turn-controller'
import { applyEvent, fresh, give, faction, turkey, findBorder, setVariable } from './helpers'

describe('reinforcement placement', () => {
  test('adds units and draws down the pool', () => {
    const g = fresh()
    g.turn.configure({ phase: 'reinforce' })
    g.turn.configure({ reinforcementsLeft: 5 })
    const ankara = g.bySlug['ankara']
    const before = ankara.troops
    g.turn.placeReinforcements('ankara', 2)
    assert.equal(ankara.troops, before + 2)
    assert.equal(g.turn.reinforcementsLeft, 3)
  })

  test('never places more than remains', () => {
    const g = fresh()
    g.turn.configure({ phase: 'reinforce' })
    g.turn.configure({ reinforcementsLeft: 2 })
    const before = g.bySlug['ankara'].troops
    g.turn.placeReinforcements('ankara', 10)
    assert.equal(g.bySlug['ankara'].troops, before + 2)
    assert.equal(g.turn.reinforcementsLeft, 0)
  })

  test('moves to the attack phase once the pool is empty', () => {
    const g = fresh()
    g.turn.configure({ phase: 'reinforce' })
    g.turn.configure({ reinforcementsLeft: 1 })
    g.turn.placeReinforcements('ankara')
    assert.equal(g.turn.phase, 'attack')
  })

  test('refuses a province you do not hold', () => {
    const g = fresh()
    g.turn.configure({ phase: 'reinforce' })
    g.turn.configure({ reinforcementsLeft: 3 })
    const before = g.bySlug['izmir'].troops
    g.turn.placeReinforcements('izmir')
    assert.equal(g.bySlug['izmir'].troops, before)
    assert.equal(g.turn.reinforcementsLeft, 3)
  })

  test('refuses outside the reinforce phase', () => {
    const g = fresh()
    g.turn.configure({ phase: 'attack' })
    g.turn.configure({ reinforcementsLeft: 3 })
    const before = g.bySlug['ankara'].troops
    g.turn.placeReinforcements('ankara')
    assert.equal(g.bySlug['ankara'].troops, before)
  })

  test('auto-deploy spends the whole pool on the front line', () => {
    const g = fresh()
    g.turn.configure({ phase: 'reinforce' })
    g.turn.configure({ reinforcementsLeft: 7 })
    const interior = g.territories.find(
      (t) => t.faction === turkey(g) && t.adjacent.every((a) => a.faction === turkey(g)),
    )
    const before = interior?.troops
    g.reinforcements.autoPlace()
    assert.equal(g.turn.reinforcementsLeft, 0)
    assert.equal(g.turn.phase, 'attack')
    if (interior) assert.equal(interior.troops, before, 'nothing is wasted inland')
  })

  test('auto-deploy on an empty pool just advances the phase', () => {
    const g = fresh()
    g.turn.configure({ phase: 'reinforce' })
    g.turn.configure({ reinforcementsLeft: 0 })
    g.reinforcements.autoPlace()
    assert.equal(g.turn.phase, 'attack')
  })
})

describe('threat', () => {
  test('an interior province has no threat at all', () => {
    const g = fresh()
    const interior = g.territories.find(
      (t) => t.faction === turkey(g) && t.adjacent.every((a) => a.faction === turkey(g)),
    )
    if (!interior) return
    assert.equal(g.threatOf(interior), -Infinity)
  })

  test('threat is enemy strength minus your own', () => {
    const g = fresh()
    const { to } = findBorder(g, () => true)
    const own = to.adjacent.find((a) => a.faction === turkey(g))
    if (!own) return
    own.troops = 5
    const enemies = own.adjacent
      .filter(
        (a) =>
          a.faction !== turkey(g) &&
          (g.campaign.mayAttack(a.faction, turkey(g)) || g.campaign.mayAttack(turkey(g), a.faction)),
      )
      .reduce((sum, a) => sum + a.troops, 0)
    assert.equal(g.threatOf(own), enemies - 5)
  })
})

describe('fortifying', () => {
  test('moves units between adjacent friendly provinces', () => {
    const g = fresh()
    g.turn.configure({ phase: 'fortify' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    const from = g.territories.find((t) => t.faction === turkey(g) && t.adjacent.some((a) => a.faction === turkey(g)))
    const to = from?.adjacent.find((a) => a.faction === turkey(g))
    if (!from || !to) return
    from.troops = 10
    const target = to.troops
    g.movement.fortify(from.slug, to.slug, 4)
    assert.equal(from.troops, 6)
    assert.equal(to.troops, target + 4)
    assert.equal(g.turn.fortifiesUsed, 1)
  })

  test('never empties the source', () => {
    const g = fresh()
    g.turn.configure({ phase: 'fortify' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    const from = g.territories.find((t) => t.faction === turkey(g) && t.adjacent.some((a) => a.faction === turkey(g)))
    const to = from?.adjacent.find((a) => a.faction === turkey(g))
    if (!from || !to) return
    from.troops = 5
    g.movement.fortify(from.slug, to.slug, 99)
    assert.ok(from.troops >= 1, 'a province is never left empty')
  })

  test('refuses a move to an enemy province', () => {
    const g = fresh()
    g.turn.configure({ phase: 'fortify' })
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    const { from, to } = findBorder(g, () => true)
    from.troops = 10
    const before = to.troops
    g.movement.fortify(from.slug, to.slug, 3)
    assert.equal(to.troops, before)
  })

  test('Turkey gets two moves on interior lines, others one', () => {
    const g = fresh()
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    assert.equal(g.campaign.fortifyLimit, 2)
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction.name === 'Greece') })
    assert.equal(g.campaign.fortifyLimit, 1)
  })
})

describe('turn order', () => {
  test('the public state is a snapshot, not mutable engine state', () => {
    const g = fresh()
    const state = g.turn.state
    ;(state.reinforcements as { remaining: number }).remaining = 999
    ;(state.attacks as { used: number }).used = 999
    ;(state.attacks.advanceDepth as Record<string, number>).ankara = 999
    assert.notEqual(g.turn.reinforcementsLeft, 999)
    assert.notEqual(g.turn.attacksUsed, 999)
    assert.notEqual(g.turn.advanceDepth('ankara'), 999)
  })

  test('configuration stays in the same turn, while advancing invalidates its id', () => {
    const g = fresh()
    const id = g.turn.id
    g.turn.configure({ phase: 'attack' })
    assert.equal(g.turn.id, id)
    assert.equal(g.turn.isCurrent(id), true)
    g.turn.finish()
    assert.equal(g.turn.isCurrent(id), false)
  })

  test('restoration rejects an invalid active player', () => {
    const g = fresh()
    assert.throws(
      () =>
        g.turn.restore({
          ...g.turn.state,
          playerIndex: g.players.length,
          reinforcements: { remaining: 0 },
        }),
      /invalid turn player/,
    )
  })

  test('the round advances only when play wraps back around', () => {
    const g = fresh()
    const round = g.turn.round
    const players = g.players.length
    for (let i = 0; i < players - 1; i++) {
      g.turn.finish()
      assert.equal(g.turn.round, round, 'mid-round')
    }
    g.turn.finish()
    assert.equal(g.turn.round, round + 1)
  })

  test('eliminated factions are skipped', () => {
    const g = fresh()
    const italy = faction(g, 'Italy')
    for (const t of [...italy.territories]) give(g, t.slug, turkey(g))
    assert.ok(italy.eliminated)
    const seen = new Set<string>()
    for (let i = 0; i < g.players.length * 2; i++) {
      g.turn.finish()
      seen.add(g.turn.currentPlayer.faction.name)
    }
    assert.ok(!seen.has('Italy'), 'a knocked-out faction never takes a turn')
  })

  test('a new turn resets the per-turn flags', () => {
    const g = fresh()
    g.turn.configure({ conqueredTerritory: true })
    g.turn.configure({ liberatedHomeland: true })
    g.turn.configure({ attacks: { used: 3, advanceDepth: { ankara: 2 } } })
    g.turn.configure({ fortifiesUsed: 2 })
    g.turn.configure({ round: 6 })
    g.turn.start()
    assert.equal(g.turn.conqueredTerritory, false)
    assert.equal(g.turn.liberatedHomeland, false)
    assert.equal(g.turn.attacksUsed, 0)
    assert.equal(g.turn.advanceDepth('ankara'), 0)
    assert.equal(g.turn.fortifiesUsed, 0)
    assert.equal(g.turn.phase, 'reinforce')
  })

  test('endTurn does nothing once the war is over', () => {
    const g = fresh()
    g.turn.configure({ phase: 'gameover' })
    const round = g.turn.round
    const index = g.turn.playerIndex
    g.turn.finish()
    assert.equal(g.turn.round, round)
    assert.equal(g.turn.playerIndex, index)
  })

  test('phases advance in order', () => {
    const g = fresh()
    g.turn.configure({ phase: 'reinforce' })
    g.turn.configure({ reinforcementsLeft: 0 })
    g.turn.advancePhase()
    assert.equal(g.turn.phase, 'attack')
    g.turn.advancePhase()
    assert.equal(g.turn.phase, 'fortify')
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
      f.territories.reduce((n, t) => n + t.troops, 0),
    )
    f.territories[0].troops += 5
    assert.equal(
      f.troopTotal,
      f.territories.reduce((n, t) => n + t.troops, 0),
    )
  })

  test('losing every province ends the war for Turkey', () => {
    const g = fresh()
    for (const t of [...turkey(g).territories]) give(g, t.slug, faction(g, 'Greece'))
    g.checkGameEnd()
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.humanDefeated, true)
  })

  test('changeControl keeps both faction lists consistent', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    const izmit = g.bySlug['izmit']
    const previous = izmit.faction
    const beforeOld = previous.territories.length
    const beforeNew = greece.territories.length
    g.board.changeControl(izmit, greece, 4)
    assert.equal(previous.territories.length, beforeOld - 1)
    assert.equal(greece.territories.length, beforeNew + 1)
    assert.ok(greece.territories.includes(izmit))
    assert.ok(!previous.territories.includes(izmit))
  })
})

describe('the AI turn', () => {
  test('runs all three stages without leaving the phase open', () => {
    const g = fresh()
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction.name === 'Greece') })
    g.turn.start()
    g.campaign.clearCards()
    playAiTurn(g)
    assert.notEqual(g.turn.currentPlayer.faction.name, 'Greece', 'the turn should have passed on')
  })

  test('a passive faction takes no attacks', () => {
    const g = fresh()
    g.turn.configure({ round: 12 })
    const italy = faction(g, 'Italy')
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === italy) })
    g.turn.start()
    const ai = new AiTurnController(g)
    ai.beginTurn()
    assert.equal(g.campaign.isPassive(italy), true)
    assert.equal(ai.attackStep(), false)
  })

  test('a frozen Greece takes no attacks even when not passive', () => {
    const g = fresh()
    setVariable(g, 'sakarya.round', 11)
    g.turn.configure({ round: 11 })
    const greece = faction(g, 'Greece')
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === greece) })
    g.turn.start()
    const ai = new AiTurnController(g)
    ai.beginTurn()
    assert.equal(ai.attackStep(), false)
  })

  test('aiAttackStep reports when it has nothing left to do', () => {
    const g = fresh()
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction.name === 'Greece') })
    g.turn.configure({ phase: 'attack' })
    const ai = new AiTurnController(g)
    ai.beginTurn()
    ai.finishTurn()
    assert.equal(ai.attackStep(), false)
  })

  test('an AI resumed mid-turn keeps the existing advance lineage', () => {
    const g = fresh()
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction.name === 'Greece') })
    g.turn.start()
    g.turn.configure({ phase: 'attack', attacks: { advanceDepth: { izmir: 2 } } })
    const ai = new AiTurnController(g, { scorer: () => 0 })
    ai.beginTurn()
    assert.equal(g.turn.advanceDepth('izmir'), 2)
  })

  test('the human seat is never driven by the AI', () => {
    const g = fresh()
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.isHuman) })
    g.turn.configure({ phase: 'attack' })
    const ai = new AiTurnController(g)
    ai.beginTurn()
    assert.equal(ai.attackStep(), false)
  })
})

describe('who may fight whom', () => {
  test('the Entente only attacks Turkey', () => {
    const g = fresh()
    assert.equal(g.campaign.mayAttack(faction(g, 'Greece'), turkey(g)), true)
    assert.equal(g.campaign.mayAttack(faction(g, 'Greece'), faction(g, 'Britain')), false)
    assert.equal(g.campaign.mayAttack(faction(g, 'Britain'), faction(g, 'France')), false)
  })

  test('Turkey may attack anyone', () => {
    const g = fresh()
    for (const name of ['Greece', 'Britain', 'France', 'Italy', 'Armenia', 'Bulgaria'])
      assert.equal(g.campaign.mayAttack(turkey(g), faction(g, name)), true, name)
  })

  test('Bulgaria has a score to settle with Greece only', () => {
    const g = fresh()
    assert.equal(g.campaign.mayAttack(faction(g, 'Bulgaria'), faction(g, 'Greece')), true)
    assert.equal(g.campaign.mayAttack(faction(g, 'Bulgaria'), faction(g, 'Britain')), false)
    assert.equal(g.campaign.mayAttack(faction(g, 'Bulgaria'), turkey(g)), false)
  })

  test('Bulgaria chases Greece wherever Greece went, Anatolia included', () => {
    const g = fresh()
    g.turn.configure({ round: 6 }) // after San Remo hands Thrace to Athens
    const bulgaria = faction(g, 'Bulgaria')
    const greece = faction(g, 'Greece')
    applyEvent(g, 'event.sanRemo')
    give(g, 'izmir', greece)
    assert.equal(g.campaign.mayAttack(bulgaria, greece), true, 'the quarrel is real')
    assert.equal(g.campaign.frontClosed(bulgaria, g.bySlug['salonica']), false, 'Macedonia is fair game')
    assert.equal(g.campaign.frontClosed(bulgaria, g.bySlug['western-thrace']), false, 'so is Thrace')
    assert.equal(g.campaign.frontClosed(bulgaria, g.bySlug['izmir']), false, 'and so is the Greek army in İzmir')
  })

  test('but not before San Remo — the Entente is still garrisoning Thrace', () => {
    const g = fresh()
    const bulgaria = faction(g, 'Bulgaria')
    assert.equal(g.turn.round, 1)
    assert.equal(g.campaign.frontClosed(bulgaria, g.bySlug['western-thrace']), true, 'shut in 1919')
    assert.equal(g.campaign.frontClosed(bulgaria, g.bySlug['salonica']), true, 'Macedonia too')
    // and the quarrel itself is not in doubt — only the date
    assert.equal(g.campaign.mayAttack(bulgaria, faction(g, 'Greece')), true)
  })

  test('the line opens the round San Remo lands, and not before', () => {
    const g = fresh()
    const bulgaria = faction(g, 'Bulgaria')
    const thrace = g.bySlug['western-thrace']
    const opens = []
    for (let round = 1; round <= 8; round++) {
      g.turn.configure({ round })
      if (g.turn.round === 5) applyEvent(g, 'event.sanRemo')
      if (!g.campaign.frontClosed(bulgaria, thrace)) opens.push(g.turn.round)
    }
    assert.deepEqual(opens, [5, 6, 7, 8], 'shut through the spring of 1920, open after')
  })

  test('the gate is about Greek ground, not about Bulgaria being frozen', () => {
    const g = fresh()
    const bulgaria = faction(g, 'Bulgaria')
    give(g, 'edirne', faction(g, 'Turkey'))
    assert.equal(g.turn.round, 1)
    assert.equal(
      g.campaign.frontClosed(bulgaria, g.bySlug['edirne']),
      false,
      'Edirne is Turkish and open from the start',
    )
  })

  test('a grudge overrides the alliance rules', () => {
    const g = fresh()
    const bulgaria = faction(g, 'Bulgaria')
    assert.equal(g.campaign.mayAttack(bulgaria, turkey(g)), false)
    bulgaria.grudges.add('Turkey')
    assert.equal(g.campaign.mayAttack(bulgaria, turkey(g)), true)
  })
})
