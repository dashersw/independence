import { useEffect, useMemo, useState, type RefObject } from 'react'
import mapData from '../../../game/map-data.json'
import Territory from '../../../game/territory'
import { tTerritory } from '../../../i18n'
import decorPins from '../../decorOverrides.json'
import dotPins from '../../dotOverrides.json'
import { labelEditEnabled, paramsFromLayout, type DotParams, type LabelParams } from '../../LabelEditor'
import { labelLayouts } from '../../labelLayout'
import { DECOR_BY_SLUG, decorDefaults } from '../../map-art'
import type { MapEditSelection, StartMapEditDrag } from '../types'
import { baseDims } from '../../viewport'

interface ViewState {
  z: number
  cx: number
  cy: number
}

interface MapLabelEditorOptions {
  territories: Territory[]
  lang: string
  bySlug: Record<string, Territory>
  svgRef: RefObject<SVGSVGElement | null>
  viewRef: RefObject<ViewState>
  aspectRef: RefObject<number>
}

export const useMapLabelEditor = ({ territories, lang, bySlug, svgRef, viewRef, aspectRef }: MapLabelEditorOptions) => {
  const layouts = useMemo(
    () =>
      labelLayouts(
        Object.fromEntries(
          territories.map((territory) => [territory.slug, tTerritory(territory.slug, territory.name)]),
        ),
        lang,
      ),
    // Territory geometry never changes during a game; only the display
    // language does.
    [lang],
  )
  const editMode = useMemo(labelEditEnabled, [])
  const [overrides, setOverrides] = useState<Record<string, LabelParams>>(() => {
    if (!labelEditEnabled()) return {}
    try {
      return JSON.parse(localStorage.getItem('labelOverrides') || '{}')
    } catch {
      return {}
    }
  })
  const [dotOverrides, setDotOverrides] = useState<Record<string, DotParams>>(() => {
    if (!labelEditEnabled()) return {}
    try {
      return JSON.parse(localStorage.getItem('dotOverrides') || '{}')
    } catch {
      return {}
    }
  })
  const [decorOverrides, setDecorOverrides] = useState<Record<string, LabelParams>>(() => {
    if (!labelEditEnabled()) return {}
    try {
      return JSON.parse(localStorage.getItem('decorOverrides') || '{}')
    } catch {
      return {}
    }
  })
  const [selected, setSelected] = useState<MapEditSelection | null>(null)

  useEffect(() => {
    if (!editMode) return
    localStorage.setItem('labelOverrides', JSON.stringify(overrides))
    localStorage.setItem('dotOverrides', JSON.stringify(dotOverrides))
    localStorage.setItem('decorOverrides', JSON.stringify(decorOverrides))
  }, [editMode, overrides, dotOverrides, decorOverrides])

  const paramsFor = (slug: string): LabelParams =>
    overrides[slug] ??
    paramsFromLayout(layouts[slug], bySlug[slug].name, (mapData.territories as any)[slug].label as [number, number])

  const dotFor = (slug: string): DotParams => {
    if (editMode && dotOverrides[slug]) return dotOverrides[slug]
    const pin = (dotPins as Record<string, DotParams>)[slug]
    if (pin) return pin
    const [x, y] = (mapData.territories as any)[slug].label as [number, number]
    return { x, y }
  }

  const decorFor = (slug: string): LabelParams =>
    (editMode ? decorOverrides[slug] : undefined) ??
    (decorPins as Record<string, LabelParams>)[slug] ??
    decorDefaults(DECOR_BY_SLUG[slug])

  const patchLabel = (slug: string, patch: Partial<LabelParams>) =>
    setOverrides((current) => ({
      ...current,
      [slug]: { ...(current[slug] ?? paramsFor(slug)), ...patch },
    }))
  const patchDot = (slug: string, patch: Partial<DotParams>) =>
    setDotOverrides((current) => ({
      ...current,
      [slug]: { ...(current[slug] ?? dotFor(slug)), ...patch },
    }))
  const patchDecor = (slug: string, patch: Partial<LabelParams>) =>
    setDecorOverrides((current) => ({
      ...current,
      [slug]: { ...(current[slug] ?? decorFor(slug)), ...patch },
    }))

  const startDrag: StartMapEditDrag = (kind, slug, event) => {
    event.preventDefault()
    event.stopPropagation()
    setSelected({ kind, slug })
    const svg = svgRef.current
    if (!svg) return
    const start = kind === 'label' ? paramsFor(slug) : kind === 'dot' ? dotFor(slug) : decorFor(slug)
    const patch = kind === 'label' ? patchLabel : kind === 'dot' ? patchDot : patchDecor
    const startX = event.clientX
    const startY = event.clientY
    const rect = svg.getBoundingClientRect()
    const view = viewRef.current
    const aspect = aspectRef.current
    if (!view || aspect === null) return
    const base = baseDims(aspect)
    const scale = Math.min(rect.width / (base.w / view.z), rect.height / (base.h / view.z))
    let moved = false
    const move = (pointerEvent: PointerEvent) => {
      if (!moved && Math.hypot(pointerEvent.clientX - startX, pointerEvent.clientY - startY) < 3) return
      moved = true
      patch(slug, {
        x: Math.round(((pointerEvent.clientX - startX) / scale + start.x) * 10) / 10,
        y: Math.round(((pointerEvent.clientY - startY) / scale + start.y) * 10) / 10,
      })
    }
    const stop = () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', stop)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', stop)
  }

  useEffect(() => {
    if (!editMode) return
    const onKey = (event: KeyboardEvent) => {
      if (!selected) return
      const tag = (event.target as HTMLElement)?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA') return
      const distance = event.shiftKey ? 10 : 1
      const params =
        selected.kind === 'label'
          ? paramsFor(selected.slug)
          : selected.kind === 'dot'
            ? dotFor(selected.slug)
            : decorFor(selected.slug)
      const patch: Partial<DotParams> | null =
        event.key === 'ArrowLeft'
          ? { x: params.x - distance }
          : event.key === 'ArrowRight'
            ? { x: params.x + distance }
            : event.key === 'ArrowUp'
              ? { y: params.y - distance }
              : event.key === 'ArrowDown'
                ? { y: params.y + distance }
                : null
      if (patch) {
        event.preventDefault()
        ;(selected.kind === 'label' ? patchLabel : selected.kind === 'dot' ? patchDot : patchDecor)(
          selected.slug,
          patch,
        )
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  })

  const dropSelected = <T>(current: Record<string, T>) => {
    if (!selected) return current
    const { [selected.slug]: _, ...rest } = current
    return rest
  }

  const patchSelected = (patch: Partial<LabelParams>) => {
    if (!selected) return
    if (selected.kind === 'decor') patchDecor(selected.slug, patch)
    else patchLabel(selected.slug, patch)
  }

  const patchSelectedDot = (patch: Partial<DotParams>) => {
    if (selected) patchDot(selected.slug, patch)
  }

  const resetSelected = () => {
    if (!selected) return
    if (selected.kind === 'label') setOverrides(dropSelected)
    else if (selected.kind === 'dot') setDotOverrides(dropSelected)
    else setDecorOverrides(dropSelected)
  }

  const clearAll = () => {
    setOverrides({})
    setDotOverrides({})
    setDecorOverrides({})
  }

  return {
    layouts,
    editMode,
    overrides,
    dotOverrides,
    decorOverrides,
    selected,
    paramsFor,
    dotFor,
    decorFor,
    startDrag,
    patchSelected,
    patchSelectedDot,
    resetSelected,
    clearAll,
    deselect: () => setSelected(null),
  }
}

export type MapLabelEditorController = ReturnType<typeof useMapLabelEditor>
