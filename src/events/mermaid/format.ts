import type { EntityUpdate } from '../declarative-types'

export const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const GRAPH_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
export const graphId = (prefix: string, ...parts: string[]) =>
  `${prefix}_${parts
    .join('_')
    .replace(/[^a-zA-Z0-9_]/g, '_')
    .replace(/^([0-9])/, '_$1')}`
const graphEscape = (value: unknown) =>
  String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
export const graphLabel = (lines: Array<string | number | undefined>) =>
  lines
    .filter((line): line is string | number => line !== undefined && line !== '')
    .map(graphEscape)
    .join('<br/>')

export const graphConditionPath = (path: string) =>
  path.startsWith('action.') ? `trigger input · ${path.slice('action.'.length)}` : path

export const graphValue = (value: unknown): string => {
  if (typeof value === 'string') return value.startsWith('$') ? value : JSON.stringify(value)
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return `[${value.map(graphValue).join(', ')}]`
  if (!isObject(value)) return String(value)
  if ('$group' in value) return `group:${String(value.$group)}`
  if ('$literal' in value) return graphValue(value.$literal)
  return Object.entries(value)
    .map(([key, item]) => `${key} ${graphValue(item)}`)
    .join(', ')
}

export const QUERY_OPERATORS: Record<string, string> = {
  $eq: '=',
  $ne: '≠',
  $gt: '>',
  $gte: '≥',
  $lt: '<',
  $lte: '≤',
  $in: 'in',
  $nin: 'not in',
  $exists: 'exists',
  $some: 'any',
  $none: 'none',
  $every: 'all',
}

export function graphQuery(query: unknown): string {
  if (!isObject(query)) return graphValue(query)
  if ('$and' in query || '$or' in query) {
    const operator = '$and' in query ? '$and' : '$or'
    const clauses = Array.isArray(query[operator]) ? (query[operator] as unknown[]) : []
    return `(${clauses.map(graphQuery).join(operator === '$and' ? ' AND ' : ' OR ')})`
  }
  if ('$not' in query) return `NOT (${graphQuery(query.$not)})`
  for (const [operator, label] of Object.entries(QUERY_OPERATORS)) {
    if (!(operator in query) || !Array.isArray(query[operator])) continue
    const operands = query[operator] as unknown[]
    return operands.length === 2
      ? `${graphInlineExpression(operands[0])} ${label} ${graphInlineExpression(operands[1])}`
      : `${label} ${operands.map(graphInlineExpression).join(', ')}`
  }
  return Object.entries(query)
    .map(([path, expected]) => {
      if (!isObject(expected) || !Object.keys(expected).some((key) => key.startsWith('$')))
        return `${path} = ${graphInlineExpression(expected)}`
      return Object.entries(expected)
        .map(([operator, operand]) => {
          const label = QUERY_OPERATORS[operator] ?? operator.replace(/^\$/, '')
          const rendered = ['$some', '$none', '$every'].includes(operator)
            ? graphQuery(operand)
            : graphInlineExpression(operand)
          return `${path} ${label} ${rendered}`
        })
        .join(' AND ')
    })
    .join(' AND ')
}

export const EXPRESSION_OPERATORS: Record<string, { name: string; symbol?: string }> = {
  $add: { name: 'ADD', symbol: '+' },
  $subtract: { name: 'SUBTRACT', symbol: '−' },
  $multiply: { name: 'MULTIPLY', symbol: '×' },
  $divide: { name: 'DIVIDE', symbol: '÷' },
  $mod: { name: 'REMAINDER', symbol: 'mod' },
  $min: { name: 'MINIMUM OF' },
  $max: { name: 'MAXIMUM OF' },
}

export function graphInlineExpression(value: unknown): string {
  if (typeof value === 'string') return value.startsWith('$') ? value : JSON.stringify(value)
  if (value === null || typeof value === 'number' || typeof value === 'boolean') return String(value)
  if (Array.isArray(value)) return value.map(graphInlineExpression).join(', ')
  if (!isObject(value)) return String(value)
  if ('$group' in value) return `group:${String(value.$group)}`
  if ('$literal' in value) return graphInlineExpression(value.$literal)
  if ('$count' in value) return `count(${graphInlineExpression(value.$count)})`
  if ('$round' in value && Array.isArray(value.$round)) {
    const [operand, mode] = value.$round as unknown[]
    const name = mode === 'down' ? 'floor' : mode === 'up' ? 'ceiling' : 'round'
    return `${name}(${graphInlineExpression(operand)})`
  }
  if ('$if' in value) return 'conditional value'
  for (const [operator, { name, symbol }] of Object.entries(EXPRESSION_OPERATORS)) {
    if (!(operator in value)) continue
    const operands = Array.isArray(value[operator]) ? (value[operator] as unknown[]) : [value[operator]]
    return symbol
      ? operands.map(graphInlineExpression).join(` ${symbol} `)
      : `${name.toLowerCase()}(${operands.map(graphInlineExpression).join(', ')})`
  }
  if ('$and' in value || '$or' in value || '$not' in value || Object.keys(value).some((key) => key in QUERY_OPERATORS))
    return graphQuery(value)
  return Object.entries(value)
    .map(([key, item]) => `${key}: ${graphInlineExpression(item)}`)
    .join(', ')
}

export const graphSelection = (select: EntityUpdate['select']) => {
  if (!select) return undefined
  const parts: string[] = []
  if (select.$sample) parts.push(`sample ${graphValue(select.$sample)}`)
  if (select.$sort) parts.push(`sort ${graphValue(select.$sort)}`)
  if (select.$limit != null) parts.push(`limit ${select.$limit}`)
  return `Select: ${parts.join(' · ')}`
}

export const graphEntityLabel = (slug: string) =>
  slug
    .split('-')
    .map((part) => (part ? `${part[0].toUpperCase()}${part.slice(1)}` : part))
    .join(' ')
