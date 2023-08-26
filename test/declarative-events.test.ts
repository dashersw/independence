import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  applyThen,
  DeclarativeHost,
  evaluate,
  loadDeclarativeCampaign,
  matchesWhen,
  setPath,
} from '../src/events/declarative'
import { CAMPAIGN_DOCUMENT } from '../src/game/campaign-events'
import campaignDocument from '../src/game/campaign-events.json'
import { CAMPAIGN_EVENTS } from '../src/game/campaign-events'

const fixture = () => {
  const variables: Record<string, unknown> = { assembly: { active: true } }
  const territories = [
    { slug: 'a', heldBy: 'Armenia', homelandOwner: 'Turkey', troops: 9, entrenched: 2, quietTurns: 3 },
    { slug: 'b', heldBy: 'Armenia', homelandOwner: 'Greece', troops: 6, entrenched: 1, quietTurns: 2 },
    { slug: 'c', heldBy: 'Turkey', homelandOwner: 'Turkey', troops: 1, entrenched: 0, quietTurns: 0 },
  ]
  const host: DeclarativeHost = {
    root: { variables, territories, game: { round: 10 }, turn: {}, result: {} },
    groups: { homeland: ['c'], west: ['a', 'b'] },
    collections: { territories, factions: [] },
    setVariable(path, value) {
      setPath(variables, path, value)
    },
    setEntity(_collection, entity, field, value) {
      entity[field] = value
    },
  }
  return { host, variables, territories }
}

describe('JSON event rules', () => {
  test('the complete campaign document round-trips through JSON without executable nodes', () => {
    const serialized = JSON.stringify(CAMPAIGN_DOCUMENT)
    assert.deepEqual(JSON.parse(serialized), CAMPAIGN_DOCUMENT)
    const visit = (value: unknown): boolean => {
      if (typeof value === 'function') return false
      if (!value || typeof value !== 'object') return true
      return Object.values(value).every(visit)
    }
    assert.equal(visit(CAMPAIGN_DOCUMENT), true)
    assert.equal(CAMPAIGN_EVENTS.document, CAMPAIGN_DOCUMENT)
    assert.equal('CampaignEventRules' in CAMPAIGN_DOCUMENT, false)
  })

  test('the runtime executes the checked-in JSON document directly', () => {
    assert.equal(CAMPAIGN_DOCUMENT, campaignDocument)
    assert.equal(CAMPAIGN_EVENTS.document, campaignDocument)
    assert.equal(campaignDocument.events.length, 30)
    assert.ok(campaignDocument.rules.length > 0)
  })

  test('the JSON loader rejects invalid campaign files at the boundary', () => {
    assert.throws(() => loadDeclarativeCampaign(null), /JSON object/)
    assert.throws(() => loadDeclarativeCampaign({ $schema: 'campaign-map.v0' }), /schema/)
    assert.throws(() => loadDeclarativeCampaign({ ...campaignDocument, events: 'not-an-array' }), /events array/)
  })

  test('Mongo-style conditions combine array AND, logical OR, groups and collection quantifiers', () => {
    const { host } = fixture()
    assert.equal(
      matchesWhen(
        [
          { 'variables.assembly.active': true },
          { $or: [{ 'game.round': 9 }, { 'game.round': { $gte: 10 } }] },
          { territories: { $none: { slug: { $in: { $group: 'homeland' } }, heldBy: 'Armenia' } } },
        ],
        host,
      ),
      true,
    )
  })

  test('$field references and compact arithmetic expressions are serializable', () => {
    const { host, territories } = fixture()
    const value = evaluate({ $round: [{ $multiply: ['$troops', 0.5] }, 'down'] }, { host, entity: territories[0] })
    assert.equal(value, 4)
    assert.equal(evaluate('$homelandOwner', { host, entity: territories[0] }), 'Turkey')
    assert.equal(evaluate({ $literal: '$homelandOwner' }, { host }), '$homelandOwner')
    assert.equal(
      evaluate('$event.data.shockRounds', {
        host,
        scope: { event: { data: { shockRounds: 2 } } } as never,
      }),
      2,
    )
  })

  test('entity updates evaluate from one snapshot before committing', () => {
    const { host, variables, territories } = fixture()
    applyThen(
      {
        variables: { 'treaties.kars.signed': true },
        territories: [
          {
            where: {
              $and: [{ heldBy: 'Armenia' }, { slug: { $nin: { $group: 'homeland' } } }],
            },
            set: { heldBy: '$homelandOwner', troops: 1 },
          },
        ],
      },
      host,
    )
    assert.equal(((variables.treaties as Record<string, unknown>).kars as Record<string, unknown>).signed, true)
    assert.deepEqual(
      territories.map((t) => [t.heldBy, t.troops]),
      [
        ['Turkey', 1],
        ['Greece', 1],
        ['Turkey', 1],
      ],
    )
  })

  test('sampling and computed updates share the same territory update form', () => {
    const { host, territories } = fixture()
    host.random = () => 0
    applyThen(
      {
        territories: [
          {
            where: { slug: { $in: { $group: 'west' } }, heldBy: 'Armenia', troops: { $gt: 1 } },
            select: { $sample: { fraction: 0.5, round: 'up' } },
            set: {
              troops: { $round: [{ $multiply: ['$troops', 0.5] }, 'down'] },
              entrenched: 0,
              quietTurns: 0,
            },
          },
        ],
      },
      host,
    )
    assert.equal(territories.filter((t) => t.entrenched === 0 && t.slug !== 'c').length, 1)
  })
})
