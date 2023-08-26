import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game, { NATIONAL_PACT } from '../src/game/game'
import territoriesData from '../src/game/territories.json'
import factionData from '../src/game/factions.json'
import playerData from '../src/game/db.json'

const slugs = new Set(territoriesData.territories.map(t => t.slug))

describe('territory data', () => {
  test('slugs are unique', () => {
    assert.equal(slugs.size, territoriesData.territories.length)
  })

  test('every territory has a name', () => {
    for (const t of territoriesData.territories) assert.ok(t.name?.length, `${t.slug} has no name`)
  })

  test('every adjacency points at a real province', () => {
    for (const t of territoriesData.territories)
      for (const other of t.adjacentTerritories) assert.ok(slugs.has(other), `${t.slug} → ${other} does not exist`)
  })

  test('no province is adjacent to itself', () => {
    for (const t of territoriesData.territories)
      assert.ok(!t.adjacentTerritories.includes(t.slug), `${t.slug} borders itself`)
  })

  test('adjacency is symmetric on the built graph', () => {
    const g = new Game()
    for (const t of g.territories)
      for (const other of t.adjacent)
        assert.ok(other.adjacent.includes(t), `${t.slug} → ${other.slug} is one-way`)
  })

  test('no duplicate adjacencies', () => {
    for (const t of territoriesData.territories)
      assert.equal(new Set(t.adjacentTerritories).size, t.adjacentTerritories.length, `${t.slug} repeats a neighbour`)
  })

  test('every province is reachable from Ankara', () => {
    const g = new Game()
    const seen = new Set(['ankara'])
    const queue = ['ankara']
    while (queue.length) {
      const current = g.bySlug[queue.shift() as string]
      for (const next of current.adjacent)
        if (!seen.has(next.slug)) {
          seen.add(next.slug)
          queue.push(next.slug)
        }
    }
    const unreachable = g.territories.filter(t => !seen.has(t.slug)).map(t => t.slug)
    assert.deepEqual(unreachable, [], 'the map must be one connected landmass')
  })

  test('the eastern border runs Trabzon–Kars–Gyumri', () => {
    const g = new Game()
    const neighbours = (slug: string) => g.bySlug[slug].adjacent.map(a => a.slug)
    assert.ok(neighbours('trabzon').includes('gyumri'), 'Trabzon borders Gyumri on the map')
    assert.ok(neighbours('gyumri').includes('trabzon'))
    assert.ok(neighbours('trabzon').includes('kars'))
    assert.ok(neighbours('kars').includes('gyumri'))
  })

  test('no province is isolated', () => {
    for (const t of territoriesData.territories)
      assert.ok(t.adjacentTerritories.length > 0, `${t.slug} borders nothing`)
  })
})

describe('faction data', () => {
  test('every starting province exists and is claimed once', () => {
    const claimed = new Map<string, string>()
    for (const f of factionData.factions)
      for (const t of f.territories) {
        assert.ok(slugs.has(t.slug), `${f.name} starts with ${t.slug}, which does not exist`)
        assert.ok(!claimed.has(t.slug), `${t.slug} is claimed by both ${claimed.get(t.slug)} and ${f.name}`)
        claimed.set(t.slug, f.name)
      }
  })

  test('every province on the map has a starting owner', () => {
    const claimed = new Set(factionData.factions.flatMap(f => f.territories.map(t => t.slug)))
    const orphans = [...slugs].filter(s => !claimed.has(s))
    assert.deepEqual(orphans, [], 'unowned provinces would break the board')
  })

  test('every garrison starts at one or more', () => {
    for (const f of factionData.factions)
      for (const t of f.territories) assert.ok(t.troops >= 1, `${t.slug} starts empty`)
  })

  test('Iraq starts with nothing — it enters play in 1924', () => {
    const iraq = factionData.factions.find(f => f.name === 'Iraq')
    assert.ok(iraq)
    assert.equal(iraq?.territories.length, 0)
  })

  test('every faction has a colour', () => {
    for (const f of factionData.factions) assert.ok(f.color?.length, `${f.name} has no colour`)
  })
})

describe('player data', () => {
  test('exactly one human', () => {
    assert.equal(playerData.players.filter(p => p.type === 'Human').length, 1)
  })

  test('the human plays Turkey', () => {
    assert.equal(playerData.players.find(p => p.type === 'Human')?.faction, 'Turkey')
  })

  test('every player maps to a real faction', () => {
    const names = new Set(factionData.factions.map(f => f.name))
    for (const p of playerData.players) assert.ok(names.has(p.faction), `${p.name} plays ${p.faction}`)
  })

  test('a faction may exist without a player, but not the reverse', () => {
    const played = new Set(playerData.players.map(p => p.faction))
    assert.ok(!played.has('Iraq'), 'Iraq never takes a turn')
    const g = new Game()
    assert.equal(g.players.length, playerData.players.length)
    for (const p of g.players) assert.ok(p.faction, `${p.name} has no faction object`)
  })
})

describe('the National Pact', () => {
  test('names thirty real provinces', () => {
    assert.equal(NATIONAL_PACT.length, 30)
    for (const slug of NATIONAL_PACT) assert.ok(slugs.has(slug), `${slug} is not on the map`)
  })

  test('has no duplicates', () => {
    assert.equal(new Set(NATIONAL_PACT).size, NATIONAL_PACT.length)
  })

  test('is fully reachable using only Pact provinces from the Turkish start', () => {
    const g = new Game()
    const pact = new Set(NATIONAL_PACT)
    const start = g.humanPlayer.faction.territories.filter(t => pact.has(t.slug)).map(t => t.slug)
    const seen = new Set(start)
    const queue = [...start]
    while (queue.length) {
      const current = g.bySlug[queue.shift() as string]
      for (const next of current.adjacent)
        if (pact.has(next.slug) && !seen.has(next.slug)) {
          seen.add(next.slug)
          queue.push(next.slug)
        }
    }
    assert.equal(seen.size, NATIONAL_PACT.length, 'no Pact province may be walled off behind foreign land')
  })

  test('Turkey starts holding a majority of it', () => {
    const g = new Game()
    assert.ok(g.pactProgress >= 15, `starts with ${g.pactProgress}`)
    assert.ok(g.pactProgress < NATIONAL_PACT.length, 'but not all of it')
  })
})
