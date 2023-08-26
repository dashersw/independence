import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  centerGraphPoint,
  clampGraphScale,
  fitGraph,
  translateGraph,
  wheelDeltaPixels,
  zoomGraphAt,
} from '../src/events/graph-viewport'

describe('event graph viewport transforms', () => {
  test('centering a selected node preserves the current zoom', () => {
    const result = centerGraphPoint({ x: -120, y: 80, scale: 2.25 }, { x: 300, y: 180 }, { width: 1000, height: 700 })
    assert.deepEqual(result, { x: -175, y: -55, scale: 2.25 })
    assert.equal(result.x + 300 * result.scale, 500)
    assert.equal(result.y + 180 * result.scale, 350)
  })

  test('zoom preserves the graph point below the pointer', () => {
    const before = { x: 40, y: 20, scale: 1 }
    const anchor = { x: 240, y: 120 }
    const graphPoint = {
      x: (anchor.x - before.x) / before.scale,
      y: (anchor.y - before.y) / before.scale,
    }
    const after = zoomGraphAt(before, 2, anchor)

    assert.deepEqual(after, { x: -160, y: -80, scale: 2 })
    assert.equal(after.x + graphPoint.x * after.scale, anchor.x)
    assert.equal(after.y + graphPoint.y * after.scale, anchor.y)
  })

  test('zoom clamps at both safety limits without moving at an already reached limit', () => {
    assert.equal(clampGraphScale(0.001), 0.025)
    assert.equal(clampGraphScale(12), 4)
    const maximum = { x: -30, y: -20, scale: 4 }
    assert.equal(zoomGraphAt(maximum, 8, { x: 100, y: 100 }), maximum)
  })

  test('trackpad pan moves the canvas opposite the scroll delta', () => {
    const result = translateGraph({ x: 20, y: 10, scale: 1.5 }, { x: -12, y: 31 })
    assert.deepEqual(result, { x: 8, y: 41, scale: 1.5 })
  })

  test('fit centers a large graph and leaves the requested margin', () => {
    const result = fitGraph({ width: 1000, height: 500 }, { width: 600, height: 400 }, 20)
    assert.deepEqual(result, { x: 20, y: 60, scale: 0.56 })
  })

  test('fit does not inflate a small graph beyond the legibility cap', () => {
    const result = fitGraph({ width: 100, height: 100 }, { width: 800, height: 600 }, 20)
    assert.deepEqual(result, { x: 342.5, y: 242.5, scale: 1.15 })
  })

  test('fit can preserve a readability floor for detailed focused graphs', () => {
    const fitted = fitGraph({ width: 4000, height: 2000 }, { width: 800, height: 600 }, 28, 1.15, 0.5)
    assert.equal(fitted.scale, 0.5)
    assert.equal(fitted.x, -600)
    assert.equal(fitted.y, -200)
  })

  test('fit safely handles an unmeasured viewport', () => {
    assert.deepEqual(fitGraph({ width: 0, height: 100 }, { width: 800, height: 600 }), { x: 0, y: 0, scale: 1 })
  })

  test('wheel deltas normalize line and page modes', () => {
    assert.deepEqual(wheelDeltaPixels({ x: 2, y: -3 }, 0, 700), { x: 2, y: -3 })
    assert.deepEqual(wheelDeltaPixels({ x: 2, y: -3 }, 1, 700), { x: 32, y: -48 })
    assert.deepEqual(wheelDeltaPixels({ x: 0, y: 1 }, 2, 700), { x: 0, y: 700 })
  })
})
