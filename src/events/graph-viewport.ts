export type GraphPoint = { x: number; y: number }

export type GraphTransform = GraphPoint & {
  scale: number
}

export type GraphSize = {
  width: number
  height: number
}

// The complete campaign topology is deliberately tall. Keep the floor low
// enough for Fit to contain that graph on laptop and phone viewports.
export const GRAPH_ZOOM_MIN = 0.025
export const GRAPH_ZOOM_MAX = 4

export const clampGraphScale = (scale: number, minimum = GRAPH_ZOOM_MIN, maximum = GRAPH_ZOOM_MAX) =>
  Math.min(maximum, Math.max(minimum, scale))

/** Move the rendered graph by a distance measured in viewport pixels. */
export const translateGraph = (transform: GraphTransform, delta: GraphPoint): GraphTransform => ({
  ...transform,
  x: transform.x + delta.x,
  y: transform.y + delta.y,
})

/** Pan a graph point to the viewport center without changing the zoom level. */
export const centerGraphPoint = (
  transform: GraphTransform,
  point: GraphPoint,
  viewport: GraphSize,
): GraphTransform => ({
  scale: transform.scale,
  x: viewport.width / 2 - point.x * transform.scale,
  y: viewport.height / 2 - point.y * transform.scale,
})

/**
 * Zoom while preserving the graph point currently below the supplied viewport
 * coordinate. This is shared by buttons, trackpad pinch, and touch pinch so
 * each input method feels spatially identical.
 */
export const zoomGraphAt = (
  transform: GraphTransform,
  requestedScale: number,
  anchor: GraphPoint,
  minimum = GRAPH_ZOOM_MIN,
  maximum = GRAPH_ZOOM_MAX,
): GraphTransform => {
  const scale = clampGraphScale(requestedScale, minimum, maximum)
  if (scale === transform.scale) return transform
  const graphX = (anchor.x - transform.x) / transform.scale
  const graphY = (anchor.y - transform.y) / transform.scale
  return {
    scale,
    x: anchor.x - graphX * scale,
    y: anchor.y - graphY * scale,
  }
}

/** Center the whole graph in the available viewport with an even safe margin. */
export const fitGraph = (
  graph: GraphSize,
  viewport: GraphSize,
  padding = 28,
  maximum = 1.15,
  minimum = GRAPH_ZOOM_MIN,
): GraphTransform => {
  if (graph.width <= 0 || graph.height <= 0 || viewport.width <= 0 || viewport.height <= 0) {
    return { x: 0, y: 0, scale: 1 }
  }
  const availableWidth = Math.max(1, viewport.width - padding * 2)
  const availableHeight = Math.max(1, viewport.height - padding * 2)
  const scale = clampGraphScale(
    Math.min(availableWidth / graph.width, availableHeight / graph.height, maximum),
    minimum,
    maximum,
  )
  return {
    scale,
    x: (viewport.width - graph.width * scale) / 2,
    y: (viewport.height - graph.height * scale) / 2,
  }
}

/** Convert wheel deltas into pixels before using them as pan distances. */
export const wheelDeltaPixels = (delta: GraphPoint, deltaMode: number, viewportHeight: number): GraphPoint => {
  const multiplier = deltaMode === 1 ? 16 : deltaMode === 2 ? viewportHeight : 1
  return { x: delta.x * multiplier, y: delta.y * multiplier }
}
