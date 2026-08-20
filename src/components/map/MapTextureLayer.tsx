interface MapTextureLayerProps {
  editMode: boolean
}

// In play the grain/blotch are pre-multiplied into the baked map bitmap and
// the desk texture (see useMapBaking) — live blend-mode layers cost a
// full-screen compositor pass and a ~30 MB texture each. Edit mode keeps the
// live filters so the tuning view stays fully dynamic.
export const MapTextureLayer = ({ editMode }: MapTextureLayerProps) => (
  <>
    {editMode && (
      <rect
        x={-400}
        y={-300}
        width={2360}
        height={1420}
        filter="url(#paper-grain)"
        opacity={0.4}
        style={{ mixBlendMode: 'multiply' }}
        pointerEvents="none"
      />
    )}
    {editMode && (
      <rect
        x={-400}
        y={-300}
        width={2360}
        height={1420}
        filter="url(#wash-blotch)"
        opacity={0.6}
        style={{ mixBlendMode: 'soft-light' }}
        pointerEvents="none"
      />
    )}
    <rect x={-400} y={-300} width={2360} height={1420} fill="url(#vignette-grad)" pointerEvents="none" />
  </>
)
