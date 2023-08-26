import React from 'react'
import { LabelLayout, LabelParams, arcFromParams } from './labelLayout'

// Interactive label-placement editor, enabled with ?labelEdit=1. Every label
// becomes selectable and draggable, and the panel exposes its full arc
// parameterization — the hand-tuned result is exported as JSON so good
// placements can be pinned (labelOverrides.json) and mined for heuristics.

export type { LabelParams }
export { arcFromParams }

export const labelEditEnabled = () =>
  typeof location !== 'undefined' && new URLSearchParams(location.search).has('labelEdit')

const round1 = (n: number) => Math.round(n * 10) / 10

// Recover editable parameters from a computed layout (parsing the arc path the
// same way the dev sweep does); plain labels fall back to their anchor point.
export const paramsFromLayout = (layout: LabelLayout, name: string, anchor: [number, number]): LabelParams => {
  if (layout.kind === 'arc') {
    const m = layout.d.match(/M ([\d.-]+),([\d.-]+) Q ([\d.-]+),([\d.-]+) ([\d.-]+),([\d.-]+)/)
    if (m) {
      const [ax, ay, cx, cy, bx, by] = m.slice(1).map(Number)
      const x = (ax + bx) / 2
      const y = (ay + by) / 2
      const len = Math.hypot(bx - ax, by - ay)
      const ang = (Math.atan2(by - ay, bx - ax) * 180) / Math.PI
      // curve midpoint (t = 0.5) projected on the chord normal
      const mx = 0.25 * ax + 0.5 * cx + 0.25 * bx
      const my = 0.25 * ay + 0.5 * cy + 0.25 * by
      const nx = -(by - ay) / Math.max(1e-6, len)
      const ny = (bx - ax) / Math.max(1e-6, len)
      const bow = (mx - x) * nx + (my - y) * ny
      return { x: round1(x), y: round1(y), ang: round1(ang), len: round1(len), size: layout.size, bow: round1(bow) }
    }
  }
  return {
    x: anchor[0],
    y: anchor[1] - 15,
    ang: 0,
    len: round1(name.length * 0.85 * layout.size + 20),
    size: layout.size,
    bow: 0
  }
}

const FIELDS: { key: keyof LabelParams; label: string; min: number; max: number; step: number }[] = [
  { key: 'size', label: 'Size', min: 5, max: 40, step: 0.1 },
  { key: 'ang', label: 'Angle', min: -90, max: 90, step: 1 },
  { key: 'len', label: 'Length', min: 20, max: 500, step: 1 },
  { key: 'bow', label: 'Bow ∩−/∪+', min: -60, max: 60, step: 0.5 },
  { key: 'x', label: 'X', min: 30, max: 1530, step: 1 },
  { key: 'y', label: 'Y', min: 0, max: 820, step: 1 }
]

const S: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed',
    top: 12,
    right: 12,
    zIndex: 50,
    width: 272,
    background: 'rgba(28, 21, 12, 0.94)',
    color: '#f0e6cd',
    font: '12px/1.45 system-ui, sans-serif',
    borderRadius: 8,
    padding: '10px 12px',
    boxShadow: '0 4px 18px rgba(0,0,0,0.5)'
  },
  h: { margin: '0 0 6px', font: '600 13px system-ui', display: 'flex', justifyContent: 'space-between' },
  row: { display: 'flex', alignItems: 'center', gap: 6, margin: '3px 0' },
  lab: { width: 64, opacity: 0.85, whiteSpace: 'nowrap' },
  range: { flex: 1, minWidth: 0 },
  num: { width: 58, background: '#0004', color: 'inherit', border: '1px solid #f0e6cd44', borderRadius: 4, padding: '1px 4px' },
  btn: {
    background: '#f0e6cd22',
    color: 'inherit',
    border: '1px solid #f0e6cd44',
    borderRadius: 4,
    padding: '2px 8px',
    cursor: 'pointer',
    font: 'inherit'
  },
  ta: {
    width: '100%',
    height: 90,
    marginTop: 6,
    background: '#0004',
    color: '#cdeac0',
    border: '1px solid #f0e6cd33',
    borderRadius: 4,
    font: '10px/1.35 ui-monospace, monospace',
    boxSizing: 'border-box'
  },
  hint: { opacity: 0.6, margin: '4px 0 0', fontSize: 11 }
}

interface PanelProps {
  slug: string | null
  name: string | null
  kind: 'label' | 'dot' | 'decor' | null // what the current selection is
  params: LabelParams | null // effective (override ?? computed), label/decor selection
  dot: DotParams | null // effective dot position, dot selection
  computed: LabelParams | null // heuristic's own result, for reference
  overridden: boolean
  overrides: Record<string, LabelParams>
  dotOverrides: Record<string, DotParams>
  decorOverrides: Record<string, LabelParams>
  // what the CSS renders when the params carry no explicit styling — shown in
  // the color/outline controls until the user touches them
  colorDefaults: { fill: string; stroke: string; strokeW: number }
  onChange: (patch: Partial<LabelParams>) => void
  onChangeDot: (patch: Partial<DotParams>) => void
  onReset: () => void
  onClearAll: () => void
  onDeselect: () => void
}

export interface DotParams {
  x: number
  y: number
}

const DOT_FIELDS: { key: keyof DotParams; label: string; min: number; max: number; step: number }[] = [
  { key: 'x', label: 'X', min: 30, max: 1530, step: 1 },
  { key: 'y', label: 'Y', min: 0, max: 820, step: 1 }
]

export const LabelEditorPanel = ({
  slug,
  name,
  kind,
  params,
  dot,
  computed,
  overridden,
  overrides,
  dotOverrides,
  decorOverrides,
  colorDefaults,
  onChange,
  onChangeDot,
  onReset,
  onClearAll,
  onDeselect
}: PanelProps) => {
  const json = JSON.stringify(overrides, null, 1)
  const dotJson = JSON.stringify(dotOverrides, null, 1)
  const decorJson = JSON.stringify(decorOverrides, null, 1)
  const copy = (text: string) => () => {
    navigator.clipboard?.writeText(text).catch(() => {})
  }
  // the panel itself is draggable by its header, so labels underneath it stay
  // reachable
  const [off, setOff] = React.useState({ x: 0, y: 0 })
  const dragPanel = (e: React.PointerEvent) => {
    e.preventDefault()
    const sx = e.clientX - off.x
    const sy = e.clientY - off.y
    const move = (ev: PointerEvent) => setOff({ x: ev.clientX - sx, y: ev.clientY - sy })
    const up = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }
  return (
    <div style={{ ...S.panel, transform: `translate(${off.x}px, ${off.y}px)` }}>
      <h3 style={{ ...S.h, cursor: 'move', userSelect: 'none' }} onPointerDown={dragPanel} title="Drag to move the panel">
        <span>⠿ Label editor</span>
        <span style={{ opacity: 0.6 }}>
          {Object.keys(overrides).length}L · {Object.keys(dotOverrides).length}D ·{' '}
          {Object.keys(decorOverrides).length}S
        </span>
      </h3>
      {slug && (kind === 'label' || kind === 'decor') && params && (
        <>
          <div style={{ ...S.row, justifyContent: 'space-between' }}>
            <strong>{name}</strong>
            <span>
              <button style={S.btn} onClick={onReset} disabled={!overridden} title="Drop this label's override">
                Reset
              </button>{' '}
              <button style={S.btn} onClick={onDeselect}>
                ×
              </button>
            </span>
          </div>
          {FIELDS.map(f => (
            <div key={f.key} style={S.row}>
              <span style={S.lab}>{f.label}</span>
              <input
                style={S.range}
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={params[f.key]}
                onChange={e => onChange({ [f.key]: Number(e.target.value) })}
              />
              <input
                style={S.num}
                type="number"
                step={f.step}
                value={params[f.key]}
                onChange={e => onChange({ [f.key]: Number(e.target.value) })}
              />
            </div>
          ))}
          <div style={S.row}>
            <span style={S.lab}>Fill</span>
            <input type="color" value={params.fill ?? colorDefaults.fill} onChange={e => onChange({ fill: e.target.value })} />
            <span style={S.lab}>Outline</span>
            <input
              type="color"
              value={params.stroke ?? colorDefaults.stroke}
              onChange={e => onChange({ stroke: e.target.value })}
            />
          </div>
          <div style={S.row}>
            <span style={S.lab}>Outline w</span>
            <input
              style={S.range}
              type="range"
              min={0}
              max={0.5}
              step={0.01}
              value={params.strokeW ?? colorDefaults.strokeW}
              onChange={e => onChange({ strokeW: Number(e.target.value) })}
            />
            <input
              style={S.num}
              type="number"
              min={0}
              max={0.5}
              step={0.01}
              value={params.strokeW ?? colorDefaults.strokeW}
              onChange={e => onChange({ strokeW: Number(e.target.value) })}
            />
          </div>
          {computed && (
            <p style={S.hint}>
              engine: {computed.size}px {computed.ang}° len {computed.len} bow {computed.bow} @ {computed.x},{computed.y}
            </p>
          )}
          <p style={S.hint}>Drag label to move · arrows nudge (⇧ ×10)</p>
        </>
      )}
      {slug && kind === 'dot' && dot && (
        <>
          <div style={{ ...S.row, justifyContent: 'space-between' }}>
            <strong>{name} — army dot</strong>
            <span>
              <button style={S.btn} onClick={onReset} disabled={!overridden} title="Drop this dot's override">
                Reset
              </button>{' '}
              <button style={S.btn} onClick={onDeselect}>
                ×
              </button>
            </span>
          </div>
          {DOT_FIELDS.map(f => (
            <div key={f.key} style={S.row}>
              <span style={S.lab}>{f.label}</span>
              <input
                style={S.range}
                type="range"
                min={f.min}
                max={f.max}
                step={f.step}
                value={dot[f.key]}
                onChange={e => onChangeDot({ [f.key]: Number(e.target.value) })}
              />
              <input
                style={S.num}
                type="number"
                step={f.step}
                value={dot[f.key]}
                onChange={e => onChangeDot({ [f.key]: Number(e.target.value) })}
              />
            </div>
          ))}
          <p style={S.hint}>Drag dot to move · arrows nudge (⇧ ×10)</p>
        </>
      )}
      {!slug && (
        <p style={S.hint}>Click a label, army dot, or sea/country name to edit it. Pinch/scroll zooms as usual.</p>
      )}
      <p style={{ ...S.hint, marginTop: 6 }}>Labels</p>
      <textarea style={S.ta} readOnly value={json} onFocus={e => e.currentTarget.select()} />
      <p style={S.hint}>Army dots</p>
      <textarea style={{ ...S.ta, height: 48 }} readOnly value={dotJson} onFocus={e => e.currentTarget.select()} />
      <p style={S.hint}>Sea / country names</p>
      <textarea style={{ ...S.ta, height: 48 }} readOnly value={decorJson} onFocus={e => e.currentTarget.select()} />
      <div style={{ ...S.row, justifyContent: 'space-between', marginTop: 4 }}>
        <button style={S.btn} onClick={copy(json)}>
          Copy labels
        </button>
        <button style={S.btn} onClick={copy(dotJson)}>
          Copy dots
        </button>
        <button style={S.btn} onClick={copy(decorJson)}>
          Copy decor
        </button>
        <button
          style={S.btn}
          onClick={onClearAll}
          disabled={
            !Object.keys(overrides).length && !Object.keys(dotOverrides).length && !Object.keys(decorOverrides).length
          }
        >
          Clear all
        </button>
      </div>
    </div>
  )
}
