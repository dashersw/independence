// Generates src/game/map-data.json from src/assets/map-whiteborder.svg.
//
// The SVG has 91 anonymous <path> elements. Their document order was identified
// once by rendering the sibling map-colorful.svg (faction-colored reference) in
// a browser, overlaying path indices, and reading each region off zoomed
// screenshots. Both files contain the same 91 shapes (identical bbox centroids),
// so the index table below is keyed by map-whiteborder.svg document order.
import { readFileSync, writeFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const svg = readFileSync(join(root, 'src/assets/map-whiteborder.svg'), 'utf8')

const viewBox = svg.match(/viewBox="([^"]+)"/)[1]
const ds = []
const re = /<path[^>]*d="([^"]+)"[^>]*\/?>/g
let m
while ((m = re.exec(svg))) ds.push(m[1])
if (ds.length !== 91) throw new Error(`expected 91 paths, got ${ds.length}`)

// whiteborder path index -> territory slug (null = non-playable background land)
const slugByIndex = {
  0: 'sivas', // Sivas-Kayseri
  // 1 georgia, 2 iran — neighbors
  3: 'baghdad',
  4: 'mosul',
  5: 'aleppo',
  // 6..25 mainland Greece + Cyclades/Sporades/Crete, 26 cyprus
  27: 'western-thrace',
  28: 'salonica',
  29: 'kozani',
  30: 'sofia',
  31: 'varna',
  32: 'plovdiv',
  33: 'burgas',
  34: 'gyumri',
  35: 'vanadzor',
  36: 'yerevan',
  37: 'sevan',
  38: 'edirne',
  39: 'rhodes', // Samos
  40: 'rhodes', // Ikaria
  41: 'rhodes', // Kos
  42: 'rhodes', // Rhodes
  43: 'izmit', // eastern Asian-side chunk — İstanbul keeps only the strait edges
  44: 'istanbul',
  45: 'istanbul',
  46: 'izmit',
  47: 'sakarya',
  48: 'balikesir',
  49: 'izmir',
  50: 'aydin',
  51: 'antalya',
  52: 'samsun',
  53: 'van',
  54: 'erzurum',
  55: 'kastamonu',
  56: 'adana',
  57: 'isparta',
  58: 'usak',
  59: 'kutahya',
  60: 'eskisehir',
  61: 'trabzon',
  62: 'diyarbakir',
  63: 'hatay',
  64: 'maras',
  65: 'lesbos', // Lesbos
  66: 'lesbos', // Chios
  67: 'lesbos', // Limnos
  // 68, 69 are degenerate zero-size gradient dots — dropped
  70: 'konya',
  71: 'ankara',
  72: 'elazig',
  73: 'gelibolu', // Gallipoli tip
  74: 'gelibolu',
  75: 'canakkale',
  // 76..90 Balkans, Caucasus, Levant, Egypt — background
}

const DROP = new Set([68, 69])

// Geometric adjacency between territory shapes (contact within ~3 units),
// measured once in a browser by sampling the rendered paths with
// isPointInPath/isPointInStroke. Game adjacency is not a substitute: it links
// territories across water (Istanbul ↔ the strait zones) that must not merge
// for flag placement.
const GEO_ADJACENT = [
  ['sivas', 'samsun'],
  ['sivas', 'erzurum'],
  ['sivas', 'kastamonu'],
  ['sivas', 'adana'],
  ['sivas', 'trabzon'],
  ['sivas', 'maras'],
  ['sivas', 'konya'],
  ['sivas', 'ankara'],
  ['sivas', 'elazig'],
  ['baghdad', 'mosul'],
  ['baghdad', 'aleppo'],
  ['mosul', 'aleppo'],
  ['mosul', 'van'],
  ['aleppo', 'van'],
  ['aleppo', 'diyarbakir'],
  ['aleppo', 'hatay'],
  ['aleppo', 'maras'],
  ['western-thrace', 'salonica'],
  ['western-thrace', 'plovdiv'],
  ['western-thrace', 'burgas'],
  ['western-thrace', 'edirne'],
  ['salonica', 'kozani'],
  ['salonica', 'plovdiv'],
  ['sofia', 'varna'],
  ['sofia', 'plovdiv'],
  ['sofia', 'burgas'],
  ['varna', 'plovdiv'],
  ['varna', 'burgas'],
  ['plovdiv', 'burgas'],
  ['burgas', 'edirne'],
  ['gyumri', 'vanadzor'],
  ['gyumri', 'yerevan'],
  ['gyumri', 'trabzon'],
  ['vanadzor', 'yerevan'],
  ['vanadzor', 'sevan'],
  ['yerevan', 'sevan'],
  ['edirne', 'istanbul'],
  ['edirne', 'gelibolu'],
  ['rhodes', 'aydin'],
  ['istanbul', 'izmit'],
  ['izmit', 'sakarya'],
  ['izmit', 'eskisehir'],
  ['sakarya', 'kastamonu'],
  ['sakarya', 'eskisehir'],
  ['balikesir', 'izmir'],
  ['balikesir', 'usak'],
  ['balikesir', 'eskisehir'],
  ['balikesir', 'lesbos'],
  ['balikesir', 'canakkale'],
  ['izmir', 'aydin'],
  ['izmir', 'usak'],
  ['aydin', 'antalya'],
  ['aydin', 'isparta'],
  ['aydin', 'usak'],
  ['antalya', 'adana'],
  ['antalya', 'isparta'],
  ['antalya', 'konya'],
  ['samsun', 'kastamonu'],
  ['samsun', 'trabzon'],
  ['van', 'erzurum'],
  ['van', 'diyarbakir'],
  ['erzurum', 'trabzon'],
  ['erzurum', 'diyarbakir'],
  ['erzurum', 'elazig'],
  ['kastamonu', 'eskisehir'],
  ['kastamonu', 'ankara'],
  ['adana', 'maras'],
  ['adana', 'konya'],
  ['isparta', 'usak'],
  ['isparta', 'kutahya'],
  ['isparta', 'konya'],
  ['usak', 'kutahya'],
  ['usak', 'eskisehir'],
  ['kutahya', 'eskisehir'],
  ['kutahya', 'konya'],
  ['eskisehir', 'konya'],
  ['eskisehir', 'ankara'],
  ['diyarbakir', 'maras'],
  ['diyarbakir', 'elazig'],
  ['hatay', 'maras'],
  ['maras', 'elazig'],
  ['konya', 'ankara'],
  ['gelibolu', 'canakkale'],
  // carved out of Erzurum (see carve.json below)
  ['kars', 'erzurum'],
  ['kars', 'trabzon'],
  ['kars', 'gyumri'],
  ['kars', 'yerevan'],
  ['kars', 'igdir'],
  ['igdir', 'erzurum'],
  ['igdir', 'yerevan'],
]

// Label anchor per territory, in SVG viewBox coordinates.
const labels = {
  'edirne': [425, 212],
  'istanbul': [504, 220],
  'izmit': [549, 265],
  'sakarya': [608, 258],
  'gelibolu': [372, 281],
  'canakkale': [394, 309],
  'balikesir': [429, 322],
  'eskisehir': [565, 330],
  'usak': [523, 429],
  'kutahya': [598, 430],
  'ankara': [704, 330],
  konya: [713, 455],
  'sivas': [886, 350],
  aleppo: [1034, 660],
  'mosul': [1256, 570],
  'baghdad': [1275, 770],
  'kastamonu': [688, 234],
  'samsun': [846, 220],
  'trabzon': [1122, 253],
  'erzurum': [1161, 322],
  'van': [1245, 429],
  'elazig': [1020, 405],
  'diyarbakir': [1090, 480],
  'izmir': [396, 396],
  'aydin': [474, 480],
  'lesbos': [356, 360],
  'rhodes': [416, 516],
  'antalya': [614, 542],
  'isparta': [600, 487],
  'adana': [764, 532],
  'maras': [895, 469],
  'hatay': [884, 550],
  'salonica': [195, 262],
  'kozani': [112, 282],
  'western-thrace': [298, 224],
  'sofia': [235, 92],
  'varna': [388, 70],
  'plovdiv': [270, 166],
  'burgas': [377, 149],
  'gyumri': [1301, 249],
  'vanadzor': [1363, 267],
  'yerevan': [1316, 282],
  'sevan': [1386, 347],
}

// Measured [cx, cy, w, h] of every path, from rendering the SVG in a browser
// (getBBox). Baked in so flag placement needs no runtime measurement.
const PATH_BOUNDS = {
  0: [886, 353, 236, 267], 3: [1275, 789, 511, 428], 4: [1256, 567, 221, 163], 5: [1034, 649, 349, 317],
  27: [305, 223, 156, 71], 28: [195, 262, 138, 104], 29: [112, 282, 73, 76], 30: [235, 89, 151, 158],
  31: [388, 67, 194, 102], 32: [270, 166, 178, 102], 33: [377, 149, 160, 100], 34: [1301, 249, 76, 58],
  35: [1363, 267, 63, 96], 36: [1319, 314, 97, 111], 37: [1386, 347, 77, 79], 38: [425, 215, 147, 106],
  39: [392, 461, 25, 12], 40: [359, 468, 18, 11], 41: [409, 521, 21, 14], 42: [453, 563, 25, 33],
  43: [535, 239, 36, 30], 44: [501, 229, 18, 22], 45: [517, 234, 18, 24], 46: [539, 252, 83, 53],
  47: [606, 256, 96, 58], 48: [429, 322, 150, 100], 49: [398, 399, 68, 105], 50: [474, 480, 142, 152],
  51: [612, 535, 175, 65], 52: [846, 223, 278, 123], 53: [1245, 429, 177, 161], 54: [1161, 322, 328, 177],
  55: [685, 238, 184, 120], 56: [761, 527, 130, 87], 57: [600, 485, 142, 63], 58: [493, 429, 136, 164],
  59: [598, 428, 102, 111], 60: [565, 330, 203, 127], 61: [1122, 256, 283, 118], 62: [1074, 461, 208, 134],
  63: [886, 544, 46, 78], 64: [895, 469, 167, 136], 65: [362, 363, 39, 26], 66: [350, 416, 16, 28],
  67: [311, 314, 21, 17], 70: [713, 453, 162, 185], 71: [704, 330, 197, 132], 72: [1020, 420, 164, 119],
  73: [341, 296, 16, 9], 74: [383, 284, 46, 39], 75: [388, 297, 61, 43]
}

const territories = {}
const background = []
ds.forEach((d, i) => {
  if (DROP.has(i)) return
  const slug = slugByIndex[i]
  if (!slug) {
    background.push(d)
    return
  }
  if (!territories[slug]) territories[slug] = { paths: [], label: labels[slug], bbox: null }
  territories[slug].paths.push(d)
  const bounds = PATH_BOUNDS[i]
  if (bounds) {
    const [cx, cy, w, h] = bounds
    const box = [cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2]
    const prev = territories[slug].bbox
    territories[slug].bbox = prev
      ? [Math.min(prev[0], box[0]), Math.min(prev[1], box[1]), Math.max(prev[2], box[2]), Math.max(prev[3], box[3])]
      : box
  }
})
Object.entries(territories).forEach(([slug, t]) => {
  if (!t.bbox) throw new Error(`no bbox for ${slug}`)
})

// Baked geometry overrides (carve.json), all constructed in a browser from
// exact boundary samples of the rendered shapes:
// - kars & igdir: carved out of Erzurum (Armenian-administered in 1919) using
//   real province outlines for the new interior borders; both are punched out
//   of Erzurum's path as reversed (hole) subpaths under the nonzero fill rule.
// - izmit: its two source paths merged into one polygon so no border
//   is drawn through the middle of the territory.
const carve = JSON.parse(readFileSync(join(root, 'scripts/carve.json'), 'utf8'))
Object.entries(carve).forEach(([slug, t]) => {
  territories[slug] = { paths: [t.path], label: t.label, bbox: t.bbox }
})
// ---- kars & igdir: a true reshape, not a stamp ----
// The carve polygons' eastern edges were SAMPLED off erzurum's old (curved)
// boundary; keeping erzurum intact and punching holes left (a) slivers of
// erzurum between the samples and the true curve — phantom red ribbons and
// doubled ink lines along the kars–gyumri / igdir–yerevan borders — and (b)
// jagged sampled polylines for the new interior borders. Instead: erzurum's
// outer ring is flattened and RESHAPED so its eastern boundary IS the (now
// smoothed) kars/igdir western border, point-for-point. No holes remain.
const toXY = p => p.split(',').map(Number)
const fmt = ([x, y]) => `${Math.round(x * 10) / 10},${Math.round(y * 10) / 10}`
const ringOf = d => {
  const pts = d.trim().replace(/^M/, '').replace(/ Z$/, '').split(' L')
  // drop consecutive duplicates so run bookkeeping stays exact
  return pts.filter((p, i) => p !== pts[i - 1])
}

// flatten erzurum's outer curved subpath (relative m/c/s commands) into a
// fine polyline that is visually identical to the curve
const flattenPath = (dStr, tol = 0.15) => {
  const toks = dStr.match(/[a-zA-Z]|-?(?:\d*\.\d+|\d+)(?:e[-+]?\d+)?/g)
  const pts = []
  let i = 0
  let cx = 0
  let cy = 0
  let prev = null
  let cmd = null
  const cubic = (p0, p1, p2, p3) => {
    const out = []
    const rec = (a, b, c2, e, depth) => {
      const mx = (a[0] + 3 * b[0] + 3 * c2[0] + e[0]) / 8
      const my = (a[1] + 3 * b[1] + 3 * c2[1] + e[1]) / 8
      const lx = (a[0] + e[0]) / 2
      const ly = (a[1] + e[1]) / 2
      if (depth > 10 || (mx - lx) ** 2 + (my - ly) ** 2 < tol * tol) {
        out.push(e)
        return
      }
      const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2]
      const ab = mid(a, b)
      const bc = mid(b, c2)
      const ce = mid(c2, e)
      const abc = mid(ab, bc)
      const bce = mid(bc, ce)
      const m = mid(abc, bce)
      rec(a, ab, abc, m, depth + 1)
      rec(m, bce, ce, e, depth + 1)
    }
    rec(p0, p1, p2, p3, 0)
    return out
  }
  while (i < toks.length) {
    const t = toks[i]
    if (/[a-zA-Z]/.test(t)) {
      cmd = t
      i++
      if (t === 'z' || t === 'Z') break
      continue
    }
    if (cmd === 'm' || cmd === 'M') {
      cx = (cmd === 'm' ? cx : 0) + Number(t)
      cy = (cmd === 'm' ? cy : 0) + Number(toks[i + 1])
      i += 2
      pts.push([cx, cy])
      cmd = cmd === 'm' ? 'l' : 'L'
    } else if (cmd === 'l' || cmd === 'L') {
      cx = (cmd === 'l' ? cx : 0) + Number(t)
      cy = (cmd === 'l' ? cy : 0) + Number(toks[i + 1])
      i += 2
      pts.push([cx, cy])
    } else if (cmd === 'h' || cmd === 'H') {
      cx = (cmd === 'h' ? cx : 0) + Number(t)
      i += 1
      pts.push([cx, cy])
    } else if (cmd === 'v' || cmd === 'V') {
      cy = (cmd === 'v' ? cy : 0) + Number(t)
      i += 1
      pts.push([cx, cy])
    } else if (cmd === 'c' || cmd === 's') {
      let x1
      let y1
      if (cmd === 's') {
        x1 = prev ? 2 * cx - prev[0] : cx
        y1 = prev ? 2 * cy - prev[1] : cy
      } else {
        x1 = cx + Number(toks[i])
        y1 = cy + Number(toks[i + 1])
        i += 2
      }
      const x2 = cx + Number(toks[i])
      const y2 = cy + Number(toks[i + 1])
      const x = cx + Number(toks[i + 2])
      const y = cy + Number(toks[i + 3])
      i += 4
      pts.push(...cubic([cx, cy], [x1, y1], [x2, y2], [x, y]))
      prev = [x2, y2]
      cx = x
      cy = y
    } else {
      throw new Error(`flattenPath: unhandled command ${cmd}`)
    }
  }
  return pts
}

const segDist = (p, a, b) => {
  const dx = b[0] - a[0]
  const dy = b[1] - a[1]
  const L2 = dx * dx + dy * dy
  const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L2))
  return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
}
const distToRing = (p, ring) => {
  let best = Infinity
  for (let j = 0; j < ring.length; j++) {
    const d = segDist(p, ring[j], ring[(j + 1) % ring.length])
    if (d < best) best = d
  }
  return best
}

// Douglas–Peucker + Chaikin: kill sampling zigzag, then round the corners —
// the carved interior borders end up as flowing curves like the hand-drawn
// map. Endpoints are pinned so rings stay watertight at the junctions.
const simplify = (pts, tol) => {
  if (pts.length < 3) return pts
  const keep = new Array(pts.length).fill(false)
  keep[0] = keep[pts.length - 1] = true
  const rec = (a, b) => {
    let worst = 0
    let wi = -1
    for (let j = a + 1; j < b; j++) {
      const d = segDist(pts[j], pts[a], pts[b])
      if (d > worst) {
        worst = d
        wi = j
      }
    }
    if (worst > tol) {
      keep[wi] = true
      rec(a, wi)
      rec(wi, b)
    }
  }
  rec(0, pts.length - 1)
  return pts.filter((_, j) => keep[j])
}
const chaikin = (pts, iters) => {
  let P = pts
  for (let it = 0; it < iters; it++) {
    const out = [P[0]]
    for (let j = 0; j < P.length - 1; j++) {
      const a = P[j]
      const b = P[j + 1]
      out.push([0.75 * a[0] + 0.25 * b[0], 0.75 * a[1] + 0.25 * b[1]])
      out.push([0.25 * a[0] + 0.75 * b[0], 0.25 * a[1] + 0.75 * b[1]])
    }
    out.push(P[P.length - 1])
    P = out
  }
  return P
}
const smoothArc = arc =>
  chaikin(
    simplify(
      arc.map(p => toXY(p)),
      1.2
    ),
    3
  ).map(fmt)

const E = flattenPath(territories['erzurum'].paths[0].split(' M')[0])
const karsRing = ringOf(carve.kars.path)
const igdirRing = ringOf(carve.igdir.path)
const sharedSet = new Set(karsRing.filter(p => new Set(igdirRing).has(p)))
const ON_TOL = 3 // sampled points sit on the old boundary within ~2.2 units
const labelOf = p => (sharedSet.has(p) ? 'S' : distToRing(toXY(p), E) < ON_TOL ? 'B' : 'I')

// split a ring into its maximal runs of same-labeled points, cyclically
const runsOf = ring => {
  const labs = ring.map(labelOf)
  let start = 0
  while (start < ring.length && labs[start] === labs[(start - 1 + ring.length) % ring.length]) start++
  const rot = [...ring.slice(start), ...ring.slice(0, start)]
  const rlabs = [...labs.slice(start), ...labs.slice(0, start)]
  const runs = []
  for (let j = 0; j < rot.length; j++) {
    if (!runs.length || runs[runs.length - 1].label !== rlabs[j]) runs.push({ label: rlabs[j], pts: [] })
    runs[runs.length - 1].pts.push(rot[j])
  }
  return runs
}

const normRuns = (ring, name) => {
  let runs = runsOf(ring)
  const bi = runs.findIndex(r => r.label === 'B')
  runs = [...runs.slice(bi), ...runs.slice(0, bi)]
  if (runs.length !== 3 || runs.filter(r => r.label === 'B').length !== 1)
    throw new Error(`carve ring structure changed: ${name}=${runs.map(r => r.label).join('')}`)
  return runs
}
const karsRuns = normRuns(karsRing, 'kars')
const igdirRuns = normRuns(igdirRing, 'igdir')
if (karsRuns.map(r => r.label).join('') !== 'BSI' || igdirRuns.map(r => r.label).join('') !== 'BIS')
  throw new Error('carve ring orientation changed; the union construction below assumes kars=BSI igdir=BIS')

// The whiteborder source draws every territory inset from the border
// centerline, so erzurum's edge and its Armenian neighbors' edges are two
// different lines a few units apart. Kars/igdir's boundary runs were
// sampled off ERZURUM's side — snap them onto the Armenian neighbors' own
// outlines so those borders become one coincident line instead of a double
// line with a gap strip between.
const SNAP_TOL = 7
const snapTargets = ['gyumri', 'yerevan', 'vanadzor', 'sevan'].map(s => flattenPath(territories[s].paths[0]))
const snapPt = p => {
  const q = toXY(p)
  let best = null
  let bd = SNAP_TOL
  for (const ring of snapTargets)
    for (let j = 0; j < ring.length; j++) {
      const a = ring[j]
      const b = ring[(j + 1) % ring.length]
      const dx = b[0] - a[0]
      const dy = b[1] - a[1]
      const L2 = dx * dx + dy * dy
      const t = L2 === 0 ? 0 : Math.max(0, Math.min(1, ((q[0] - a[0]) * dx + (q[1] - a[1]) * dy) / L2))
      const proj = [a[0] + t * dx, a[1] + t * dy]
      const d = Math.hypot(q[0] - proj[0], q[1] - proj[1])
      if (d < bd) {
        bd = d
        best = proj
      }
    }
  return best ? fmt(best) : p
}
const karsB = karsRuns[0].pts.map(snapPt)
const igdirB = igdirRuns[0].pts.map(snapPt)

// shared arc (kars flow: JE -> JW, i.e. from the on-boundary junction to
// the interior triple point); its JE endpoint snaps with the boundary runs
const sharedRaw = [...karsRuns[1].pts]
sharedRaw[0] = snapPt(sharedRaw[0])
const sharedSm = smoothArc(sharedRaw)
const karsIntSm = smoothArc(karsRuns[2].pts)
const igdirIntSm = smoothArc(igdirRuns[1].pts)
const JE = sharedSm[0]
const JW = sharedSm[sharedSm.length - 1]
if (igdirRuns[2].pts[0] !== karsRuns[1].pts[karsRuns[1].pts.length - 1])
  throw new Error('igdir shared arc does not run JW->JE; orientation assumption broken')

const karsNew = [...karsB, ...sharedSm, ...karsIntSm]
const igdirNew = [...igdirB, ...igdirIntSm, ...[...sharedSm].reverse()]

// union of the two rings, built constructively from the arcs: walk kars's
// boundary run, cross the JE triple point into igdir's boundary run, come
// back through igdir's then kars's interior arcs via the JW triple point
const union = [...karsB, JE, ...igdirB, ...igdirIntSm, JW, ...karsIntSm]

// splice: replace the span of erzurum's ring that the union covers with the
// union's interior (kars/igdir-facing) arc — verbatim the same smoothed
// points as in the kars/igdir rings, so the borders stay point-identical
const interior = [...igdirIntSm, JW, ...karsIntSm]
const bArc = [...karsB, JE, ...igdirB].map(toXY)

const J1 = toXY(interior[0])
const J2 = toXY(interior[interior.length - 1])
const nearest = p => {
  let bi = 0
  let bd = Infinity
  E.forEach((q, j) => {
    const d = Math.hypot(p[0] - q[0], p[1] - q[1])
    if (d < bd) {
      bd = d
      bi = j
    }
  })
  return bi
}
const e1 = nearest(J1)
const e2 = nearest(J2)
const spanFwd = []
for (let j = e2; j !== e1; j = (j + 1) % E.length) spanFwd.push(E[j])
const spanBwd = []
for (let j = e2; j !== e1; j = (j - 1 + E.length) % E.length) spanBwd.push(E[j])
// keep the span that does NOT follow the union's boundary arc — that arc is
// the part being replaced
const meanDist = span => {
  const step = Math.max(1, Math.floor(span.length / 24))
  let s = 0
  let n = 0
  for (let j = 0; j < span.length; j += step) {
    s += distToRing(span[j], bArc)
    n++
  }
  return s / n
}
const keepSpan = meanDist(spanFwd) > meanDist(spanBwd) ? spanFwd : spanBwd
const erzNew = [...interior, ...keepSpan.map(fmt)].filter((p, i, arr) => p !== arr[i - 1])

// sanity: reshaped erzurum + the union must add back up to the old shape
const areaOf = ring => {
  const P = ring.map(p => (typeof p === 'string' ? toXY(p) : p))
  let s = 0
  for (let j = 0; j < P.length; j++) {
    const [x1, y1] = P[j]
    const [x2, y2] = P[(j + 1) % P.length]
    s += x1 * y2 - x2 * y1
  }
  return Math.abs(s / 2)
}
// 5%: snapping kars/igdir onto the Armenian outlines legitimately annexes
// the whiteborder gap strip, and smoothing trims corners slightly
const drift = Math.abs(areaOf(E) - (areaOf(erzNew) + areaOf(union))) / areaOf(E)
if (drift > 0.05) throw new Error(`erzurum reshape area drift ${(drift * 100).toFixed(1)}%`)

const asPath = ring => 'M' + ring.join(' L') + ' Z'
const bboxOf = ring => {
  const P = ring.map(toXY)
  return [
    Math.min(...P.map(p => p[0])),
    Math.min(...P.map(p => p[1])),
    Math.max(...P.map(p => p[0])),
    Math.max(...P.map(p => p[1]))
  ].map(v => Math.round(v * 10) / 10)
}
territories['kars'].paths = [asPath(karsNew)]
territories['kars'].bbox = bboxOf(karsNew)
territories['igdir'].paths = [asPath(igdirNew)]
territories['igdir'].bbox = bboxOf(igdirNew)
territories['erzurum'].paths = [asPath(erzNew)]
territories['erzurum'].bbox = bboxOf(erzNew)

const geo = {}
GEO_ADJACENT.forEach(([a, b]) => {
  ;(geo[a] ??= []).push(b)
  ;(geo[b] ??= []).push(a)
})
const badGeo = GEO_ADJACENT.flat().filter(s => !labels[s] && !carve[s])
if (badGeo.length) throw new Error(`geo adjacency with unknown slugs: ${badGeo}`)
Object.entries(territories).forEach(([slug, t]) => {
  t.geoNeighbors = (geo[slug] ?? []).sort()
})

const missing = Object.keys(labels).filter(s => !territories[s])
if (missing.length) throw new Error(`labels without paths: ${missing}`)
if (Object.keys(territories).length !== 45) throw new Error(`expected 45 territories, got ${Object.keys(territories).length}`)

// flattened polygon ring per path — the runtime unions these per faction blob
// (with a gap-bridging morphological closing) to draw each blob's true outer
// border as exact geometry
// Every ring must share one winding: Clipper treats reversed rings as HOLES,
// which silently punches territory-shaped holes into faction blobs (the source
// SVG draws some shapes clockwise, and carved shapes inherit the carve's
// direction). Normalize to positive signed area.
const shoelace = ring => ring.reduce((a, [x, y], i) => {
  const [nx, ny] = ring[(i + 1) % ring.length]
  return a + x * ny - nx * y
}, 0) / 2
Object.entries(territories).forEach(([slug, t]) => {
  t.poly = t.paths.map(p => {
    if ((p.match(/[mM]/g) || []).length > 1) throw new Error(`${slug}: multi-subpath path; poly emission expects one ring per path`)
    const flat = flattenPath(p)
    const ring = simplify(flat, 0.25).map(([x, y]) => [Math.round(x * 10) / 10, Math.round(y * 10) / 10])
    if (ring.length < 4) throw new Error(`${slug}: degenerate poly`)
    if (shoelace(ring) < 0) ring.reverse()
    return ring
  })
})

writeFileSync(
  join(root, 'src/game/map-data.json'),
  JSON.stringify({ viewBox, territories, background }, null, 1)
)
console.log(`ok: ${Object.keys(territories).length} territories, ${background.length} background paths`)
