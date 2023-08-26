// Text glyphs (▶ / Ⅱ) sit off-centre inside their em box and the offset differs
// per font, so the transport draws its own shapes: centred by geometry.
export const PlayIcon = () => (
  <svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path d="M4 2.5 L12 7 L4 11.5 Z" />
  </svg>
)

export const PauseIcon = () => (
  <svg viewBox="0 0 14 14" aria-hidden="true" focusable="false">
    <path d="M3.5 2.5h2.2v9h-2.2z M8.3 2.5h2.2v9h-2.2z" />
  </svg>
)
