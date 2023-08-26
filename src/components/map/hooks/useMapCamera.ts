import { useEffect, useRef, useState } from 'react'
import { VB, ZOOM_MAX, baseDims, clampView, minZoomFor, dotScaleFor, flickVelocity, glideStep } from '../../viewport'

// screen-pixel height of the HUD chrome hugging the top and bottom edges —
// measured live so desktop cards and the phone bars both work
const hudChromePx = () => {
  let top = 0
  let bottom = 0
  const winH = window.innerHeight
  for (const el of document.querySelectorAll('.hud-brand, .hud-phase, .hud-factions')) {
    const r = el.getBoundingClientRect()
    if (r.top < winH * 0.4) top = Math.max(top, r.bottom)
  }
  for (const el of document.querySelectorAll('.hud-log, .hud-actions')) {
    const r = el.getBoundingClientRect()
    if (r.bottom > winH * 0.6) bottom = Math.max(bottom, winH - r.top)
  }
  return { top, bottom }
}

// the DOM half of minZoomFor: measure the chrome, then ask the pure helper
const minZoomOut = (aspect: number, rect: DOMRect | undefined) => {
  if (typeof window === 'undefined' || !rect || rect.height === 0) return 1
  const chrome = hudChromePx()
  return minZoomFor(aspect, window.innerWidth, rect.height, chrome.top + chrome.bottom)
}

export const useMapCamera = () => {
  // trackpad zoom/pan: pinch (ctrl+wheel) zooms toward the cursor, two-finger
  // scroll pans; the view is a zoom level + center, clamped to the base frame
  const svgRef = useRef<SVGSVGElement | null>(null)
  const [view, setView] = useState({ z: 1, cx: VB.x + VB.w / 2, cy: VB.y + VB.h / 2 })
  // viewRef is the live gesture value; state trails it (committed after the
  // gesture settles) so React never re-renders per pointer frame. Synced from
  // state only when state itself changes — a hover re-render mid-gesture must
  // not clobber the ref with a stale committed value.
  const viewRef = useRef(view)
  useEffect(() => {
    viewRef.current = view
  }, [view])
  const commitTimer = useRef<number | undefined>(undefined)
  // write the viewBox straight to the DOM during gestures; commit to React
  // state (for the dot counter-scaling etc.) once the gesture goes quiet
  const applyView = (v: { z: number; cx: number; cy: number }) => {
    viewRef.current = v
    const svg = svgRef.current
    if (svg) {
      const b = baseDims(aspectRef.current)
      const w = b.w / v.z
      const h = b.h / v.z
      svg.setAttribute('viewBox', `${v.cx - w / 2} ${v.cy - h / 2} ${w} ${h}`)
    }
    window.clearTimeout(commitTimer.current)
    commitTimer.current = window.setTimeout(() => setView(viewRef.current), 150)
  }
  // the screen's aspect ratio drives the base viewBox (cover behavior)
  const [aspect, setAspect] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth / Math.max(1, window.innerHeight) : 16 / 9,
  )
  const aspectRef = useRef(aspect)
  aspectRef.current = aspect
  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    const measure = () => {
      const r = svg.getBoundingClientRect()
      if (r.height > 0) setAspect(r.width / r.height)
    }
    measure()
    // belt and braces: ResizeObserver catches container resizes, the window
    // listeners cover environments where observer delivery is flaky
    const ro = new ResizeObserver(measure)
    ro.observe(svg)
    window.addEventListener('resize', measure)
    window.addEventListener('orientationchange', measure)
    return () => {
      ro.disconnect()
      window.removeEventListener('resize', measure)
      window.removeEventListener('orientationchange', measure)
    }
  }, [])
  // Measuring the HUD costs a layout of five elements, and clampChrome runs on
  // every touchmove and every glide frame — on a slow phone that alone is
  // enough to starve the gesture of events. Measure once per gesture instead:
  // the bars do not move while a finger is down.
  const chromeRef = useRef({ top: 0, bottom: 0 })
  const measureChrome = () => {
    chromeRef.current = hudChromePx()
    return chromeRef.current
  }

  // clamp with the HUD chrome pads folded in (converted to map units at the
  // target zoom's scale)
  const clampChrome = (z: number, cx: number, cy: number, a: number) => {
    const rect = svgRef.current?.getBoundingClientRect()
    if (!rect || rect.height === 0) return clampView(z, cx, cy, a)
    const scale = rect.height / (baseDims(a).h / z)
    const chrome = chromeRef.current
    return clampView(z, cx, cy, a, chrome.top / scale, chrome.bottom / scale)
  }

  // re-clamp on resize so the map keeps covering the new viewport shape
  useEffect(() => {
    measureChrome()
    setView((v) => clampChrome(v.z, v.cx, v.cy, aspect))
  }, [aspect])

  useEffect(() => {
    const svg = svgRef.current
    if (!svg) return
    // native listener: React's synthetic wheel handlers are passive, so they
    // cannot preventDefault the page's own pinch/scroll gestures
    const onWheel = (e: WheelEvent) => {
      e.preventDefault()
      stopGlide()
      measureChrome()
      const v = viewRef.current
      const a = aspectRef.current
      const rect = svg.getBoundingClientRect()
      const base = baseDims(a)
      const w = base.w / v.z
      const h = base.h / v.z
      const scale = Math.min(rect.width / w, rect.height / h)
      const padX = (rect.width - w * scale) / 2
      const padY = (rect.height - h * scale) / 2
      if (e.ctrlKey || e.metaKey) {
        const nz = Math.min(Math.max(v.z * Math.exp(-e.deltaY * 0.012), minZoomOut(a, rect)), ZOOM_MAX)
        // keep the map point under the cursor fixed while the scale changes
        const mx = v.cx - w / 2 + (e.clientX - rect.left - padX) / scale
        const my = v.cy - h / 2 + (e.clientY - rect.top - padY) / scale
        const nx = mx - (mx - (v.cx - w / 2)) * (v.z / nz)
        const ny = my - (my - (v.cy - h / 2)) * (v.z / nz)
        applyView(clampChrome(nz, nx + base.w / nz / 2, ny + base.h / nz / 2, a))
      } else {
        applyView(clampChrome(v.z, v.cx + e.deltaX / scale, v.cy + e.deltaY / scale, a))
      }
    }
    // touch: one finger pans, two fingers pinch-zoom around their midpoint
    const getPts = (e: TouchEvent) => Array.from(e.touches, (t) => [t.clientX, t.clientY])
    // screen px per map unit, for turning finger positions into map distances
    const scaleNow = () => {
      const v = viewRef.current
      const base = baseDims(aspectRef.current)
      const rect = svg.getBoundingClientRect()
      return Math.min(rect.width / (base.w / v.z), rect.height / (base.h / v.z))
    }
    let last: number[][] = []
    // Momentum. The pan is transform-driven rather than a scroll container, so
    // iOS gives it no inertia of its own — a flick simply stops dead the moment
    // the finger leaves. Velocity is sampled in MAP units per ms, so a flick
    // carries the same distance across the map at any zoom — see flickVelocity
    // for how the throw is read off the samples.
    let samples: { x: number; y: number; t: number }[] = []
    const WINDOW = 120
    let vx = 0
    let vy = 0
    let glide = 0
    const stopGlide = () => {
      if (glide) cancelAnimationFrame(glide)
      glide = 0
    }
    const FLICK_MIN = 0.012 // map units/ms below which a lift is not a flick
    const GLIDE_MIN = 0.006 // and below which the glide has arrived
    const onTouchStart = (e: TouchEvent) => {
      stopGlide()
      measureChrome()
      vx = 0
      vy = 0
      last = getPts(e)
      // Seed the buffer with where the finger STARTED. A phone under load may
      // deliver a single touchmove for a whole flick, and one sample has no
      // pair to be read against — the throw then reads as nothing at all.
      samples =
        last.length === 1 ? [{ x: last[0][0] / scaleNow(), y: last[0][1] / scaleNow(), t: performance.now() }] : []
    }
    const onTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      const now = getPts(e)
      const v = viewRef.current
      const a = aspectRef.current
      const rect = svg.getBoundingClientRect()
      const base = baseDims(a)
      const w = base.w / v.z
      const h = base.h / v.z
      const scale = Math.min(rect.width / w, rect.height / h)
      if (now.length === 1 && last.length >= 1) {
        const dx = (now[0][0] - last[0][0]) / scale
        const dy = (now[0][1] - last[0][1]) / scale
        // performance.now() rather than the event's own stamp: Safari has
        // shipped touch timestamps on more than one clock, and a flick read
        // against the wrong epoch is either zero or nonsense
        samples.push({ x: now[0][0] / scale, y: now[0][1] / scale, t: performance.now() })
        while (samples.length > 4 && samples[samples.length - 1].t - samples[0].t > WINDOW) samples.shift()
        applyView(clampChrome(v.z, v.cx - dx, v.cy - dy, a))
      } else if (now.length >= 2 && last.length >= 2) {
        samples = []
        const dist = (p: number[][]) => Math.hypot(p[0][0] - p[1][0], p[0][1] - p[1][1])
        const mid = (p: number[][]) => [(p[0][0] + p[1][0]) / 2, (p[0][1] + p[1][1]) / 2]
        const nz = Math.min(Math.max((v.z * dist(now)) / Math.max(1, dist(last)), minZoomOut(a, rect)), ZOOM_MAX)
        const [cxS, cyS] = mid(now)
        const [lxS, lyS] = mid(last)
        // keep the map point under the pinch midpoint fixed, plus midpoint pan
        const mx = v.cx - w / 2 + (cxS - rect.left) / scale
        const my = v.cy - h / 2 + (cyS - rect.top) / scale
        const nx = mx - (mx - (v.cx - w / 2)) * (v.z / nz)
        const ny = my - (my - (v.cy - h / 2)) * (v.z / nz)
        applyView(
          clampChrome(nz, nx + base.w / nz / 2 - (cxS - lxS) / scale, ny + base.h / nz / 2 - (cyS - lyS) / scale, a),
        )
      }
      last = now
    }
    const onTouchEnd = (e: TouchEvent) => {
      const endT = performance.now()
      last = getPts(e)
      // a lift with fingers still down is a pinch ending, not a flick
      if (last.length > 0) {
        samples = []
        return
      }
      const flick = flickVelocity(samples, endT, FLICK_MIN)
      samples = []
      if (!flick) return
      vx = flick.vx
      vy = flick.vy
      let prev = performance.now()
      const step = (t: number) => {
        // a frame is only worth integrating if time has actually passed since
        // the lift — see glideStep, and the first frame after a touchend on iOS
        const dt = Math.min(32, t - prev)
        if (dt > 0) prev = t
        const v = viewRef.current
        const a = aspectRef.current
        const s = glideStep(v, vx, vy, dt, (cx, cy) => clampChrome(v.z, cx, cy, a))
        vx = s.vx
        vy = s.vy
        if (dt > 0) applyView(s.view)
        glide = Math.hypot(vx, vy) > GLIDE_MIN ? requestAnimationFrame(step) : 0
      }
      glide = requestAnimationFrame(step)
    }
    svg.addEventListener('wheel', onWheel, { passive: false })
    svg.addEventListener('touchstart', onTouchStart, { passive: true })
    svg.addEventListener('touchmove', onTouchMove, { passive: false })
    svg.addEventListener('touchend', onTouchEnd, { passive: true })
    svg.addEventListener('touchcancel', onTouchEnd, { passive: true })
    return () => {
      stopGlide()
      svg.removeEventListener('wheel', onWheel)
      svg.removeEventListener('touchstart', onTouchStart)
      svg.removeEventListener('touchmove', onTouchMove)
      svg.removeEventListener('touchend', onTouchEnd)
      svg.removeEventListener('touchcancel', onTouchEnd)
    }
  }, [])

  const base = baseDims(aspect)
  // render from the live gesture value so an unrelated re-render mid-gesture
  // never writes a stale viewBox over the direct DOM updates
  const viewNow = viewRef.current
  const vw = base.w / viewNow.z
  const vh = base.h / viewNow.z
  const viewBox = `${viewNow.cx - vw / 2} ${viewNow.cy - vh / 2} ${vw} ${vh}`
  const dotScale = dotScaleFor(viewNow.z)

  return { svgRef, aspectRef, viewRef, viewBox, dotScale }
}
