import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import { arcFromParams } from '../src/components/labelLayout'

describe('label arc parameterization', () => {
  test('converts a horizontal chord and bow into a stable quadratic path', () => {
    assert.deepEqual(arcFromParams({ x: 100, y: 50, ang: 0, len: 40, size: 12, bow: -5 }), {
      kind: 'arc',
      d: 'M 80,50 Q 100,40 120,50',
      size: 12,
    })
  })

  test('uses the chord normal for vertical labels', () => {
    assert.equal(arcFromParams({ x: 100, y: 50, ang: 90, len: 40, size: 10, bow: 5 }).d, 'M 100,30 Q 90,50 100,70')
  })

  test('preserves only explicitly supplied paint overrides', () => {
    assert.deepEqual(
      arcFromParams({
        x: 0,
        y: 0,
        ang: 0,
        len: 10,
        size: 9,
        bow: 0,
        fill: '#fff',
        stroke: '#000',
        strokeW: 0,
      }),
      {
        kind: 'arc',
        d: 'M -5,0 Q 0,0 5,0',
        size: 9,
        fill: '#fff',
        stroke: '#000',
        strokeW: 0,
      },
    )
  })
})
