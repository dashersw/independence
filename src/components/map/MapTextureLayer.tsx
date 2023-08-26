interface MapTextureLayerProps {
  editMode: boolean
  grainUrl: string | null
  blotchUrl: string | null
}

export const MapTextureLayer = ({ editMode, grainUrl, blotchUrl }: MapTextureLayerProps) => (
  <>
    {editMode ? (
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
    ) : grainUrl ? (
      <image
        x={-400}
        y={-300}
        width={2360}
        height={1420}
        href={grainUrl}
        preserveAspectRatio="none"
        opacity={0.4}
        style={{ mixBlendMode: 'multiply' }}
        pointerEvents="none"
      />
    ) : null}
    {editMode ? (
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
    ) : blotchUrl ? (
      <image
        x={-400}
        y={-300}
        width={2360}
        height={1420}
        href={blotchUrl}
        preserveAspectRatio="none"
        opacity={0.6}
        style={{ mixBlendMode: 'soft-light' }}
        pointerEvents="none"
      />
    ) : null}
    <rect x={-400} y={-300} width={2360} height={1420} fill="url(#vignette-grad)" pointerEvents="none" />
  </>
)
