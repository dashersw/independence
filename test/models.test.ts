// The trained models as shipped. These are generated files, but the game reads
// them on every AI turn, so a corrupt or mismatched one is a broken game and
// not a broken training run — worth catching here rather than in the browser.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import Game from '../src/game/game'
import { INPUT_SIZE, features } from '../src/ai/features'
import { NetJSON, evaluate } from '../src/ai/net'
import { makeScorer, attackMoves } from '../src/ai/policy'
import { fresh, turkey, faction } from './helpers'

const DIR = join(import.meta.dirname, '../src/ai/models')
const FACTIONS = ['Turkey', 'Greece', 'Britain', 'France', 'Italy', 'Armenia', 'Bulgaria']
const load = (name: string) => JSON.parse(readFileSync(join(DIR, `${name.toLowerCase()}.json`), 'utf8')) as NetJSON

describe('the shipped models', () => {
  test('there is one per faction, and nothing else', () => {
    const files = readdirSync(DIR).filter(f => f.endsWith('.json')).sort()
    assert.deepEqual(files, FACTIONS.map(n => `${n.toLowerCase()}.json`).sort())
  })

  test('each takes the vector the game actually builds', () => {
    for (const name of FACTIONS) {
      const model = load(name)
      assert.equal(model.sizes[0], INPUT_SIZE, `${name} input width`)
      assert.equal(model.sizes[model.sizes.length - 1], 1, `${name} is a value net`)
      assert.equal(model.weights.length, model.sizes.length - 1, `${name} layer count`)
      for (const [l, layer] of model.weights.entries()) {
        assert.equal(layer.length, model.sizes[l + 1], `${name} layer ${l} width`)
        for (const row of layer) assert.equal(row.length, model.sizes[l], `${name} layer ${l} fan-in`)
      }
    }
  })

  test('no weight is broken, and none has run away', () => {
    for (const name of FACTIONS) {
      const model = load(name)
      const all = [...model.weights.flat(2), ...model.biases.flat()]
      for (const w of all) assert.ok(Number.isFinite(w), `${name} has a non-finite weight`)
      const worst = Math.max(...all.map(Math.abs))
      assert.ok(worst < 50, `${name} weights top out at ${worst}`)
    }
  })

  test('they are trained, not fresh out of the box', () => {
    // an untrained net has zero biases everywhere; a trained one does not
    for (const name of FACTIONS) {
      const model = load(name)
      assert.ok(model.biases.flat().some(b => b !== 0), `${name} has learned something`)
    }
  })

  test('each scores a real position without complaint', () => {
    const g = fresh()
    for (const name of FACTIONS) {
      const f = faction(g, name)
      const from = f.territories[0]
      const value = evaluate(load(name), features(g, f, { kind: 'attack', from, to: from.adjacent[0] }))
      assert.ok(Number.isFinite(value) && value >= -1 && value <= 1, `${name} → ${value}`)
    }
  })

  test('they disagree with each other — seven players, not one copied seven times', () => {
    const g = fresh()
    const f = faction(g, 'Greece')
    const from = f.territories[0]
    const input = features(g, f, { kind: 'attack', from, to: from.adjacent[0] })
    const values = FACTIONS.map(name => evaluate(load(name), input))
    const spread = Math.max(...values) - Math.min(...values)
    assert.ok(spread > 0.01, `the same position reads differently to each of them (spread ${spread})`)
  })

  test('wired into the engine, an AI turn plays and ends', () => {
    const g = new Game()
    const models = Object.fromEntries(FACTIONS.map(n => [n, load(n)]))
    g.aiScorer = makeScorer(models)
    g.currentPlayerIndex = g.players.findIndex(p => !p.isHuman)
    g.startTurn()
    const before = g.currentPlayer.faction
    g.aiBeginTurn()
    let steps = 0
    while (g.aiAttackStep() && steps++ < 20) {
      /* one attack per step, as the UI paces them */
    }
    g.aiFinishTurn()
    assert.notEqual(g.currentPlayer.faction, before, 'the turn passed on')
    assert.equal(g.pendingAdvance, null)
    for (const t of g.territories) assert.ok(t.troops >= 1, `${t.slug} kept a garrison`)
  })

  test('a model-driven game runs to a real ending', () => {
    const g = new Game()
    const models = Object.fromEntries(FACTIONS.map(n => [n, load(n)]))
    g.aiScorer = makeScorer(models)
    let guard = 0
    while (g.phase !== 'gameover' && g.round < 30 && guard++ < 4000) {
      if (g.pendingDecision) g.resolveDecision(g.pendingDecision.textKey === 'event.conference' ? 'accept' : 'decline')
      g.clearEventCards()
      if (g.currentPlayer.isHuman) {
        while (g.phase === 'reinforce' && g.reinforcementsLeft > 0) g.autoPlaceReinforcements()
        if (g.phase === 'reinforce') g.endPhase()
        if (g.phase === 'attack') g.endPhase()
        if (g.phase === 'fortify') g.endPhase()
      } else {
        g.aiBeginTurn()
        let steps = 0
        while (g.aiAttackStep() && steps++ < 20) {
          /* step through */
        }
        g.aiFinishTurn()
      }
    }
    assert.ok(guard < 4000, 'the loop never spun')
    assert.ok(g.phase === 'gameover' || g.round >= 30)
    if (g.phase === 'gameover') assert.ok(g.outcome, 'and it produced an ending')
  })

  test('an AI faction only ever plays legal orders', () => {
    const g = new Game()
    const models = Object.fromEntries(FACTIONS.map(n => [n, load(n)]))
    g.aiScorer = makeScorer(models)
    g.currentPlayerIndex = g.players.findIndex(p => !p.isHuman)
    g.startTurn()
    const faction = g.currentPlayer.faction
    g.aiBeginTurn()
    // whatever it is about to do, the engine would accept it from this seat
    for (const move of attackMoves(g, faction)) {
      if (move.kind === 'end') continue
      assert.ok(g.attackTargets(move.from!.slug).includes(move.to!.slug), `${move.from!.slug} → ${move.to!.slug}`)
    }
  })
})
