// The map camera: where a pan may land, how far out a pinch may go, and what
// counts as a flick. All of it is arithmetic, so none of it needs a browser.
import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import {
  VB,
  ZOOM_MAX,
  ZOOM_OUT_FLOOR,
  ZOOM_OUT_MARGIN,
  baseDims,
  clampView,
  minZoomFor,
  dotScaleFor,
  flickVelocity,
  glideStep,
  GLIDE_FRICTION,
  FLICK_MAX,
  LIFT_GRACE
} from '../src/components/viewport'

const LANDSCAPE = 16 / 9
const PORTRAIT = 430 / 932

const frameOf = (v: { z: number; cx: number; cy: number }, aspect: number) => {
  const base = baseDims(aspect)
  const w = base.w / v.z
  const h = base.h / v.z
  return { x: v.cx - w / 2, y: v.cy - h / 2, w, h }
}

describe('the base frame covers the viewport', () => {
  test('a wide screen is filled by the map height', () => {
    const b = baseDims(LANDSCAPE)
    assert.equal(b.h, VB.h, 'full frame height')
    assert.ok(b.w <= VB.w)
  })

  test('a portrait screen is filled by the map height too, cropping the sides', () => {
    const b = baseDims(PORTRAIT)
    assert.equal(Math.round(b.h), VB.h)
    assert.ok(b.w < VB.w / 3, 'only a slice of the width is in frame')
  })
})

describe('panning stays on the map', () => {
  test('the frame never leaves the map on either axis', () => {
    for (const aspect of [LANDSCAPE, PORTRAIT, 1]) {
      for (const z of [1, 2, 5]) {
        for (const [cx, cy] of [
          [-9000, -9000],
          [9000, 9000],
          [VB.x + VB.w / 2, VB.y + VB.h / 2]
        ]) {
          const f = frameOf(clampView(z, cx, cy, aspect), aspect)
          assert.ok(f.x >= VB.x - 0.001, `left edge at z${z}/${aspect}`)
          assert.ok(f.x + f.w <= VB.x + VB.w + 0.001, `right edge at z${z}/${aspect}`)
          assert.ok(f.y >= VB.y - 0.001, `top edge at z${z}/${aspect}`)
          assert.ok(f.y + f.h <= VB.y + VB.h + 0.001, `bottom edge at z${z}/${aspect}`)
        }
      }
    }
  })

  test('the pads let the frame over-pan, by exactly what it is given', () => {
    const f = frameOf(clampView(2, VB.x, -9000, LANDSCAPE, 40, 0), LANDSCAPE)
    assert.ok(Math.abs(f.y - (VB.y - 40)) < 0.001, 'the top pad is spent, and no more')
  })

  test('a frame wider than the map centres instead of sticking to an edge', () => {
    const aspect = PORTRAIT
    const wide = clampView(ZOOM_OUT_FLOOR, -9000, VB.y, aspect)
    const f = frameOf(wide, aspect)
    if (f.w >= VB.w) assert.ok(Math.abs(f.x + f.w / 2 - (VB.x + VB.w / 2)) < 0.001, 'centred horizontally')
    assert.equal(wide.z, ZOOM_OUT_FLOOR)
  })

  test('a frame taller than the map centres vertically', () => {
    const aspect = LANDSCAPE
    const f = frameOf(clampView(0.5, VB.x, 9000, aspect), aspect)
    assert.ok(f.h > VB.h)
    assert.ok(Math.abs(f.y + f.h / 2 - (VB.y + VB.h / 2)) < 0.001)
  })
})

describe('how far out the pinch may go', () => {
  test('a desktop viewport keeps the cover floor', () => {
    assert.equal(minZoomFor(LANDSCAPE, 1440, 900, 300), 1)
  })

  test('a phone may zoom out past cover, keyed to the chrome it has to clear', () => {
    const z = minZoomFor(PORTRAIT, 430, 932, 600)
    assert.ok(z < 1, 'below cover')
    // at that zoom the whole map height lands inside the clear band, with the
    // margin left over as air around it
    const clear = 932 - 600
    const pxPerUnit = (932 * z) / baseDims(PORTRAIT).h
    assert.ok(Math.abs(VB.h * pxPerUnit - clear * ZOOM_OUT_MARGIN) < 0.5)
  })

  test('the whole map fits inside the clear band with room to spare', () => {
    for (const chrome of [200, 400, 600]) {
      const z = minZoomFor(PORTRAIT, 430, 932, chrome)
      const pxPerUnit = (932 * z) / baseDims(PORTRAIT).h
      assert.ok(VB.h * pxPerUnit < 932 - chrome, `map height clears the chrome at ${chrome}px`)
    }
  })

  test('more chrome means more zoom-out', () => {
    const little = minZoomFor(PORTRAIT, 430, 932, 200)
    const lots = minZoomFor(PORTRAIT, 430, 932, 700)
    assert.ok(lots < little)
  })

  test('even with no chrome a phone can pull back off cover', () => {
    const z = minZoomFor(PORTRAIT, 430, 932, 0)
    assert.ok(z < 1, 'there is always air to be had on a phone')
    assert.ok(Math.abs(z - ZOOM_OUT_MARGIN) < 0.001, 'and it is exactly the margin')
  })

  test('it never goes below the floor, however greedy the chrome', () => {
    assert.equal(minZoomFor(PORTRAIT, 430, 932, 100000), ZOOM_OUT_FLOOR)
  })
})

describe('dot scale', () => {
  test('holds screen size at rest and grows by half at full zoom', () => {
    assert.equal(dotScaleFor(1), 1)
    assert.ok(Math.abs(dotScaleFor(ZOOM_MAX) * ZOOM_MAX - 1.5) < 0.001)
  })
})

describe('reading a flick', () => {
  const run = (pts: [number, number, number][], endT = pts[pts.length - 1][2]) =>
    flickVelocity(
      pts.map(([x, y, t]) => ({ x, y, t })),
      endT,
      0.02
    )

  test('a throw carries the direction it was thrown, against the finger', () => {
    const v = run([
      [0, 0, 0],
      [30, 0, 50],
      [60, 0, 100]
    ])
    assert.ok(v)
    assert.ok(Math.abs(v!.vx + 0.6) < 0.001, 'the centre moves opposite the finger')
    assert.equal(v!.vy, -0)
  })

  test('a slow last frame cannot swallow the throw — this is the iOS case', () => {
    const withSlowTail = run([
      [0, 0, 0],
      [40, 0, 40],
      [80, 0, 80],
      [81, 0, 100] // the finger easing off as it lifts
    ])
    assert.ok(withSlowTail, 'still a flick')
    assert.ok(Math.abs(withSlowTail!.vx) > 0.5, 'and still fast')
  })

  test('a finger that came to rest before lifting is a placement, not a throw', () => {
    assert.equal(
      run([
        [0, 0, 0],
        [80, 0, 80],
        [80, 0, 160]
      ]),
      null
    )
  })

  test('a long pause between the last move and the lift is not a throw either', () => {
    const thrown: [number, number, number][] = [
      [0, 0, 0],
      [80, 0, 80]
    ]
    assert.equal(run(thrown, 80 + LIFT_GRACE + 1), null, 'past the grace period it never happened')
    assert.ok(run(thrown, 80 + 10), 'a prompt lift is the full throw')
  })

  test('a late lift fades the throw instead of binning it — the slow-phone case', () => {
    const thrown: [number, number, number][] = [
      [0, 0, 0],
      [120, 0, 60]
    ]
    const prompt = run(thrown, 60)
    const late = run(thrown, 60 + 200)
    assert.ok(prompt && late, 'both still glide')
    assert.ok(
      Math.abs(late!.vx) < Math.abs(prompt!.vx),
      'the late one starts slower, as if it had already been gliding'
    )
    assert.ok(Math.abs(late!.vx) > 0.1, 'but it still moves')
  })

  test('one lonely event for a whole fast flick is still a flick — the iOS case', () => {
    const v = run([
      [0, 0, 0],
      [90, 0, 30]
    ])
    assert.ok(v, 'two samples are enough')
    assert.ok(Math.abs(v!.vx) > 2)
  })

  test('samples sharing a timestamp do not divide by zero', () => {
    const v = run([
      [0, 0, 0],
      [40, 0, 40],
      [60, 0, 40]
    ])
    assert.ok(v === null || Number.isFinite(v.vx), 'never NaN or Infinity')
  })

  test('a freak sample cannot fling the map across the world', () => {
    const v = run([
      [0, 0, 0],
      [100000, 0, 1]
    ])
    assert.ok(v)
    assert.ok(Math.hypot(v!.vx, v!.vy) <= FLICK_MAX + 0.001)
  })

  test('the faster of the two readings wins, so a slow tail cannot veto a fast pair', () => {
    // a long slow drag that ends in a sharp flick: the window average is mild,
    // the last pair is not
    const v = run([
      [0, 0, 0],
      [5, 0, 60],
      [10, 0, 100],
      [90, 0, 116]
    ])
    assert.ok(v)
    assert.ok(Math.abs(v!.vx) > 1, 'the throw at the end is what is felt')
  })

  test('a slow drag is below the threshold', () => {
    assert.equal(
      run([
        [0, 0, 0],
        [1, 0, 200]
      ]),
      null
    )
  })

  test('a tap has nothing to read', () => {
    assert.equal(run([[0, 0, 0]]), null)
    assert.equal(flickVelocity([], 0, 0.02), null)
  })
})

describe('gliding after the throw', () => {
  // zoomed in, mid-map: at z = 1 the frame is exactly as tall as the map and
  // there is no vertical room at all, so an axis test there proves nothing
  const free = (cx: number, cy: number) => clampView(2, cx, cy, LANDSCAPE)
  const MID = free(VB.x + VB.w / 2, VB.y + VB.h / 2)

  test('a frame with no time on it leaves the throw alone', () => {
    // iOS dispatches touchend inside a frame's input phase, so the first
    // rAF timestamp is the START of that same frame — already in the past.
    // dt lands on 0, the step moves nothing, and a naive edge test reads that
    // as having hit the map boundary and bins the throw. This is the bug that
    // stopped momentum dead on a real phone.
    const s = glideStep(MID, 0.9, 0.4, 0, free)
    assert.equal(s.vx, 0.9, 'the throw survives a zero-length frame')
    assert.equal(s.vy, 0.4)
    assert.deepEqual(s.view, MID, 'and the map has not moved')
  })

  test('a frame that arrives before the lift cannot throw the map backwards', () => {
    const s = glideStep(MID, 0.9, 0.4, -8, free)
    assert.equal(s.vx, 0.9, 'no free speed from a negative frame')
    assert.equal(s.vy, 0.4)
    assert.deepEqual(s.view, MID, 'and no travel in reverse')
  })

  test('a real frame carries the map and decays the throw', () => {
    const s = glideStep(MID, 0.9, 0, 16, free)
    assert.ok(s.view.cx > MID.cx, 'the map moved with the throw')
    assert.ok(s.vx > 0 && s.vx < 0.9, 'and the throw is spending itself')
    assert.ok(Math.abs(s.vx - 0.9 * GLIDE_FRICTION) < 1e-9, 'by exactly one frame of friction')
  })

  test('running into the edge spends that axis and no other', () => {
    // hard against the right edge, thrown further right and gently downward
    const atEdge = free(1e6, VB.y + VB.h / 2)
    const s = glideStep(atEdge, 0.9, 0.4, 16, free)
    assert.equal(s.vx, 0, 'the axis that hit the wall is done')
    assert.ok(s.vy !== 0, 'the free axis keeps going')
  })

  test('a glide across open map keeps both axes alive', () => {
    const s = glideStep(MID, 0.5, 0.3, 16, free)
    assert.ok(s.vx > 0 && s.vy > 0, 'nothing was clamped, so nothing is spent')
  })
})
