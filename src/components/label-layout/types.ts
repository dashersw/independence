export interface ArcLabel {
  kind: 'arc'
  d: string
  size: number
  fill?: string
  stroke?: string
  strokeW?: number
}

export interface PlainLabel {
  kind: 'plain'
  size: number
}

export type LabelLayout = ArcLabel | PlainLabel

export interface LabelParams {
  x: number
  y: number
  ang: number
  len: number
  size: number
  bow: number
  fill?: string
  stroke?: string
  strokeW?: number
}

export interface TerritoryShape {
  bbox: number[]
  paths: string[]
}

export const arcFromParams = (params: LabelParams): ArcLabel => {
  const radians = (params.ang * Math.PI) / 180
  const ux = Math.cos(radians)
  const uy = Math.sin(radians)
  const cx = params.x + -uy * 2 * params.bow
  const cy = params.y + ux * 2 * params.bow
  const round = (value: number) => Math.round(value * 10) / 10
  const arc: ArcLabel = {
    kind: 'arc',
    d: `M ${round(params.x - (ux * params.len) / 2)},${round(params.y - (uy * params.len) / 2)} Q ${round(cx)},${round(cy)} ${round(params.x + (ux * params.len) / 2)},${round(params.y + (uy * params.len) / 2)}`,
    size: params.size,
  }
  if (params.fill !== undefined) arc.fill = params.fill
  if (params.stroke !== undefined) arc.stroke = params.stroke
  if (params.strokeW !== undefined) arc.strokeW = params.strokeW
  return arc
}
