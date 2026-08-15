import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { applyTerrainRoll } from '../src/game/terrain'
import type { RandomSource } from '../src/game/random'

const fixed = (value: number): RandomSource => ({ next: () => value })

describe('terrain dice modifiers', () => {
  test('a modifier only shifts a die by one face', () => {
    assert.deepEqual(applyTerrainRoll(fixed(0.99), [6, 4, 1], 10), [6, 5, 2])
    assert.deepEqual(applyTerrainRoll(fixed(0.99), [6, 4, 1], -15), [5, 3, 1])
  })

  test('most rolls remain untouched by small modifiers', () => {
    assert.deepEqual(applyTerrainRoll(fixed(0.5), [5, 3, 2], 10), [5, 3, 2])
    assert.deepEqual(applyTerrainRoll(fixed(0.5), [5, 3, 2], -15), [5, 3, 2])
  })

  test('zero modifiers consume no randomness', () => {
    let calls = 0
    const random: RandomSource = { next: () => (calls++, 0.99) }
    assert.deepEqual(applyTerrainRoll(random, [4, 2], 0), [4, 2])
    assert.equal(calls, 0)
  })
})
