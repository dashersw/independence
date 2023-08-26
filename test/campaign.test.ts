import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game, { NATIONAL_PACT } from '../src/game/game'

/** Play a whole game with both sides on autopilot. Returns how it ended. */
const playOut = (opts: { attackFrom: number; orders?: boolean; maxRounds?: number } = { attackFrom: 14 }) => {
  const { attackFrom, orders = false, maxRounds = 30 } = opts
  const g = new Game()
  const turkey = g.humanPlayer.faction
  let guard = 0
  while (g.phase !== 'gameover' && g.round < maxRounds && guard++ < 4000) {
    if (g.currentPlayer.isHuman) {
      if (g.pendingDecision)
        g.resolveDecision(
          g.pendingDecision.textKey === 'event.conference' ? 'accept' : orders ? 'requisition' : 'decline'
        )
      g.clearEventCards()
      let inner = 0
      while (g.phase === 'reinforce' && g.reinforcementsLeft > 0 && inner++ < 400) g.autoPlaceReinforcements()
      if (g.phase === 'reinforce') g.endPhase()
      if (g.round >= attackFrom) {
        for (let a = 0; a < 12 && g.phase === 'attack'; a++) {
          let best: { from: string; to: string; score: number } | null = null
          for (const from of turkey.territories) {
            if (from.troops < 2) continue
            for (const to of from.adjacent) {
              if (to.faction === turkey || !g.mayAttack(turkey, to.faction)) continue
              if (!g.worthPressing(from, to)) continue
              const score = from.troops - to.troops
              if (!best || score > best.score) best = { from: from.slug, to: to.slug, score }
            }
          }
          if (!best || !g.beginAttack(best.from, best.to)) break
          let rounds = 0
          while (rounds++ < 60) {
            const result = g.attackRound(best.from, best.to)
            if (!result || !result.pending) break
            if (!g.worthPressing(g.bySlug[best.from], g.bySlug[best.to])) {
              g.pullBack()
              break
            }
          }
          if (g.phase === 'gameover') break
        }
      }
      if (g.phase === 'attack') g.endPhase()
      if (g.phase === 'fortify') g.endPhase()
    } else {
      g.clearEventCards()
      g.playAiTurn()
    }
  }
  return { g, stuck: guard >= 4000 }
}

describe('a full campaign', () => {
  test('always terminates', () => {
    for (let seed = 0; seed < 5; seed++) {
      const { stuck } = playOut({ attackFrom: 14 })
      assert.equal(stuck, false, 'the turn loop should never spin')
    }
  })

  test('ends in a real outcome, never mid-air', () => {
    for (let seed = 0; seed < 5; seed++) {
      const { g } = playOut({ attackFrom: 14 })
      if (g.phase !== 'gameover') continue // hit the round cap, which is fine
      assert.ok(g.outcome, 'game over must produce an ending')
      assert.ok(g.outcome?.titleKey.startsWith('overlay.'), g.outcome?.titleKey)
    }
  })

  test('Lausanne closes any game that runs long', () => {
    const { g } = playOut({ attackFrom: 30, maxRounds: 30 })
    assert.equal(g.phase, 'gameover', 'the conference must end it')
    assert.ok(g.round <= 27)
  })

  test('the invariants hold every turn', () => {
    const g = new Game()
    let guard = 0
    while (g.phase !== 'gameover' && g.round < 20 && guard++ < 3000) {
      if (g.currentPlayer.isHuman) {
        if (g.pendingDecision)
          g.resolveDecision(g.pendingDecision.textKey === 'event.conference' ? 'accept' : 'decline')
        g.clearEventCards()
        let inner = 0
        while (g.phase === 'reinforce' && g.reinforcementsLeft > 0 && inner++ < 400) g.autoPlaceReinforcements()
        if (g.phase === 'reinforce') g.endPhase()
        if (g.phase === 'attack') g.endPhase()
        if (g.phase === 'fortify') g.endPhase()
      } else {
        g.clearEventCards()
        g.playAiTurn()
      }
      // no province is ever empty or owned by nobody
      for (const t of g.territories) {
        assert.ok(t.troops >= 1, `${t.slug} emptied out on round ${g.round}`)
        assert.ok(t.faction, `${t.slug} has no owner`)
        assert.ok(t.faction.territories.includes(t), `${t.slug} is not in its owner's list`)
      }
      // a faction's territory list matches the board
      for (const f of g.factions) {
        const owned = g.territories.filter(t => t.faction === f)
        assert.equal(f.territories.length, owned.length, `${f.name} list is out of sync`)
      }
      // the Pact counter never exceeds the Pact
      assert.ok(g.pactProgress <= NATIONAL_PACT.length)
    }
  })

  test('a saved campaign resumes identically', () => {
    const { g } = playOut({ attackFrom: 14, maxRounds: 12 })
    const snapshot = JSON.parse(JSON.stringify(g.serialize()))
    const restored = new Game()
    restored.restore(snapshot)
    assert.equal(restored.round, g.round)
    assert.equal(restored.pactProgress, g.pactProgress)
    assert.equal(
      restored.territories.reduce((n, t) => n + t.troops, 0),
      g.territories.reduce((n, t) => n + t.troops, 0),
      'total units on the board'
    )
  })

  test('the requisition is a real choice, not a free buff', () => {
    // taking the orders must cost reinforcements while it is open
    const g = new Game()
    for (let r = 1; r <= 10; r++) {
      g.round = r
      g.startTurn()
      if (g.pendingDecision) {
        const before = g.reinforcementsFor(g.humanPlayer.faction)
        g.resolveDecision('requisition')
        const after = g.reinforcementsFor(g.humanPlayer.faction)
        assert.ok(after < before, 'proclaiming must cost something')
        break
      }
      g.clearEventCards()
    }
  })
})
