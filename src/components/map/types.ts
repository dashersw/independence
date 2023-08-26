import type React from 'react'

export type MapEditKind = 'label' | 'dot' | 'decor'

export interface MapEditSelection {
  kind: MapEditKind
  slug: string
}

export type StartMapEditDrag = (kind: MapEditKind, slug: string, event: React.PointerEvent) => void
