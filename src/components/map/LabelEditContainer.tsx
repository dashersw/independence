import mapData from '../../game/map-data.json'
import Territory from '../../game/territory'
import { LabelEditorPanel, paramsFromLayout } from '../LabelEditor'
import { DECOR_BY_SLUG } from '../map-art'
import type { MapLabelEditorController } from './hooks/useMapLabelEditor'

interface LabelEditContainerProps {
  bySlug: Record<string, Territory>
  editor: MapLabelEditorController
}

export const LabelEditContainer = ({ bySlug, editor }: LabelEditContainerProps) => {
  if (!editor.editMode) return null
  const selected = editor.selected

  return (
    <LabelEditorPanel
      slug={selected?.slug ?? null}
      name={
        selected ? (selected.kind === 'decor' ? DECOR_BY_SLUG[selected.slug].text : bySlug[selected.slug].name) : null
      }
      kind={selected?.kind ?? null}
      params={
        selected?.kind === 'label'
          ? editor.paramsFor(selected.slug)
          : selected?.kind === 'decor'
            ? editor.decorFor(selected.slug)
            : null
      }
      dot={selected?.kind === 'dot' ? editor.dotFor(selected.slug) : null}
      computed={
        selected?.kind === 'label'
          ? paramsFromLayout(
              editor.layouts[selected.slug],
              bySlug[selected.slug].name,
              (mapData.territories as any)[selected.slug].label as [number, number],
            )
          : null
      }
      overridden={
        !!selected &&
        !!(selected.kind === 'label'
          ? editor.overrides[selected.slug]
          : selected.kind === 'dot'
            ? editor.dotOverrides[selected.slug]
            : editor.decorOverrides[selected.slug])
      }
      overrides={editor.overrides}
      dotOverrides={editor.dotOverrides}
      decorOverrides={editor.decorOverrides}
      colorDefaults={
        selected?.kind === 'decor'
          ? DECOR_BY_SLUG[selected.slug].cls === 'sea-label'
            ? { fill: '#4f6b80', stroke: '#201a12', strokeW: 0 }
            : { fill: '#8a7a5f', stroke: '#201a12', strokeW: 0 }
          : { fill: '#fffdf5', stroke: '#201a12', strokeW: 0.22 }
      }
      onChange={editor.patchSelected}
      onChangeDot={editor.patchSelectedDot}
      onReset={editor.resetSelected}
      onClearAll={editor.clearAll}
      onDeselect={editor.deselect}
    />
  )
}
