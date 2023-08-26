// The learned AI: what it sees, what it is paid for, and what it is allowed to
// do with that. The network itself is tested separately in net.test.ts.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { NATIONAL_PACT } from '../src/game/campaign-data'
import { fresh, give, faction, turkey, setVariable } from './helpers'
import {
  INPUT_SIZE,
  STATE_SIZE,
  MOVE_SIZE,
  afterFeatures,
  attackOdds,
  features,
  stateFeatures,
  moveFeatures,
} from '../src/ai/features'
import {
  AIMS,
  HOME,
  homeHeld,
  COALITION_BONUS,
  coalitionShare,
  ULTIMATE,
  ULTIMATE_BONUS,
  TURKEY_ENDINGS,
  aimHeld,
  shape,
  snapshot,
  terminal,
  ultimateHeld,
} from '../src/ai/rewards'
import {
  attackMoves,
  chooseMove,
  decisionMoves,
  fortifyMoves,
  hypothetically,
  reinforceMoves,
  playTurn,
} from '../src/ai/policy'
import { Net } from '../src/ai/net'
import { ReplayBuffer } from '../src/ai/replay-buffer'
import { AiTurnController } from '../src/ai/turn-controller'
import { gameOutcome } from '../src/game/outcome'

const FACTIONS = ['Turkey', 'Greece', 'Britain', 'France', 'Italy', 'Armenia', 'Bulgaria']

describe('the replay buffer', () => {
  test('replaces old entries at constant capacity', () => {
    const buffer = new ReplayBuffer<number>(3)
    for (const value of [1, 2, 3, 4, 5]) buffer.add(value)
    assert.equal(buffer.length, 3)
    assert.deepEqual(new Set(buffer.values()), new Set([3, 4, 5]))
  })

  test('samples uniformly addressable entries without exposing storage', () => {
    const buffer = new ReplayBuffer<number>(3)
    for (const value of [10, 20, 30]) buffer.add(value)
    assert.equal(
      buffer.sample(() => 0),
      10,
    )
    assert.equal(
      buffer.sample(() => 0.5),
      20,
    )
    assert.equal(
      buffer.sample(() => 0.999),
      30,
    )
    assert.equal(
      new ReplayBuffer<number>(1).sample(() => 0),
      undefined,
    )
  })

  test('rejects an unusable capacity', () => {
    assert.throws(() => new ReplayBuffer(0), /capacity/)
  })
})

describe('what the network sees', () => {
  test('every vector is the size the net was built for', () => {
    const g = fresh()
    assert.equal(STATE_SIZE * 2 + MOVE_SIZE, INPUT_SIZE, 'position, move, and what the move would change')
    for (const name of FACTIONS) {
      const f = faction(g, name)
      assert.equal(stateFeatures(g, f).length, STATE_SIZE, name)
      for (const kind of ['reinforce', 'attack', 'fortify', 'end'] as const)
        assert.equal(moveFeatures(g, f, { kind }).length, MOVE_SIZE, `${name}/${kind}`)
    }
  })

  test('nothing it sees is out of range, whatever the board looks like', () => {
    const g = fresh()
    // an absurd board: one faction with everything, huge stacks, late round
    g.turn.configure({ round: 27 })
    for (const t of g.territories) t.troops = 500
    for (const t of [...faction(g, 'Greece').territories]) give(g, t.slug, turkey(g))
    for (const name of FACTIONS) {
      const f = faction(g, name)
      const from = f.territories[0] ?? g.territories[0]
      const vector = features(g, f, { kind: 'attack', from, to: from.adjacent[0] })
      assert.equal(vector.length, INPUT_SIZE)
      for (const [i, v] of vector.entries()) {
        assert.ok(Number.isFinite(v), `${name}[${i}] is finite`)
        // the last block is a signed delta; the rest are magnitudes
        assert.ok(v >= -1 && v <= 1, `${name}[${i}] = ${v} is in range`)
      }
    }
  })

  test('it carries no hint of which faction is looking', () => {
    // the personalities have to come from the rewards; if the vector said
    // "you are Britain" the nets could key off it and the aims would blur
    const g = fresh()
    const turkeyView = stateFeatures(g, turkey(g))
    const greekView = stateFeatures(g, faction(g, 'Greece'))
    assert.equal(turkeyView.length, greekView.length)
    assert.notDeepEqual(turkeyView, greekView, 'but the POSITION differs per side')
  })

  test('the odds feature tracks the odds', () => {
    assert.equal(attackOdds(1, 5), 0, 'a lone unit cannot attack at all')
    assert.ok(attackOdds(20, 2) > attackOdds(6, 2), 'more attackers is better')
    assert.ok(attackOdds(10, 2) > attackOdds(10, 8), 'more defenders is worse')
    assert.ok(attackOdds(10, 10) < 0.5, 'the defender wins ties, so parity is unfavourable')
    for (const [a, d] of [
      [0, 0],
      [1, 0],
      [99, 0],
      [3, 99],
    ]) {
      const o = attackOdds(a, d)
      assert.ok(o >= 0 && o <= 1, `${a}v${d} → ${o}`)
    }
  })

  test('the lookahead reads the board the move would leave, and puts it back', () => {
    const g = fresh()
    const f = turkey(g)
    const from = f.territories.find((t) => t.adjacent.some((n) => n.faction !== f))!
    const to = from.adjacent.find((n) => n.faction !== f)!
    from.troops = 20
    const board = () => JSON.stringify(g.territories.map((t) => [t.slug, t.faction.name, t.troops, t.heldSince]))
    const lists = () => JSON.stringify(g.factions.map((x) => [x.name, x.territories.map((t) => t.slug).sort()]))
    const beforeBoard = board()
    const beforeLists = lists()

    const now = stateFeatures(g, f)
    const afterAttack = afterFeatures(g, f, { kind: 'attack', from, to })
    assert.notDeepEqual(afterAttack, now, 'taking a province changes the position')
    assert.equal(board(), beforeBoard, 'and the hypothetical leaves no trace')
    assert.equal(lists(), beforeLists, 'not even in the faction lists')

    const afterEnd = afterFeatures(g, f, { kind: 'end' })
    assert.deepEqual(afterEnd, now, 'doing nothing changes nothing')

    const afterPlace = afterFeatures(g, f, { kind: 'reinforce', from })
    assert.notDeepEqual(afterPlace, now)
    assert.equal(board(), beforeBoard)
  })

  test('two-ply conquest planning carries and restores advance lineage', () => {
    const g = fresh()
    const f = turkey(g)
    const from = f.territories.find((territory) => territory.adjacent.some((adjacent) => adjacent.faction !== f))!
    const to = from.adjacent.find((territory) => territory.faction !== f)!
    from.troops = 20
    g.turn.configure({ phase: 'attack' })
    const before = g.turn.snapshot()

    const undo = hypothetically(g, f, { kind: 'attack', from, to })
    assert.ok(undo)
    assert.equal(g.turn.attacksUsed, 1)
    assert.equal(g.turn.advanceDepth(to.slug), 1)
    undo()
    assert.deepEqual(g.turn.snapshot(), before)
  })

  test('the delta block is zero for a move that changes nothing', () => {
    const g = fresh()
    const f = turkey(g)
    const vector = features(g, f, { kind: 'end' })
    const delta = vector.slice(STATE_SIZE + MOVE_SIZE)
    assert.equal(delta.length, STATE_SIZE)
    assert.ok(
      delta.every((v) => v === 0),
      'end moves nothing, so it changes nothing',
    )
  })

  test('campaign choices are generic model moves with distinct vectors', () => {
    const g = fresh()
    const event = {
      choices: [
        { key: 'first', label: 'First' },
        { key: 'second', label: 'Second' },
      ],
    } as never
    const moves = decisionMoves(event)
    assert.deepEqual(
      moves.map((move) => move.choiceKey),
      ['first', 'second'],
    )
    assert.notDeepEqual(features(g, turkey(g), moves[0]), features(g, turkey(g), moves[1]))
    assert.ok(features(g, turkey(g), moves[0]).every((value) => value >= -1 && value <= 1))
  })

  test('it can tell a Pact province, a seat and a dug-in holder apart', () => {
    const g = fresh()
    const ankara = g.bySlug['ankara']
    const sofia = g.bySlug['sofia']
    const f = faction(g, 'Greece')
    const seatVector = moveFeatures(g, f, { kind: 'attack', to: ankara })
    const plainVector = moveFeatures(g, f, { kind: 'attack', to: sofia })
    assert.equal(seatVector[8], 1, 'ankara is in the Pact')
    assert.equal(plainVector[8], 0, 'sofia is not')
    assert.equal(seatVector[10], 1, 'ankara is an Assembly seat')
    assert.equal(plainVector[10], 0)
    g.turn.configure({ round: 9 })
    assert.ok(moveFeatures(g, f, { kind: 'attack', to: ankara })[12] > seatVector[12], 'tenure shows')
  })

  test('a crossing is not a march, and the vector says so', () => {
    const g = fresh()
    const f = faction(g, 'Greece')
    const salonica = g.bySlug['salonica']
    const izmir = g.bySlug['izmir']
    const march = moveFeatures(g, f, { kind: 'fortify', from: salonica, to: g.bySlug['kozani'] })
    const crossing = moveFeatures(g, f, { kind: 'sail', from: salonica, to: izmir })
    assert.equal(march[2], 1, 'the march is a fortify')
    assert.equal(march[3], 0, 'and not a crossing')
    assert.equal(crossing[3], 1, 'the crossing is its own kind of move')
    assert.equal(crossing[2], 0)
  })

  test('an army at sea is still an army, and the position shows it', () => {
    const g = fresh()
    const f = faction(g, 'Greece')
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction.name === 'Greece') })
    g.turn.configure({ phase: 'fortify' })
    g.bySlug['salonica'].troops = 20
    const before = stateFeatures(g, f)
    g.movement.embark('salonica', 'izmir', 8)
    const after = stateFeatures(g, f)
    assert.ok(after[4] > before[4], 'the men aboard ship are on the board somewhere')
    assert.equal(before[4], 0, 'and nothing is at sea before they sail')
  })

  test('sailing empties the province it leaves — that is the whole cost', () => {
    const g = fresh()
    const f = faction(g, 'Greece')
    g.bySlug['salonica'].troops = 20
    const held = g.bySlug['salonica'].troops
    afterFeatures(g, f, { kind: 'sail', from: g.bySlug['salonica'], to: g.bySlug['izmir'] })
    assert.equal(g.bySlug['salonica'].troops, held, 'and the board is put back afterwards')
  })
})

describe('what each faction is paid for', () => {
  const aimsOf = (name: string) => AIMS[name] ?? []

  test('every faction has an aim, and they are real provinces', () => {
    const g = fresh()
    for (const name of FACTIONS) {
      const aim = aimsOf(name)
      assert.ok(aim.length > 0, `${name} has something to play for`)
      for (const slug of aim) assert.ok(g.bySlug[slug], `${name}: ${slug} is on the map`)
    }
  })

  test('the aims are distinct — nobody is playing somebody else’s war', () => {
    for (const a of FACTIONS)
      for (const b of FACTIONS) {
        if (a === b || a === 'Turkey' || b === 'Turkey') continue
        assert.notDeepEqual(aimsOf(a), aimsOf(b), `${a} and ${b} want different things`)
      }
  })

  test('taking your own aim pays, and losing it costs', () => {
    for (const name of FACTIONS) {
      if (name === 'Turkey') continue
      const g = fresh()
      const f = faction(g, name)
      const aim = aimsOf(name)
      // start from not holding it — several of them begin the war already there
      for (const slug of aim) give(g, slug, turkey(g))
      const before = snapshot(g, f)
      for (const slug of aim) give(g, slug, f)
      const gained = shape(g, f, before, snapshot(g, f))

      const g2 = fresh()
      const f2 = faction(g2, name)
      for (const slug of aim) give(g2, slug, f2)
      const held = snapshot(g2, f2)
      for (const slug of aim) give(g2, slug, turkey(g2))
      const lost = shape(g2, f2, held, snapshot(g2, f2))

      assert.ok(gained > 0, `${name} is paid for taking ${aim.length} of its aim (${gained})`)
      assert.ok(lost < gained, `${name} is not paid for losing it (${lost} vs ${gained})`)
    }
  })

  test('Turkey is paid for the Pact and not for anything outside it', () => {
    const g = fresh()
    const tr = turkey(g)
    const outside = g.territories.find((t) => !NATIONAL_PACT.includes(t.slug) && t.faction !== tr)!
    const before = snapshot(g, tr)
    give(g, outside.slug, tr)
    const grabbed = shape(g, tr, before, snapshot(g, tr))

    const g2 = fresh()
    const tr2 = turkey(g2)
    const pact = NATIONAL_PACT.find((slug) => g2.bySlug[slug].faction !== tr2)!
    const before2 = snapshot(g2, tr2)
    give(g2, pact, tr2)
    const liberated = shape(g2, tr2, before2, snapshot(g2, tr2))

    assert.ok(liberated > grabbed, 'a Pact province is worth more than a foreign one')
    assert.ok(grabbed < 0, 'and conquest outside it is a cost, not a gain')
  })

  test('Bulgaria is not paid for taking Turkish ground it does not claim', () => {
    const g = fresh()
    const bg = faction(g, 'Bulgaria')
    const before = snapshot(g, bg)
    give(g, 'kastamonu', bg)
    assert.ok(shape(g, bg, before, snapshot(g, bg)) < 0, 'Anatolia is not its quarrel')

    // but Edirne and the City are its own claim, and are paid for as such
    const claim = fresh()
    const bg2 = faction(claim, 'Bulgaria')
    const beforeClaim = snapshot(claim, bg2)
    give(claim, 'edirne', bg2)
    assert.ok(shape(claim, bg2, beforeClaim, snapshot(claim, bg2)) > 0, 'Adrianople is')

    const g2 = fresh()
    const bg3 = faction(g2, 'Bulgaria')
    const before2 = snapshot(g2, bg3)
    give(g2, 'western-thrace', bg3)
    assert.ok(shape(g2, bg3, before2, snapshot(g2, bg3)) > 0, 'Thrace is')
  })

  test('the armies that came to garrison hate losing men', () => {
    for (const name of ['Britain', 'France', 'Italy']) {
      const g = fresh()
      const f = faction(g, name)
      const before = snapshot(g, f)
      for (const t of f.territories) t.troops = Math.max(1, t.troops - 4)
      assert.ok(shape(g, f, before, snapshot(g, f)) < 0, `${name} counts its casualties`)
    }
  })

  test('a war won beats a war merely survived, for Turkey', () => {
    // exactly N Pact provinces in Turkish hands, so each lands on a known tier
    const holding = (n: number) => {
      const g = fresh()
      for (const slug of NATIONAL_PACT.slice(0, n)) give(g, slug, turkey(g))
      for (const slug of NATIONAL_PACT.slice(n)) give(g, slug, faction(g, 'Greece'))
      return g
    }
    const won = holding(NATIONAL_PACT.length)
    const half = holding(20)
    const routed = holding(6)

    assert.ok(terminal(won, turkey(won)) > terminal(half, turkey(half)))
    assert.ok(terminal(half, turkey(half)) > terminal(routed, turkey(routed)))
    assert.ok(terminal(routed, turkey(routed)) < 0, 'and a bad peace is a bad result')
  })

  test('a faction scripted out of the war is not scored as a rout', () => {
    // Italy evacuates the southwest: it ends with nothing, by treaty, and must
    // not be taught that holding its concession was a mistake
    const g = fresh()
    const italy = faction(g, 'Italy')
    g.turn.configure({ round: 12 })
    setVariable(g, 'withdrawals.Italy', true)
    for (const t of [...italy.territories]) give(g, t.slug, turkey(g))
    assert.equal(italy.eliminated, true)
    assert.equal(g.campaign.atPeace(italy), true, 'it left rather than lost')
    assert.ok(terminal(g, italy, 1) > 0, 'and held its aim while it was there')

    const conquered = fresh()
    const greece = faction(conquered, 'Greece')
    for (const t of [...greece.territories]) give(conquered, t.slug, turkey(conquered))
    assert.equal(terminal(conquered, greece, 1), -1, 'being overrun is another matter')
  })

  test('aimHeld reads the map, not the mood', () => {
    const g = fresh()
    const britain = faction(g, 'Britain')
    assert.ok(aimHeld(g, britain) > 0.5, 'Britain starts on the Straits')
    for (const slug of AIMS.Britain) give(g, slug, turkey(g))
    assert.equal(aimHeld(g, britain), 0)
  })
})

describe('playing a turn through a model', () => {
  const model = new Net([INPUT_SIZE, 8, 1], 3).toJSON()

  test('it only ever offers moves the engine would accept', () => {
    const g = fresh()
    g.turn.configure({ phase: 'attack' })
    for (const move of attackMoves(g, turkey(g))) {
      if (move.kind === 'end') continue
      assert.ok(g.combat.targets(move.from!.slug).includes(move.to!.slug))
    }
  })

  test('stopping is always on the table', () => {
    const g = fresh()
    g.turn.configure({ phase: 'attack' })
    assert.ok(
      attackMoves(g, turkey(g)).some((m) => m.kind === 'end'),
      'it may decline to attack',
    )
    assert.ok(
      fortifyMoves(g, turkey(g)).some((m) => m.kind === 'end'),
      'and decline to move',
    )
  })

  test('a faction with nothing to move offers only the option to stand still', () => {
    const g = fresh()
    for (const t of turkey(g).territories) t.troops = 1
    assert.deepEqual(
      fortifyMoves(g, turkey(g)).map((m) => m.kind),
      ['end'],
    )
  })

  test('reinforcements can go anywhere it holds, and nowhere else', () => {
    const g = fresh()
    const moves = reinforceMoves(turkey(g))
    assert.equal(moves.length, turkey(g).territories.length)
    for (const move of moves) assert.equal(move.from!.faction, turkey(g))
  })

  test('with no model it still plays — it just plays at random', () => {
    const g = fresh()
    const move = chooseMove(g, turkey(g), reinforceMoves(turkey(g)), undefined, 0, () => 0.5)
    assert.ok(move, 'a missing model is not a crash')
  })

  test('the same model on the same board makes the same choice', () => {
    const g = fresh()
    g.turn.configure({ phase: 'attack' })
    const moves = attackMoves(g, turkey(g))
    const a = chooseMove(g, turkey(g), moves, model)
    const b = chooseMove(g, turkey(g), moves, model)
    assert.equal(a, b)
  })

  test('exploration takes the dice instead', () => {
    const g = fresh()
    const moves = reinforceMoves(turkey(g))
    const picked = chooseMove(g, turkey(g), moves, model, 1, () => 0)
    assert.equal(picked, moves[0], 'with explore=1 and a rigged roll it takes the first')
  })

  test('a whole turn leaves the game in a legal state', () => {
    const g = new Game()
    g.turn.configure({ playerIndex: g.players.findIndex((p) => !p.isHuman) })
    g.turn.start()
    const before = g.turn.currentPlayer.faction
    playTurn(g, model)
    assert.notEqual(g.turn.currentPlayer.faction, before, 'the turn passed on')
    assert.equal(g.combat.pendingAdvance, null, 'nothing is left hanging')
    for (const t of g.territories) {
      assert.ok(t.troops >= 1, `${t.slug} kept a garrison`)
      assert.ok(t.faction.territories.includes(t), `${t.slug} is in its owner's list`)
    }
  })

  test('it never leaves reinforcements undeployed', () => {
    const g = new Game()
    const greece = faction(g, 'Greece')
    g.turn.configure({ playerIndex: g.players.findIndex((p) => p.faction === greece) })
    g.turn.start()
    const activeFaction = g.turn.currentPlayer.faction
    setVariable(g, 'sakarya.round', g.turn.round)
    const owed = g.turn.reinforcementsLeft
    const before = activeFaction.troopTotal
    assert.ok(owed > 0, 'it has men to place')
    playTurn(g, model)
    // measured on the faction, not on the game: by now the turn has passed on
    // and reinforcementsLeft belongs to whoever plays next. Men put aboard ship
    // in the transfer phase are still the faction's — they are just not standing
    // in a province this round.
    assert.equal(
      activeFaction.troopTotal + g.movement.troopsAtSea(activeFaction),
      before + owed,
      'every one of them went somewhere',
    )
  })
})

describe('the stretch goals', () => {
  test('every faction has one, and it asks for more than the ordinary aim', () => {
    const g = fresh()
    for (const name of FACTIONS) {
      if (name === 'Turkey') continue
      const goal = ULTIMATE[name] ?? []
      assert.ok(goal.length > 0, `${name} has something to overreach for`)
      for (const slug of goal) assert.ok(g.bySlug[slug], `${name}: ${slug} is on the map`)
      assert.ok(goal.length >= (AIMS[name] ?? []).length, `${name}'s maximum is at least its minimum`)
    }
  })

  test('each reaches for what its maximalists actually wanted', () => {
    assert.ok(ULTIMATE.Greece.includes('istanbul') && ULTIMATE.Greece.includes('edirne'), 'the City and Thrace')
    assert.ok(ULTIMATE.Britain.includes('mosul') && ULTIMATE.Britain.includes('baghdad'), 'Mesopotamia too')
    assert.ok(ULTIMATE.Britain.includes('gelibolu') && ULTIMATE.Britain.includes('canakkale'), 'and the Straits')
    assert.ok(ULTIMATE.France.includes('ankara') && ULTIMATE.France.includes('kastamonu'), 'Ankara and the Black Sea')
    assert.ok(ULTIMATE.Italy.includes('lesbos') && ULTIMATE.Italy.includes('rhodes'), 'the islands')
    assert.ok(ULTIMATE.Italy.includes('canakkale'), 'up to the Marmara')
    assert.ok(ULTIMATE.Armenia.includes('erzurum') && ULTIMATE.Armenia.includes('elazig'), 'the six provinces')
    assert.ok(
      ULTIMATE.Bulgaria.includes('edirne') && ULTIMATE.Bulgaria.includes('istanbul'),
      'Adrianople back, and the City it reached in 1912',
    )
    assert.ok(ULTIMATE.Bulgaria.includes('salonica'), 'and Macedonia')
  })

  test('the ones that start holding theirs must keep it, not merely reach it', () => {
    // Britain begins the war on the Straits and in Mesopotamia: its maximum is
    // not a conquest, it is still being there at the finish
    const g = fresh()
    const britain = faction(g, 'Britain')
    assert.equal(ultimateHeld(g, britain), 1, 'it starts with the whole thing')
    give(g, 'istanbul', turkey(g))
    assert.ok(ultimateHeld(g, britain) < 1, 'and loses it the moment the City goes')
  })

  test('Turkey’s is the whole map, measured as such', () => {
    const g = fresh()
    const before = ultimateHeld(g, turkey(g))
    assert.ok(before > 0 && before < 1, 'it starts with some of it')
    for (const t of g.territories) if (t.faction !== turkey(g)) give(g, t.slug, turkey(g))
    assert.equal(ultimateHeld(g, turkey(g)), 1)
  })

  test('holding the whole of it pays, and half of it barely does', () => {
    for (const name of FACTIONS) {
      if (name === 'Turkey') continue
      const g = fresh()
      const f = faction(g, name)
      const whole = terminal(g, f, 0.5, 1)
      const half = terminal(g, f, 0.5, 0.5)
      const none = terminal(g, f, 0.5, 0)
      assert.ok(whole > none + 0.25, `${name}: the maximum is worth chasing (${whole} vs ${none})`)
      assert.ok(half - none < (whole - none) / 2, `${name}: half of it is worth less than half the bonus`)
    }
  })

  test('the bonus cannot be farmed past a win', () => {
    const g = fresh()
    for (const name of FACTIONS) {
      if (name === 'Turkey') continue
      assert.ok(terminal(g, faction(g, name), 1, 1) <= 1, `${name} stays in range`)
    }
  })

  test('progress towards it pays a breadcrumb, so it can be found at all', () => {
    const g = fresh()
    const f = faction(g, 'Italy')
    const before = snapshot(g, f)
    give(g, 'izmir', f) // on the way to the Marmara, not part of the ordinary aim
    assert.ok(shape(g, f, before, snapshot(g, f)) > 0, 'ground that serves the maximum is worth something')
  })

  test('Turkey is graded on the ending it actually reached', () => {
    const g = fresh()
    const tr = turkey(g)
    for (const slug of NATIONAL_PACT) give(g, slug, tr)
    for (const t of g.territories) if (t.faction !== tr) give(g, t.slug, tr)
    g.checkGameEnd()
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.total.title')
    assert.equal(terminal(g, tr), TURKEY_ENDINGS['overlay.total.title'], 'the whole map tops the ladder')

    // A bad peace holding only four Pact provinces scores negative — but above
    // outright defeat (−1). Being routed off the map is the floor; signing on
    // poor terms is not, so the model always prefers a bad peace to elimination.
    const poor = fresh()
    for (const slug of NATIONAL_PACT.slice(4)) give(poor, slug, faction(poor, 'Greece'))
    const poorScore = terminal(poor, turkey(poor))
    assert.ok(poorScore < 0, 'a poor peace is a loss')
    assert.ok(poorScore > TURKEY_ENDINGS['overlay.defeat.title'], 'but beats being wiped off the map')
  })

  test("Turkey's sub-Pact reward is a continuous ramp, not a staircase", () => {
    // The displayed ending stays a ladder, but the model is graded on a curve
    // that pays for every province held — so it is never stranded on a flat rung
    // with no gradient to climb. The curve pins the ladder's own thresholds.
    const at = (held: number) => {
      const g = fresh()
      const tr = turkey(g)
      const gr = faction(g, 'Greece')
      // Turkey does not start holding the whole Pact (Istanbul, İzmir and the east
      // are occupied in 1919), so set ownership of every Pact province explicitly.
      NATIONAL_PACT.forEach((slug, i) => give(g, slug, i < held ? tr : gr))
      assert.equal(g.pactProgress, held, `set up ${held} Pact provinces held`)
      return terminal(g, tr)
    }
    // every extra province held strictly increases the reward across the range
    let prev = -Infinity
    for (const held of [2, 4, 8, 12, 15, 20, 27, 29]) {
      const score = at(held)
      assert.ok(score > prev, `holding ${held} pays more than fewer`)
      prev = score
    }
    // and it passes through the ladder's thresholds exactly: partial at 15, near at 27
    assert.equal(Number(at(15).toFixed(4)), TURKEY_ENDINGS['overlay.lausanne.partial.title'])
    assert.equal(Number(at(27).toFixed(4)), TURKEY_ENDINGS['overlay.lausanne.near.title'])
  })

  test('the ending ladder runs the right way up', () => {
    const ladder = [
      'overlay.defeat.title',
      'overlay.lausanne.poor.title',
      'overlay.lausanne.partial.title',
      'overlay.lausanne.near.title',
      'overlay.victory.title',
      'overlay.total.title',
    ]
    for (let i = 1; i < ladder.length; i++)
      assert.ok(TURKEY_ENDINGS[ladder[i]] > TURKEY_ENDINGS[ladder[i - 1]], `${ladder[i]} beats ${ladder[i - 1]}`)
    assert.equal(TURKEY_ENDINGS['overlay.total.title'], 1)
    assert.ok(ULTIMATE_BONUS > 0.2, 'and the stretch goal is worth real money')
  })
})

describe('the coalition', () => {
  const OCCUPIERS = ['Greece', 'Britain', 'France', 'Italy', 'Armenia', 'Bulgaria']

  test('every one of them is paid for prising a province off Ankara', () => {
    // without this only Greece had any reason to fight Turkey at all, and the
    // rest minded their own corners while it beat them one at a time
    for (const name of OCCUPIERS) {
      const g = fresh()
      const f = faction(g, name)
      const pact = NATIONAL_PACT.find((slug) => g.bySlug[slug].faction === turkey(g))!
      const before = snapshot(g, f)
      give(g, pact, f)
      const after = snapshot(g, f)
      const withPact = shape(g, f, before, after)

      const g2 = fresh()
      const f2 = faction(g2, name)
      // genuinely neutral: not the Pact, and nothing this faction was after
      const wanted = new Set([...(AIMS[name] ?? []), ...(ULTIMATE[name] ?? [])])
      const neutral = g2.territories.find(
        (t) => !NATIONAL_PACT.includes(t.slug) && !wanted.has(t.slug) && t.faction !== f2,
      )!
      const before2 = snapshot(g2, f2)
      give(g2, neutral.slug, f2)
      const withNeutral = shape(g2, f2, before2, snapshot(g2, f2))

      assert.ok(withPact > withNeutral, `${name} prefers Turkish ground to any other (${withPact} vs ${withNeutral})`)
    }
  })

  test('a Turkey left holding little is a good war for all of them', () => {
    const strong = fresh()
    const weak = fresh()
    // strip Ankara down without touching anybody else's starting ground, or
    // the occupiers get wiped out along with it
    for (const slug of NATIONAL_PACT)
      if (weak.bySlug[slug].faction === turkey(weak) && weak.pactProgress > 6) give(weak, slug, faction(weak, 'Greece'))
    assert.ok(coalitionShare(weak) > coalitionShare(strong))
    for (const name of OCCUPIERS) {
      const better = terminal(weak, faction(weak, name), 0.5, 0)
      const worse = terminal(strong, faction(strong, name), 0.5, 0)
      assert.ok(better > worse, `${name} does better out of a small Turkey (${better} vs ${worse})`)
    }
  })

  test('and none of them has to be the one who won it', () => {
    // holding none of its own aim, but Turkey reduced to nothing, still beats
    // holding all of its aim while Turkey keeps the lot
    const crushed = fresh()
    for (const slug of NATIONAL_PACT)
      if (crushed.bySlug[slug].faction === turkey(crushed)) give(crushed, slug, faction(crushed, 'Bulgaria'))
    const intact = fresh()
    const F = 'France'
    // losing a third of your own war but leaving Ankara with nothing is worth
    // about as much as keeping all of it while Turkey stands: neither half of
    // the reward is allowed to make the other irrelevant
    // measured on the same faction, on boards that differ only in what Ankara
    // still holds, so its own country is the same in both
    const selfish = terminal(intact, faction(intact, F), 1, 0)
    const shared = terminal(crushed, faction(crushed, F), 0.55, 0)
    assert.ok(Math.abs(shared - selfish) < 0.15, `the two halves are comparable (${shared} vs ${selfish})`)
    // and doing both is better than either
    assert.ok(terminal(crushed, faction(crushed, F), 1, 0) > selfish + 0.2, 'both at once is the best war')
    assert.ok(COALITION_BONUS > 0.3, 'and the shared one is worth real money')
  })

  test('it still cannot push anyone past a perfect war', () => {
    const g = fresh()
    for (const slug of NATIONAL_PACT) give(g, slug, faction(g, 'Greece'))
    for (const name of OCCUPIERS) assert.ok(terminal(g, faction(g, name), 1, 1) <= 1, name)
  })

  test('Bulgaria gains from it, but less — it is not in their war', () => {
    const g = fresh()
    // a province neither of them claims for itself — Edirne and the City are
    // Bulgaria's own, and would be paid for as such
    const pact = NATIONAL_PACT.find(
      (slug) => g.bySlug[slug].faction === turkey(g) && !ULTIMATE.Bulgaria.includes(slug),
    )!
    const rate = (name: string) => {
      const fresh2 = fresh()
      const f = faction(fresh2, name)
      const before = snapshot(fresh2, f)
      give(fresh2, pact, f)
      return shape(fresh2, f, before, snapshot(fresh2, f))
    }
    assert.ok(rate('Bulgaria') < rate('France'), 'the Entente fight that war, Sofia only profits by it')
  })
})

describe('a model-driven faction is governed by rules and its own choices', () => {
  test('but the treaties that end their wars still do', () => {
    const g = new Game()
    const ai = new AiTurnController(g, { scorer: () => 0 })
    const seat = g.players.findIndex((p) => p.faction.name === 'Italy')
    g.turn.configure({ round: 20 }) // long past the evacuation
    setVariable(g, 'withdrawals.Italy', true)
    g.turn.configure({ playerIndex: seat })
    g.turn.start()
    ai.beginTurn()
    assert.equal(g.campaign.isPassive(g.turn.currentPlayer.faction), true)
    assert.equal(ai.attackStep(), false, 'a power that has left the war does not attack')
  })

  test('Britain is not fined for pushing north out of Mosul', () => {
    const g = fresh()
    const britain = faction(g, 'Britain')
    const before = snapshot(g, britain)
    // a Pact province taken off Ankara: the shared war, not wandering
    give(g, 'van', britain)
    const shared = shape(g, britain, before, snapshot(g, britain))

    const g2 = fresh()
    const b2 = faction(g2, 'Britain')
    const before2 = snapshot(g2, b2)
    give(g2, 'sofia', b2) // nothing to do with anybody's war
    const wandering = shape(g2, b2, before2, snapshot(g2, b2))

    assert.ok(shared > 0, `pushing into the homeland pays (${shared})`)
    assert.ok(wandering < shared, `and wandering does not (${wandering})`)
  })
})

describe('holding the country you came from', () => {
  test('every faction is paid for the ground it started the war on', () => {
    for (const name of FACTIONS) {
      const g = fresh()
      const f = faction(g, name)
      assert.ok((HOME[name] ?? []).length > 0, `${name} has a country`)
      assert.equal(homeHeld(g, f), 1, `${name} starts holding all of it`)
      const before = snapshot(g, f)
      const lost = HOME[name][0]
      give(g, lost, faction(g, name === 'Bulgaria' ? 'Greece' : 'Bulgaria'))
      assert.ok(shape(g, f, before, snapshot(g, f)) < 0, `${name} feels losing ${lost}`)
    }
  })

  test('Greece now has a reason to defend Salonica', () => {
    // its war aim is seven Anatolian provinces and none of its own country, so
    // Bulgaria — whose whole aim is Macedonia and Thrace — used to walk in free
    const g = fresh()
    const greece = faction(g, 'Greece')
    assert.ok(!(AIMS.Greece ?? []).includes('salonica'), 'not part of the occupation')
    assert.ok(HOME.Greece.includes('salonica'), 'but it is its own')
    const before = snapshot(g, greece)
    give(g, 'salonica', faction(g, 'Bulgaria'))
    assert.ok(shape(g, greece, before, snapshot(g, greece)) < 0, 'and losing it costs')
  })

  test('losing your country costs more than retaking it pays', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    const bulgaria = faction(g, 'Bulgaria')
    const before = snapshot(g, greece)
    give(g, 'salonica', bulgaria)
    const lost = shape(g, greece, before, snapshot(g, greece))

    const held = snapshot(g, greece)
    give(g, 'salonica', greece)
    const regained = shape(g, greece, held, snapshot(g, greece))
    assert.ok(Math.abs(lost) > regained, `a country given away is not usually got back (${lost} vs ${regained})`)
  })

  test('a faction that keeps its country ends better than one that loses it', () => {
    const kept = fresh()
    const lost = fresh()
    for (const slug of HOME.Greece) give(lost, slug, faction(lost, 'Bulgaria'))
    const a = terminal(kept, faction(kept, 'Greece'), 0.5, 0)
    const b = terminal(lost, faction(lost, 'Greece'), 0.5, 0)
    assert.ok(a > b, `keeping it is worth something (${a} vs ${b})`)
  })
})

describe('what a faction is paid to keep, as against what it is paid to take', () => {
  // What one whole war aim is worth at the end, against what one whole homeland
  // is worth. Measured by moving each to zero on its own: heldShare is passed
  // in, home is read off the board, and the coalition term is untouched by
  // either (it counts Turkey's holdings, and nothing here moves them).
  const weights = (name: string) => {
    const g = fresh()
    const f = faction(g, name)
    const aim = terminal(g, f, 1, 0) - terminal(g, f, 0, 0)
    const withHome = terminal(g, f, 0, 0)
    const g2 = fresh()
    const f2 = faction(g2, name)
    const own = HOME[name] ?? []
    // all but one: a faction whose homeland IS its whole presence on the map
    // would be eliminated instead of merely dispossessed, and elimination is a
    // flat −1 that has nothing to do with the weights being measured
    const taker = faction(g2, name === 'Bulgaria' ? 'Greece' : 'Bulgaria')
    for (const slug of own.slice(1)) give(g2, slug, taker)
    const lost = (own.length - 1) / own.length
    return { aim, home: (withHome - terminal(g2, f2, 0, 0)) / lost }
  }

  test('most of them are graded on the war, not on the country they came from', () => {
    const w = weights('Britain')
    assert.ok(w.aim > w.home, `the war (${w.aim.toFixed(2)}) outweighs the homeland (${w.home.toFixed(2)})`)
  })

  test('Greece is graded the other way — Macedonia outbids Smyrna', () => {
    const w = weights('Greece')
    assert.ok(w.home > w.aim, `the homeland (${w.home.toFixed(2)}) outweighs Smyrna (${w.aim.toFixed(2)})`)
  })

  test('losing a home province costs Greece more than an Anatolian one pays', () => {
    const g = fresh()
    const greece = faction(g, 'Greece')
    const before = snapshot(g, greece)
    // one province of Macedonia gone
    give(g, 'salonica', faction(g, 'Bulgaria'))
    const lost = shape(g, greece, before, snapshot(g, greece))

    const g2 = fresh()
    const greece2 = faction(g2, 'Greece')
    const before2 = snapshot(g2, greece2)
    // one province of the occupation zone gained, off Turkey, so the coalition pays too
    give(g2, 'balikesir', greece2)
    const gained = shape(g2, greece2, before2, snapshot(g2, greece2))

    assert.ok(gained > 0, 'taking Turkish ground still pays')
    assert.ok(-lost > gained, `losing home (${(-lost).toFixed(3)}) outweighs taking Anatolia (${gained.toFixed(3)})`)
  })

  test('and it is Greece alone — the others keep the ordinary rate', () => {
    // one province, one soldier in it, so what separates the two numbers is the
    // home rate and not the size of the garrison that went with it
    const costOfLosing = (name: string, slug: string) => {
      const g = fresh()
      const f = faction(g, name)
      g.bySlug[slug].troops = 1
      const before = snapshot(g, f)
      give(g, slug, turkey(g))
      return -shape(g, f, before, snapshot(g, f))
    }
    const greek = costOfLosing('Greece', 'salonica')
    const bulgar = costOfLosing('Bulgaria', 'sofia')
    assert.ok(greek > bulgar * 1.6, `Greece pays ${greek.toFixed(3)} where Bulgaria pays ${bulgar.toFixed(3)}`)
  })
})
