import type { LabelLayout, TerritoryShape } from './types'

const LABEL_FONT = "700 100px 'Iowan Old Style', 'Palatino Linotype', Palatino, Georgia, serif"
const MAX_SIZE = 32
const MIN_ARC_SIZE = 8.5
const FRAME = { x1: 30, y1: 0, x2: 1530, y2: 820 }

export const PARAMS = {
  centerW: 0.8, // weight of optical-center distance in the score
  centerExp: 1, // 1 = linear in dist/R, 2 = forgive small offsets
  rDiv: 1.5, // R divisor — larger judges distance against a smaller yardstick
  flatBias: 1 / 800, // extra penalty per |deg| to break near-ties toward flat
  grainMul: 1, // multiplier on the PCA grain target angle
  grainKnee: 0.25, // elongation below which a shape counts as round (flat text)
  bowComp: 0.6, // fraction of the expected crown bow added to the baseline drop
  ctrExp: 0, // clearance weighting of the visual center (0 = area centroid)
  thick: 0.52, // min clearance along the text window, in em
  corrKnee: 0.4, // spine-vs-width corridor-ness above which the chord takes over
  angDiv: 150, // deviation-from-target divisor — larger forgives tilt more
  comfortW: 0, // preference for roomy placements over pinched necks
  aimK: 1.4, // how fast the aim eases from the room's center to the shape center
}

type Pt = [number, number]
interface Spine {
  pts: Pt[]
  len: number
  // how far the window sits from the middle of its own run (map units) —
  // nonzero means unbalanced margins along the reading direction
  alongOff?: number
}

export function computeLayout(ctx: CanvasRenderingContext2D, data: TerritoryShape, name: string): LabelLayout {
  const [bx1, by1, bx2, by2] = data.bbox as number[]
  const paths = (data.paths as string[]).map((d) => new Path2D(d))
  const step = Math.max(2.5, Math.min(bx2 - bx1, by2 - by1) / 44)
  const W = Math.max(2, Math.round((bx2 - bx1) / step))
  const H = Math.max(2, Math.round((by2 - by1) / step))

  const inside = new Uint8Array(W * H)
  let count = 0
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const x = bx1 + (i + 0.5) * step
      const y = by1 + (j + 0.5) * step
      if (x < FRAME.x1 || x > FRAME.x2 || y < FRAME.y1 || y > FRAME.y2) continue
      if (paths.some((p) => ctx.isPointInPath(p, x, y))) {
        inside[j * W + i] = 1
        count++
      }
    }
  if (count < 14) return { kind: 'plain', size: 8.5 }

  // clearance to the nearest outside cell (two-pass chamfer transform, grid units)
  const clear = new Float32Array(W * H)
  for (let k = 0; k < W * H; k++) clear[k] = inside[k] ? 1e9 : 0
  const at = (i: number, j: number) => (i < 0 || j < 0 || i >= W || j >= H ? 0 : clear[j * W + i])
  for (let j = 0; j < H; j++)
    for (let i = 0; i < W; i++) {
      const k = j * W + i
      if (!clear[k]) continue
      clear[k] = Math.min(clear[k], at(i - 1, j) + 1, at(i, j - 1) + 1, at(i - 1, j - 1) + 1.4, at(i + 1, j - 1) + 1.4)
    }
  for (let j = H - 1; j >= 0; j--)
    for (let i = W - 1; i >= 0; i--) {
      const k = j * W + i
      if (!clear[k]) continue
      clear[k] = Math.min(clear[k], at(i + 1, j) + 1, at(i, j + 1) + 1, at(i + 1, j + 1) + 1.4, at(i - 1, j + 1) + 1.4)
    }

  // tracking ramps smoothly with size — a hard jump at one size makes that
  // size disproportionately long and caps labels just under the threshold
  const track = (s: number) => Math.min(0.18, 0.08 + Math.max(0, s - 13) * 0.02)
  ctx.font = LABEL_FONT
  const nameEm = ctx.measureText(name).width / 100
  const textLen = (s: number) => (nameEm + name.length * track(s)) * s
  const clearAt = ([x, y]: Pt) => {
    const i = Math.max(0, Math.min(W - 1, Math.round((x - bx1) / step - 0.5)))
    const j = Math.max(0, Math.min(H - 1, Math.round((y - by1) / step - 0.5)))
    return clear[j * W + i] * step
  }

  const cellXY = (k: number): Pt => [bx1 + ((k % W) + 0.5) * step, by1 + (((k / W) | 0) + 0.5) * step]

  // centroid of the whole (viewport-clipped) shape — the label should look
  // centered in the region the eye sees, not merely in the band it fits in.
  // Optionally clearance-weighted so thin appendages (a coastal arm, a
  // panhandle) don't drag the perceived center away from the region's body.
  let cxSum = 0
  let cySum = 0
  let wSum = 0
  for (let k = 0; k < W * H; k++)
    if (inside[k]) {
      const [x, y] = cellXY(k)
      const wt = PARAMS.ctrExp ? Math.pow(clear[k], PARAMS.ctrExp) : 1
      cxSum += x * wt
      cySum += y * wt
      wSum += wt
    }
  const sCtr: Pt = [cxSum / wSum, cySum / wSum]
  const insideCells: number[] = []
  for (let k = 0; k < W * H; k++) if (inside[k]) insideCells.push(k)

  // the region's grain — principal axis and elongation of the WHOLE shape.
  // Measuring this on the per-size thick component instead gives garbage for
  // narrow strips: the fittable chunk of a steep sliver reads as round, so
  // the sliver's own axis never becomes the target angle.
  let gxx = 0
  let gyy = 0
  let gxy = 0
  for (const k of insideCells) {
    const [x, y] = cellXY(k)
    gxx += (x - sCtr[0]) * (x - sCtr[0])
    gyy += (y - sCtr[1]) * (y - sCtr[1])
    gxy += (x - sCtr[0]) * (y - sCtr[1])
  }
  const gDisc = Math.sqrt(Math.max(0, ((gxx - gyy) / 2) ** 2 + gxy * gxy))
  const gl1 = (gxx + gyy) / 2 + gDisc
  const gl2 = Math.max(0, (gxx + gyy) / 2 - gDisc)
  let phiShape = (Math.atan2(gl1 - gxx, gxy) * 180) / Math.PI
  if (phiShape > 90) phiShape -= 180
  if (phiShape < -90) phiShape += 180
  const elongShape = 1 - Math.sqrt(gl2 / Math.max(1e-6, gl1)) // 0 round … 1 line

  const smoothed = (P: Pt[], frac: number): Pt[] => {
    const win = Math.max(1, Math.round(P.length / frac))
    const pass = (Q: Pt[]) =>
      Q.map((_, idx) => {
        let sx = 0
        let sy = 0
        let c = 0
        for (let t = -win; t <= win; t++) {
          const q = Q[Math.min(Q.length - 1, Math.max(0, idx + t))]
          sx += q[0]
          sy += q[1]
          c++
        }
        return [sx / c, sy / c] as Pt
      })
    const S = pass(pass(P))
    // the clamped moving average drags both ends inward, silently eating
    // ~1/6 of the usable length — shear the result back onto the original
    // endpoints so a run barely longer than the text still fits it
    const n = P.length - 1
    if (n < 1) return S
    const d0: Pt = [P[0][0] - S[0][0], P[0][1] - S[0][1]]
    const d1: Pt = [P[n][0] - S[n][0], P[n][1] - S[n][1]]
    return S.map((q, idx) => {
      const t = idx / n
      return [q[0] + d0[0] * (1 - t) + d1[0] * t, q[1] + d0[1] * (1 - t) + d1[1] * t] as Pt
    })
  }
  const lengthOf = (P: Pt[]) => {
    let L = 0
    for (let i = 1; i < P.length; i++) L += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1])
    return L
  }

  // largest connected component of cells thick enough for a given size
  const thickComp = (size: number): { cells: number[]; comp: Int32Array; id: number; seed: number } | null => {
    const need = (0.55 * size) / step
    const ok = (k: number) => inside[k] === 1 && clear[k] >= need
    const comp = new Int32Array(W * H).fill(-1)
    let bestId = -1
    let bestSize = 0
    let bestSeed = -1
    let id = 0
    const stack: number[] = []
    for (let k0 = 0; k0 < W * H; k0++) {
      if (!ok(k0) || comp[k0] >= 0) continue
      let sz = 0
      stack.push(k0)
      comp[k0] = id
      while (stack.length) {
        const k = stack.pop() as number
        sz++
        const ci = k % W
        const cj = (k / W) | 0
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ni = ci + di
            const nj = cj + dj
            if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue
            const nk = nj * W + ni
            if (ok(nk) && comp[nk] < 0) {
              comp[nk] = id
              stack.push(nk)
            }
          }
      }
      if (sz > bestSize) {
        bestSize = sz
        bestId = id
        bestSeed = k0
      }
      id++
    }
    if (bestId < 0) return null
    const cells: number[] = []
    for (let k = 0; k < W * H; k++) if (comp[k] === bestId) cells.push(k)
    return { cells, comp, id: bestId, seed: bestSeed }
  }

  // straight-ish baseline along a direction: among all "latitudes" (single
  // perpendicular offsets) whose contiguous run of thick cells is long enough
  // for the text, take the one closest to the region's center — never merely
  // the longest run, which drifts to wherever the widest band happens to be.
  // The used window is then centered on the centroid along the line, too.
  // Text sits ON its baseline with glyphs rising ~0.72em above it, and the
  // crown arc lifts the middle of the line further still — so the baseline is
  // aimed below the centroid by half the cap height plus the expected bow.
  // That puts the text's optical middle, not its underside, on the center.
  const baseDrop = (size: number) =>
    0.36 * size + PARAMS.bowComp * Math.min(0.55 * size, Math.max(2, 0.05 * textLen(size)))
  // ctrA centers the text window along the reading direction (the shape's
  // visual center); ctrP picks the latitude across it (the roomy band's
  // center) — conflating the two drags labels toward the widest lobe
  // Returns EVERY plausible baseline at this direction and size — one per
  // latitude whose contiguous run holds the text, and up to three window
  // placements (left/center/right) when the run has slack. Generating the
  // full candidate set and letting the optical-center score arbitrate is
  // what lets a label sit low in one region and high in another without any
  // per-city rules; picking a single "best latitude" here starved the scorer.
  const sliceSpines = (cells: number[], theta: number, minLen: number, size: number, ctrA: Pt): Spine[] => {
    const ux = Math.cos(theta)
    const uy = Math.sin(theta)
    const vxx = -uy
    const vyy = ux
    const w = step * 1.2
    // grid extents come from the WHOLE inside mask so the thick corridor and
    // the visual corridor share bins
    let aMin = Infinity
    let aMax = -Infinity
    let pMin = Infinity
    let pMax = -Infinity
    const projAll = insideCells.map((k) => {
      const [x, y] = cellXY(k)
      const a = x * ux + y * uy
      const p = x * vxx + y * vyy
      aMin = Math.min(aMin, a)
      aMax = Math.max(aMax, a)
      pMin = Math.min(pMin, p)
      pMax = Math.max(pMax, p)
      return [a, p]
    })
    const na = Math.max(1, Math.ceil((aMax - aMin) / w))
    const np = Math.max(1, Math.ceil((pMax - pMin) / w))
    const occ = new Int32Array(na * np)
    const pSum = new Float64Array(na * np)
    // occupancy of every inside cell — the corridor the EYE sees at each
    // latitude, including parts too thin for text
    const occAll = new Int32Array(na * np)
    for (const [a, p] of projAll) {
      const ai = Math.max(0, Math.min(na - 1, Math.floor((a - aMin) / w)))
      const pi = Math.max(0, Math.min(np - 1, Math.floor((p - pMin) / w)))
      occAll[pi * na + ai]++
    }
    for (const k of cells) {
      const [x, y] = cellXY(k)
      const a = x * ux + y * uy
      const p = x * vxx + y * vyy
      const ai = Math.max(0, Math.min(na - 1, Math.floor((a - aMin) / w)))
      const pi = Math.max(0, Math.min(np - 1, Math.floor((p - pMin) / w)))
      occ[pi * na + ai]++
      pSum[pi * na + ai] += p
    }
    // center of the visual (inside-mask) corridor at row pi that contains
    // along-bin ai — margins are judged against THIS, not the thick run:
    // the thick run ends where text stops fitting, but the eye keeps seeing
    // region well past that (Sivas hugged its east border for this reason)
    const corridorMid = (pi: number, ai: number): number => {
      let lo = ai
      let hi = ai
      while (lo > 0 && occAll[pi * na + lo - 1]) lo--
      while (hi < na - 1 && occAll[pi * na + hi + 1]) hi++
      return aMin + (lo + hi + 1) * 0.5 * w
    }
    const cA = ctrA[0] * ux + ctrA[1] * uy
    const spines: Spine[] = []
    const build = (pi: number, bs: number, bl: number, start: number, wantBins: number): Spine => {
      // gentle local bow: mean offset within ±1 latitude bin of the chosen one
      const as: number[] = []
      const ps: number[] = []
      for (let ai = start; ai < start + wantBins; ai++) {
        let s = 0
        let c = 0
        for (let dp = -1; dp <= 1; dp++) {
          const qi = pi + dp
          if (qi < 0 || qi >= np) continue
          s += pSum[qi * na + ai]
          c += occ[qi * na + ai]
        }
        as.push(aMin + (ai + 0.5) * w)
        ps.push(c ? s / c : pMin + (pi + 0.5) * w)
      }
      // the bow may bend the middle but must never tilt the chord away from
      // the scanned direction — on short runs the per-bin means otherwise
      // rotate a 60° slice into near-vertical text. Remove the linear drift
      // so both endpoints sit at the same latitude.
      const n = ps.length - 1
      if (n > 0) {
        const drift = ps[n] - ps[0]
        for (let i = 0; i <= n; i++) ps[i] -= (i / n - 0.5) * drift
      }
      const P: Pt[] = as.map((a, i) => [a * ux + ps[i] * vxx, a * uy + ps[i] * vyy])
      const pts = smoothed(P, 6)
      return { pts, len: lengthOf(pts) }
    }
    for (let pi = 0; pi < np; pi++) {
      let runStart = 0
      let runLen = 0
      for (let ai = 0; ai <= na; ai++) {
        if (ai < na && occ[pi * na + ai]) {
          if (!runLen) runStart = ai
          runLen++
        } else {
          if (runLen && runLen * w >= minLen) {
            const wantBins = Math.min(runLen, Math.max(3, Math.ceil((minLen * 1.25) / w)))
            // the window's home is the MIDDLE of its corridor — a label reads
            // as aligned when the leftover run margins balance, not when it
            // hugs whichever end is nearer some global centroid (Sivas sat
            // hard against its eastern border with a plain to the west)
            const centered = runStart + Math.round((runLen - wantBins) / 2)
            let atAim = Math.round((cA - aMin) / w - wantBins / 2)
            atAim = Math.max(runStart, Math.min(runStart + runLen - wantBins, atAim))
            const visMidA = corridorMid(pi, runStart + (runLen >> 1))
            const push = (start: number) => {
              const sp = build(pi, runStart, runLen, start, wantBins)
              sp.alongOff = Math.abs(aMin + (start + wantBins / 2) * w - visMidA)
              spines.push(sp)
            }
            let atVis = Math.round((visMidA - aMin) / w - wantBins / 2)
            atVis = Math.max(runStart, Math.min(runStart + runLen - wantBins, atVis))
            const starts = new Set([centered, atAim, atVis])
            // slide the window to the run's ends too when there's real slack
            if (runLen - wantBins >= 3) {
              starts.add(runStart)
              starts.add(runStart + runLen - wantBins)
            }
            for (const st of starts) push(st)
          }
          runLen = 0
        }
      }
    }
    return spines
  }

  // unrestricted spine: farthest pair in the component via double BFS
  const freeSpine = (tc: { comp: Int32Array; id: number; seed: number }): Spine | null => {
    const bfs = (start: number) => {
      const dist = new Int32Array(W * H).fill(-1)
      const par = new Int32Array(W * H).fill(-1)
      const q = [start]
      dist[start] = 0
      let far = start
      for (let qi = 0; qi < q.length; qi++) {
        const k = q[qi]
        if (dist[k] > dist[far]) far = k
        const ci = k % W
        const cj = (k / W) | 0
        for (let dj = -1; dj <= 1; dj++)
          for (let di = -1; di <= 1; di++) {
            const ni = ci + di
            const nj = cj + dj
            if (ni < 0 || nj < 0 || ni >= W || nj >= H) continue
            const nk = nj * W + ni
            if (tc.comp[nk] === tc.id && dist[nk] < 0) {
              dist[nk] = dist[k] + 1
              par[nk] = k
              q.push(nk)
            }
          }
      }
      return { far, par }
    }
    const end1 = bfs(tc.seed).far
    const r = bfs(end1)
    const cells: number[] = []
    for (let k = r.far; k >= 0; k = r.par[k]) cells.push(k)
    if (cells.length < 3) return null
    const pts = smoothed(cells.map(cellXY), 8)
    return { pts, len: lengthOf(pts) }
  }

  // a candidate fits a size when the text's own window (centered on the
  // line) is long enough AND thick enough at every point along it
  const fits = (spine: Spine, s: number): boolean => {
    const tl = textLen(s)
    if (tl > spine.len * 0.96) return false
    const lo = (spine.len - tl) / 2
    const hi = (spine.len + tl) / 2
    let cum = 0
    for (let i = 0; i < spine.pts.length; i++) {
      if (i > 0) cum += Math.hypot(spine.pts[i][0] - spine.pts[i - 1][0], spine.pts[i][1] - spine.pts[i - 1][1])
      if (cum < lo || cum > hi) continue
      if (clearAt(spine.pts[i]) < PARAMS.thick * s) return false
    }
    return true
  }

  // top-down size ladder, scored: every candidate at every size gets
  //   score = size × angle penalty × centering penalty
  // so a slightly smaller line through the center beats a big one hugging an
  // edge, a flat line beats a tilted one of similar size, and a steeper angle
  // still wins when it genuinely buys legibility (its band fits bigger text)
  // steeper directions are scanned too — a diagonal region (Elazığ, Kütahya)
  // often fits far bigger text along its own axis. Rather than penalizing tilt
  // per se, each size's candidates are judged against the region's own grain:
  // the principal axis of the thick component, blended toward horizontal for
  // round shapes (a blob like Sivas wants flat text; a slanted strip wants
  // text that runs with it).
  const DIRS = [0, -10, 10, -15, 15, -20, 20, -25, 25, -30, 30, -40, 40, -50, 50, -60, 60]
  // centering is judged where the eye judges it: the distance between the
  // text's optical middle (baseline mid lifted back up by cap height + bow)
  // and the shape's visual centroid, in BOTH axes, relative to region size —
  // a slightly smaller label that truly sits on the region's center beats a
  // bigger one crammed into an off-center band
  const R = (Math.sqrt(count) * step) / PARAMS.rDiv
  // centering error of a placement: across the reading direction it is the
  // optical middle's distance from the aim point; along it, the imbalance of
  // the window inside its own corridor. Judging the along-axis against the
  // global centroid instead pins labels to whichever end of their corridor
  // is nearer the centroid, leaving lopsided margins.
  const opticalDist = (spine: Spine, s: number, theta: number, aim: Pt) => {
    const mid = spine.pts[Math.floor(spine.pts.length / 2)]
    const drop = baseDrop(s)
    const ox = mid[0] + Math.sin(theta) * drop
    const oy = mid[1] - Math.cos(theta) * drop
    const cross = Math.abs((ox - aim[0]) * -Math.sin(theta) + (oy - aim[1]) * Math.cos(theta))
    return Math.hypot(cross, spine.alongOff ?? 0)
  }
  const scoreOf = (s: number, deg: number, dist: number, target: number, roomy = 1) =>
    s *
    (1 - Math.abs(deg - target) / PARAMS.angDiv) *
    (1 - Math.abs(deg) * PARAMS.flatBias) *
    (1 - PARAMS.centerW * Math.min(1, dist / R) ** PARAMS.centerExp) *
    (1 - PARAMS.comfortW * (1 - roomy))
  // how roomy the placement is: 1 when the line's middle has generous
  // clearance, shrinking toward 0 as it sits in a pinched neck of the shape
  const roominess = (spine: Spine, s: number) =>
    Math.min(1, clearAt(spine.pts[Math.floor(spine.pts.length / 2)]) / (0.8 * s))
  interface Candidate {
    size: number
    pts: Pt[]
    score: number
  }
  let pick: Candidate | null = null
  let bestSize = 0
  const upper = Math.min(MAX_SIZE, Math.hypot(bx2 - bx1, by2 - by1) / nameEm)
  for (let s = Math.min(MAX_SIZE, upper); s >= MIN_ARC_SIZE; s *= 0.93) {
    // even a perfectly centered flat line can't beat the current pick once
    // sizes drop below its score — stop scanning
    if (pick && s <= pick.score) break
    const tc = thickComp(s)
    if (!tc) continue
    // center on the mass of where the label can actually live at this size:
    // when a region's only roomy part is off to one side (Antalya's west),
    // the label follows the room instead of clinging to the raw centroid
    let tx = 0
    let ty = 0
    for (const k of tc.cells) {
      const [x, y] = cellXY(k)
      tx += x
      ty += y
    }
    const tCtr: Pt = [tx / tc.cells.length, ty / tc.cells.length]
    const grain = Math.max(0, Math.min(1, (elongShape - PARAMS.grainKnee) / 0.45)) * PARAMS.grainMul
    let target = Math.max(-65, Math.min(65, phiShape)) * Math.min(1, grain)
    // corridor-ness of the fittable room: a strip whose width is small next
    // to its skeleton length is a corridor, and text in a corridor should
    // run WITH it. Shape-level PCA cannot tell — a bent strip (Kütahya's S,
    // Samsun's coastal arc) averages out to "round" — so this is measured on
    // the thick component's free spine, and corridors take their target
    // angle from the spine's chord instead of the principal axis.
    const fs = freeSpine(tc)
    let corrW = 0
    let dbgFs = 0
    let dbgMc = 0
    if (fs) {
      let maxClear = 0
      for (const k of tc.cells) if (clear[k] > maxClear) maxClear = clear[k]
      dbgFs = fs.len
      dbgMc = maxClear * step
      const corridor = Math.max(0, Math.min(1, 1 - (2 * maxClear * step) / Math.max(1e-6, fs.len)))
      corrW = Math.max(0, Math.min(1, (corridor - PARAMS.corrKnee) / 0.3))
    }
    if (fs && corrW > 0) {
      let fdx = fs.pts[fs.pts.length - 1][0] - fs.pts[0][0]
      let fdy = fs.pts[fs.pts.length - 1][1] - fs.pts[0][1]
      if (fdx < 0) {
        fdx = -fdx
        fdy = -fdy
      }
      const chord = Math.max(-65, Math.min(65, (Math.atan2(fdy, Math.max(1e-6, fdx)) * 180) / Math.PI))
      target = target * (1 - corrW) + chord * corrW
    }
    // when the room that can hold text at this size is only a sliver of the
    // region (Antalya: a fat bulge on a long thin coast), center within the
    // room — the label cannot visually span the whole shape anyway. As the
    // room grows to cover the region, the aim eases back to the shape center.
    const cov = Math.min(1, (tc.cells.length / count) * PARAMS.aimK)
    const aim: Pt = [tCtr[0] * (1 - cov) + sCtr[0] * cov, tCtr[1] * (1 - cov) + sCtr[1] * cov]
    const dbg: any[] | null =
      typeof localStorage !== 'undefined' && localStorage.getItem('labelDebug') === name
        ? ((globalThis as any).__labelCand ??= [])
        : null
    if (dbg)
      dbg.push({
        s: Math.round(s * 10) / 10,
        cells: tc.cells.length,
        phi: Math.round(phiShape),
        elong: Math.round(elongShape * 100) / 100,
        target: Math.round(target),
        corrW: Math.round(corrW * 100) / 100,
        fsLen: Math.round(dbgFs),
        mc: Math.round(dbgMc),
        sCtr: sCtr.map(Math.round),
        R: Math.round(R),
      })
    for (const deg of DIRS) {
      const rad = (deg * Math.PI) / 180
      for (const spine of sliceSpines(tc.cells, rad, textLen(s) * 1.04, s, sCtr)) {
        const fit = fits(spine, s)
        if (dbg)
          dbg.push({
            s: Math.round(s * 10) / 10,
            deg,
            fit,
            len: Math.round(spine.len),
            mid: spine.pts[Math.floor(spine.pts.length / 2)].map(Math.round),
          })
        if (!fit) continue
        const score = scoreOf(s, deg, opticalDist(spine, s, rad, aim), target, roominess(spine, s))
        bestSize = Math.max(bestSize, s)
        if (!pick || score > pick.score) pick = { size: s, pts: spine.pts, score }
      }
    }
    // the unrestricted spine is a last resort for snaking shapes: it must
    // rank below the steepest scanned direction, and a chord steeper than
    // ~50° is rejected outright — names should never read near-vertically
    // (straight steep runs are already covered by the ±60° scan above)
    if (fs && fits(fs, s)) {
      const [fx, fy] = fs.pts[0]
      const [gx, gy] = fs.pts[fs.pts.length - 1]
      if (Math.abs(gy - fy) > Math.abs(gx - fx) * Math.tan((50 * Math.PI) / 180)) continue
      const score =
        s *
        0.5 *
        (1 -
          PARAMS.centerW * Math.min(1, opticalDist(fs, s, Math.atan2(gy - fy, gx - fx), aim) / R) ** PARAMS.centerExp)
      bestSize = Math.max(bestSize, s)
      if (!pick || score > pick.score) pick = { size: s, pts: fs.pts, score }
    }
  }
  if (!pick || pick.size < MIN_ARC_SIZE) return { kind: 'plain', size: Math.max(7.5, Math.min(9, bestSize + 2)) }

  let spine = pick.pts
  const size = pick.size

  // orient so the text reads naturally: never advancing leftward (which
  // would set the glyphs near upside-down), top-down only if truly vertical
  const dx = spine[spine.length - 1][0] - spine[0][0]
  const dy = spine[spine.length - 1][1] - spine[0][1]
  if (Math.abs(dx) < 1e-6 ? dy < 0 : dx < 0) spine = [...spine].reverse()

  // quadratic through the spine's endpoints and its arc-length midpoint
  const A = spine[0]
  const B = spine[spine.length - 1]
  let total = 0
  const cum = [0]
  for (let i = 1; i < spine.length; i++) {
    total += Math.hypot(spine[i][0] - spine[i - 1][0], spine[i][1] - spine[i - 1][1])
    cum.push(total)
  }
  let M: Pt = spine[Math.floor(spine.length / 2)]
  for (let i = 1; i < spine.length; i++)
    if (cum[i] >= total / 2) {
      const t = (total / 2 - cum[i - 1]) / Math.max(1e-6, cum[i] - cum[i - 1])
      M = [spine[i - 1][0] + (spine[i][0] - spine[i - 1][0]) * t, spine[i - 1][1] + (spine[i][1] - spine[i - 1][1]) * t]
      break
    }

  // every label gets a gentle arc: cap excessive bow, give dead-straight lines
  // a slight one, and prefer arching OUT (crown, ∩) over sagging in (∪) for
  // horizontal text — unless the crowned midpoint would leave the thick area
  const chordMid: Pt = [(A[0] + B[0]) / 2, (A[1] + B[1]) / 2]
  const chordLen = Math.hypot(B[0] - A[0], B[1] - A[1])
  const nx = -(B[1] - A[1]) / Math.max(1e-6, chordLen)
  const ny = (B[0] - A[0]) / Math.max(1e-6, chordLen)
  const maxSag = Math.min(size * 0.55, chordLen * 0.12)
  const minSag = Math.min(maxSag, Math.max(2, chordLen * 0.05))
  let sag = (M[0] - chordMid[0]) * nx + (M[1] - chordMid[1]) * ny
  const mag = Math.max(minSag, Math.min(Math.abs(sag), maxSag))
  const horizontalish = Math.abs(B[0] - A[0]) >= Math.abs(B[1] - A[1])
  // for a left-to-right chord the normal points down, so negative sag = crown
  const crown = horizontalish ? -1 : Math.sign(sag) || 1
  const crowned: Pt = [chordMid[0] + nx * crown * mag, chordMid[1] + ny * crown * mag]
  if (Math.sign(sag) === crown || clearAt(crowned) >= 0.55 * size) sag = crown * mag
  else sag = (Math.sign(sag) || 1) * mag
  M = [chordMid[0] + nx * sag, chordMid[1] + ny * sag]
  const CX = 2 * M[0] - (A[0] + B[0]) / 2
  const CY = 2 * M[1] - (A[1] + B[1]) / 2

  const fmt = (n: number) => Math.round(n * 10) / 10
  return {
    kind: 'arc',
    d: `M ${fmt(A[0])},${fmt(A[1])} Q ${fmt(CX)},${fmt(CY)} ${fmt(B[0])},${fmt(B[1])}`,
    size: Math.round(size * 10) / 10,
  }
}
