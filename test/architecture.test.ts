import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { SeededRandom } from '../src/game/random'
import { loadScenario } from '../src/game/scenario'
import scenario from '../src/game/scenario.json'
import campaign from '../src/game/campaign-events.json'
import { loadDeclarativeCampaign } from '../src/events/declarative'
import { restoreGame, snapshotGame } from '../src/game/snapshot'
import { renderLogEntry } from '../src/game/log'
import { setLang } from '../src/i18n'

describe('validated data boundaries', () => {
  test('rejects malformed scenario settings', () => {
    assert.throws(
      () => loadScenario({ ...scenario, movement: { ...scenario.movement, crossingCapacity: 0 } }),
      /crossingCapacity/,
    )
    assert.throws(
      () =>
        loadScenario({
          ...scenario,
          combat: { advanceDepth: { ...scenario.combat.advanceDepth, homeland: -1 } },
        }),
      /homeland/,
    )
  })

  test('rejects duplicate IDs, unknown dependencies, groups and operators', () => {
    assert.throws(
      () => loadDeclarativeCampaign({ ...campaign, events: [...campaign.events, campaign.events[0]] }),
      /duplicate event id/,
    )
    const dependency = structuredClone(campaign)
    dependency.events[0].gate = { id: 'bad', label: 'bad', requires: ['event.missing'] }
    assert.throws(() => loadDeclarativeCampaign(dependency), /requires unknown event/)
    const group = structuredClone(campaign) as unknown as Record<string, unknown>
    ;(group.events as Array<Record<string, unknown>>)[0].when = [
      { territories: { $some: { slug: { $in: { $group: 'missing' } } } } },
    ]
    assert.throws(() => loadDeclarativeCampaign(group), /unknown group/)
    const operator = structuredClone(campaign) as unknown as Record<string, unknown>
    ;(operator.events as Array<Record<string, unknown>>)[0].when = [{ $wat: [] }]
    assert.throws(() => loadDeclarativeCampaign(operator), /unsupported operator/)
  })
})

describe('owned mutable state', () => {
  test('a failed simulation restores ownership and every board field', () => {
    const game = new Game()
    const before = game.board.snapshot()
    assert.throws(() =>
      game.board.simulate(
        () => {
          const territory = game.bySlug.ankara
          game.board.changeControl(
            territory,
            game.factions.find((faction) => faction.name === 'Greece')!,
            8,
          )
          territory.troops = 99
        },
        () => {
          throw new Error('stop')
        },
      ),
    )
    assert.deepEqual(game.board.snapshot(), before)
  })

  test('a seeded random source resumes from its save state', () => {
    const game = new Game({ random: new SeededRandom(42) })
    game.drawCard(game.humanPlayer.faction)
    const snapshot = snapshotGame(game)
    const expected = game.random.next()
    const restored = new Game({ random: new SeededRandom(1) })
    restoreGame(restored, snapshot)
    assert.equal(restored.random.next(), expected)
  })

  test('structured logs render in the currently selected language', () => {
    const game = new Game()
    const entry = game.log[0]
    setLang('en')
    const english = renderLogEntry(entry)
    setLang('tr')
    const turkish = renderLogEntry(entry)
    setLang('en')
    assert.notEqual(english, turkish)
  })
})
