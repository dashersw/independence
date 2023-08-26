// The map's camera maths, kept free of React and the DOM so it can be tested
// directly. MapView owns the gestures; this owns where they are allowed to land.

export const VB = { x: 30, y: 0, w: 1500, h: 820 }
export const ZOOM_MAX = 5
// below this the map would be a stamp in the middle of the screen
export const ZOOM_OUT_FLOOR = 0.16
// how far past the exact fit the pinch may go: landing precisely on "the map
// touches both bars" feels like hitting a wall mid-gesture, so there is room to
// pull back and see the whole country with air around it
export const ZOOM_OUT_MARGIN = 0.62
// the width at which the HUD stops floating over the map and starts eating it
export const PHONE_MAX_W = 700

export interface View {
  z: number
  cx: number
  cy: number
}

// The base (z = 1) viewBox matches the SCREEN's aspect ratio so the map always
// COVERS the viewport, background-size:cover-style — full frame height on wide
// screens, full width on ultrawide, a pannable crop on portrait.
export const baseDims = (aspect: number) => {
  const w = Math.min(VB.w, VB.h * aspect)
  return { w, h: w / aspect }
}

export const clampView = (
  z: number,
  cx: number,
  cy: number,
  aspect: number,
  padTop = 0,
  padBottom = 0
): View => {
  const base = baseDims(aspect)
  const w = base.w / z
  const h = base.h / z
  // zoomed out past the map itself (phones, see minZoomFor): there is nothing
  // left to pan on that axis, so the map simply centres in the frame
  const x = w >= VB.w ? VB.x + (VB.w - w) / 2 : Math.min(Math.max(cx - w / 2, VB.x), VB.x + VB.w - w)
  // pads let the frame over-pan vertically so map edges hidden under the HUD
  // chrome (top bars, bottom sheet) can be pulled into the clear
  const yMin = VB.y - padTop
  const yMax = Math.max(yMin, VB.y + VB.h - h + padBottom)
  const y = h >= VB.h + padTop + padBottom ? VB.y + (VB.h - h) / 2 : Math.min(Math.max(cy - h / 2, yMin), yMax)
  return { z, cx: x + w / 2, cy: y + h / 2 }
}

/**
 * How far out the pinch may go.
 *
 * On a phone the HUD eats the top and bottom of the screen, so "cover" (z = 1)
 * never shows the whole country at once — there is always a band of it under a
 * bar. Below PHONE_MAX_W the floor drops until the map's full HEIGHT fits the
 * clear band between the chrome. Wider screens keep the cover floor: there the
 * chrome floats over a map that is already fully in frame.
 */
export const minZoomFor = (aspect: number, viewportW: number, viewportH: number, chromePx: number) => {
  if (viewportW > PHONE_MAX_W || viewportH <= 0) return 1
  const clear = Math.max(120, viewportH - chromePx)
  // px per map unit at zoom z is viewportH * z / base.h; the whole map fits
  // when VB.h of them land inside `clear`
  const fit = (clear * baseDims(aspect).h) / (VB.h * viewportH)
  return Math.max(ZOOM_OUT_FLOOR, Math.min(1, fit * ZOOM_OUT_MARGIN))
}

// Army dots hold roughly constant screen size while zooming, growing to 1.5×
// their default size at full zoom.
export const dotScaleFor = (z: number) => (1 + (0.5 * (z - 1)) / (ZOOM_MAX - 1)) / z

/**
 * The velocity of a flick, in map units per ms, read off a window of recent
 * samples rather than the last event alone: iOS almost always emits a slow
 * frame or two as the finger decelerates into the lift, so a single-sample
 * reading lands under the threshold and the glide silently never starts —
 * while a mouse drag in a desktop emulator holds its speed right up to release
 * and always fires. Returns null when the gesture was a placement, not a throw.
 */
export const flickVelocity = (
  samples: { x: number; y: number; t: number }[],
  endT: number,
  minSpeed: number,
  window = 120
): { vx: number; vy: number } | null => {
  const tail = samples[samples.length - 1]
  if (!tail) return null
  // The finger has to have been MOVING as it left the glass. iOS delivers touch
  // events unevenly — sometimes several in one frame sharing a timestamp,
  // sometimes one lonely event for a whole fast flick — so read the throw two
  // ways and believe the faster: across the tail window, and across the last
  // pair alone. Either one on its own drops flicks that really happened.
  const read = (head: { x: number; y: number; t: number } | undefined) => {
    if (!head) return null
    const span = tail.t - head.t
    if (span <= 0) return null
    return { vx: -(tail.x - head.x) / span, vy: -(tail.y - head.y) / span }
  }
  if (endT - tail.t > LIFT_GRACE) return null
  const windowed = read(samples.filter(s => tail.t - s.t <= window)[0])
  const pair = read(samples[samples.length - 2])
  const best = [windowed, pair]
    .filter((v): v is { vx: number; vy: number } => !!v)
    .sort((a, b) => Math.hypot(b.vx, b.vy) - Math.hypot(a.vx, a.vy))[0]
  if (!best) return null
  // The gap between the last movement and the lift DECAYS the throw rather than
  // cancelling it. A hard cutoff punishes a slow phone for being slow: under
  // load the touchend can arrive hundreds of ms after the last touchmove, and a
  // real flick would be thrown away. Let it fade the way it would have faded
  // had the glide already been running.
  const gap = Math.max(0, Math.min(endT - tail.t, LIFT_GRACE))
  const faded = Math.pow(GLIDE_FRICTION, gap / 16)
  const vx = best.vx * faded
  const vy = best.vy * faded
  const speed = Math.hypot(vx, vy)
  if (speed < minSpeed) return null
  if (speed > FLICK_MAX) return { vx: (vx / speed) * FLICK_MAX, vy: (vy / speed) * FLICK_MAX }
  return { vx, vy }
}

/**
 * One frame of the glide: decay the throw, carry the map, and spend an axis
 * that has run into the edge of the map.
 *
 * The subtlety is what counts as having hit the edge. The obvious test — did
 * the map end up where it started? — is wrong, because a frame can fail to
 * move the map for an innocent reason: it was given no time. iOS dispatches
 * touchend inside a frame's input phase, BEFORE that frame's animation
 * callbacks, so the first timestamp the glide sees is the start of a frame
 * that has already begun — dt of zero, sometimes less. On a 120Hz phone that
 * is the common case, and reading it as "we are against the wall" killed the
 * throw on the frame it was born, on both axes at once, in the middle of the
 * map. So a frame with no time on it is skipped rather than integrated, and
 * the edge is judged by whether the clamp actually moved the map somewhere
 * other than where the throw asked to go.
 */
export const glideStep = (
  v: View,
  vx: number,
  vy: number,
  dt: number,
  clamp: (cx: number, cy: number) => View
): { view: View; vx: number; vy: number } => {
  if (!(dt > 0)) return { view: v, vx, vy }
  const k = Math.pow(GLIDE_FRICTION, dt / 16)
  const nvx = vx * k
  const nvy = vy * k
  const wantX = v.cx + nvx * dt
  const wantY = v.cy + nvy * dt
  const view = clamp(wantX, wantY)
  return {
    view,
    vx: Math.abs(view.cx - wantX) > EDGE_EPS ? 0 : nvx,
    vy: Math.abs(view.cy - wantY) > EDGE_EPS ? 0 : nvy
  }
}

// the clamp round-trips the centre through an edge coordinate, so an untouched
// axis can come back a float whisker off; anything above this was really moved
const EDGE_EPS = 1e-6

// the longest gap between the last movement and the lift that still fades
// rather than cancels — beyond this the finger really had come to rest
export const LIFT_GRACE = 400
// one freak sample between two frames can read as an absurd speed; cap it.
// map units per ms — about a screen and a half a second at rest zoom
export const FLICK_MAX = 4
// the glide's own decay, per 16ms frame; the lift gap fades at the same rate
export const GLIDE_FRICTION = 0.94
