import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { NATIONAL_PACT } from '../src/game/campaign-data'
import { playAiTurn } from '../src/ai/turn-controller'
import { restoreGame, snapshotGame } from '../src/game/snapshot'
import { gameOutcome } from '../src/game/outcome'

/** Play a whole game with both sides on autopilot. Returns how it ended. */
const playOut = (opts: { attackFrom: number; orders?: boolean; maxRounds?: number } = { attackFrom: 14 }) => {
  const { attackFrom, orders = false, maxRounds = 30 } = opts
  const g = new Game()
  const turkey = g.humanPlayer.faction
  let guard = 0
  while (g.turn.phase !== 'gameover' && g.turn.round < maxRounds && guard++ < 4000) {
    if (g.turn.currentPlayer.isHuman) {
      if (g.campaign.pendingDecision)
        g.campaign.resolveDecision(
          g.campaign.pendingDecision.id === 'event.conference' ? 'accept' : orders ? 'requisition' : 'decline',
        )
      g.campaign.clearCards()
      let inner = 0
      while (g.turn.phase === 'reinforce' && g.turn.reinforcementsLeft > 0 && inner++ < 400)
        g.reinforcements.autoPlace()
      if (g.turn.phase === 'reinforce') g.turn.advancePhase()
      if (g.turn.round >= attackFrom) {
        for (let a = 0; a < 12 && g.turn.phase === 'attack'; a++) {
          let best: { from: string; to: string; score: number } | null = null
          for (const from of turkey.territories) {
            if (from.troops < 2) continue
            for (const to of from.adjacent) {
              if (to.faction === turkey || !g.campaign.mayAttack(turkey, to.faction)) continue
              if (!g.combat.worthPressing(from, to)) continue
              const score = from.troops - to.troops
              if (!best || score > best.score) best = { from: from.slug, to: to.slug, score }
            }
          }
          if (!best || !g.combat.begin(best.from, best.to)) break
          let rounds = 0
          while (rounds++ < 60) {
            const result = g.combat.step(best.from, best.to)
            if (!result || !result.pending) break
            if (!g.combat.worthPressing(g.bySlug[best.from], g.bySlug[best.to])) {
              g.combat.pullBack()
              break
            }
          }
          if (g.turn.isGameOver) break
        }
      }
      if (g.turn.phase === 'attack') g.turn.advancePhase()
      if (g.turn.phase === 'fortify') g.turn.advancePhase()
    } else {
      g.campaign.clearCards()
      playAiTurn(g)
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
      if (g.turn.phase !== 'gameover') continue // hit the round cap, which is fine
      const outcome = gameOutcome(g)
      assert.ok(outcome, 'game over must produce an ending')
      assert.ok(outcome.titleKey.startsWith('overlay.'), outcome.titleKey)
    }
  })

  test('Lausanne closes any game that runs long', () => {
    const { g } = playOut({ attackFrom: 30, maxRounds: 30 })
    assert.equal(g.turn.phase, 'gameover', 'the conference must end it')
    assert.ok(g.turn.round <= 27)
  })

  test('the invariants hold every turn', () => {
    const g = new Game()
    let guard = 0
    while (g.turn.phase !== 'gameover' && g.turn.round < 20 && guard++ < 3000) {
      if (g.turn.currentPlayer.isHuman) {
        if (g.campaign.pendingDecision)
          g.campaign.resolveDecision(g.campaign.pendingDecision.id === 'event.conference' ? 'accept' : 'decline')
        g.campaign.clearCards()
        let inner = 0
        while (g.turn.phase === 'reinforce' && g.turn.reinforcementsLeft > 0 && inner++ < 400)
          g.reinforcements.autoPlace()
        if (g.turn.phase === 'reinforce') g.turn.advancePhase()
        if (g.turn.phase === 'attack') g.turn.advancePhase()
        if (g.turn.phase === 'fortify') g.turn.advancePhase()
      } else {
        g.campaign.clearCards()
        playAiTurn(g)
      }
      // no province is ever empty or owned by nobody
      for (const t of g.territories) {
        assert.ok(t.troops >= 1, `${t.slug} emptied out on round ${g.turn.round}`)
        assert.ok(t.faction, `${t.slug} has no owner`)
        assert.ok(t.faction.territories.includes(t), `${t.slug} is not in its owner's list`)
      }
      // a faction's territory list matches the board
      for (const f of g.factions) {
        const owned = g.territories.filter((t) => t.faction === f)
        assert.equal(f.territories.length, owned.length, `${f.name} list is out of sync`)
      }
      // the Pact counter never exceeds the Pact
      assert.ok(g.pactProgress <= NATIONAL_PACT.length)
    }
  })

  test('a saved campaign resumes identically', () => {
    const { g } = playOut({ attackFrom: 14, maxRounds: 12 })
    const snapshot = JSON.parse(JSON.stringify(snapshotGame(g)))
    const restored = new Game()
    restoreGame(restored, snapshot)
    assert.equal(restored.turn.round, g.turn.round)
    assert.equal(restored.pactProgress, g.pactProgress)
    assert.equal(
      restored.territories.reduce((n, t) => n + t.troops, 0),
      g.territories.reduce((n, t) => n + t.troops, 0),
      'total units on the board',
    )
  })

  test('the requisition is a real choice, not a free buff', () => {
    // taking the orders must cost reinforcements while it is open
    const g = new Game()
    for (let r = 1; r <= 10; r++) {
      g.turn.configure({ round: r })
      g.turn.start()
      if (g.campaign.pendingDecision) {
        const before = g.campaign.reinforcementsFor(g.humanPlayer.faction)
        g.campaign.resolveDecision('requisition')
        const after = g.campaign.reinforcementsFor(g.humanPlayer.faction)
        assert.ok(after < before, 'proclaiming must cost something')
        break
      }
      g.campaign.clearCards()
    }
  })
})
