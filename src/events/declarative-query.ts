import type { EventScope } from './event-map'
import type { DeclarativeHost, Query } from './declarative-types'

interface EvaluationContext {
  host: DeclarativeHost
  entity?: unknown
  selection?: { index: number; count: number }
  scope?: EventScope<unknown>
}

const isObject = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

export const getPath = (source: unknown, path: string): unknown => {
  if (!path) return source
  let value = source
  for (const part of path.split('.')) {
    if (value == null) return undefined
    if (Array.isArray(value) && /^\d+$/.test(part)) value = value[Number(part)]
    else value = (value as Record<string, unknown>)[part]
  }
  return value
}

export const setPath = (source: Record<string, unknown>, path: string, value: unknown) => {
  const parts = path.split('.')
  let target = source
  for (const part of parts.slice(0, -1)) {
    if (!isObject(target[part])) target[part] = {}
    target = target[part] as Record<string, unknown>
  }
  target[parts.at(-1)!] = value
}

const reference = (path: string, context: EvaluationContext) => {
  if (path === 'selection.index') return context.selection?.index
  if (path === 'selection.count') return context.selection?.count
  if (path === 'event.attempts') return context.scope?.attempts
  if (path === 'event.elapsedRounds') return context.scope?.elapsedRounds
  if (path === 'event.scheduledRound') return context.scope?.scheduledRound
  if (path === 'event.currentRound') return context.scope?.currentRound
  if (path.startsWith('event.')) {
    const scopedEventValue = getPath(context.scope?.event, path.slice('event.'.length))
    if (scopedEventValue !== undefined) return scopedEventValue
  }
  const relative = context.entity == null ? undefined : getPath(context.entity, path)
  return relative !== undefined ? relative : getPath(context.host.root, path)
}

export const numeric = (value: unknown) => Number(value ?? 0)

export const evaluate = (value: unknown, context: EvaluationContext): unknown => {
  if (typeof value === 'string' && value.startsWith('$')) return reference(value.slice(1), context)
  if (Array.isArray(value)) return value.map((item) => evaluate(item, context))
  if (!isObject(value)) return value

  if ('$literal' in value) return value.$literal
  if ('$group' in value) return context.host.groups?.[String(value.$group)] ?? []
  if ('$and' in value)
    return (value.$and as unknown[]).every((clause) => matchesQuery(context.host.root, clause as Query, context))
  if ('$or' in value)
    return (value.$or as unknown[]).some((clause) => matchesQuery(context.host.root, clause as Query, context))
  if ('$not' in value) return !matchesQuery(context.host.root, value.$not as Query, context)
  if ('$add' in value)
    return (evaluate(value.$add, context) as unknown[]).reduce<number>((sum, item) => sum + numeric(item), 0)
  if ('$subtract' in value) {
    const [first, ...rest] = evaluate(value.$subtract, context) as unknown[]
    return rest.reduce<number>((sum, item) => sum - numeric(item), numeric(first))
  }
  if ('$multiply' in value)
    return (evaluate(value.$multiply, context) as unknown[]).reduce<number>(
      (product, item) => product * numeric(item),
      1,
    )
  if ('$divide' in value) {
    const [left, right] = evaluate(value.$divide, context) as unknown[]
    return numeric(left) / numeric(right)
  }
  if ('$mod' in value) {
    const [left, right] = evaluate(value.$mod, context) as unknown[]
    return numeric(left) % numeric(right)
  }
  if ('$min' in value) return Math.min(...(evaluate(value.$min, context) as unknown[]).map(numeric))
  if ('$max' in value) return Math.max(...(evaluate(value.$max, context) as unknown[]).map(numeric))
  if ('$round' in value) {
    const [operand, direction] = value.$round as unknown[]
    const n = numeric(evaluate(operand, context))
    return direction === 'up' ? Math.ceil(n) : direction === 'down' ? Math.floor(n) : Math.round(n)
  }
  if ('$if' in value) {
    const [conditionValue, yes, no] = value.$if as unknown[]
    const conditionResult =
      isObject(conditionValue) &&
      !Object.keys(conditionValue).some((key) =>
        ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte', '$and', '$or', '$not'].includes(key),
      )
        ? matchesQuery(context.host.root, conditionValue as Query, context)
        : evaluate(conditionValue, context)
    return conditionResult ? evaluate(yes, context) : evaluate(no, context)
  }
  if ('$count' in value) {
    const evaluated = evaluate(value.$count, context)
    if (Array.isArray(evaluated) || typeof evaluated === 'string') return evaluated.length
    if (isObject(evaluated)) return Object.keys(evaluated).length
    return 0
  }
  for (const operator of ['$eq', '$ne', '$gt', '$gte', '$lt', '$lte'] as const) {
    if (!(operator in value)) continue
    const [left, right] = evaluate(value[operator], context) as unknown[]
    return compare(left, operator, right, context)
  }

  return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, evaluate(item, context)]))
}

const equal = (actual: unknown, expected: unknown) => {
  if (Array.isArray(actual) && !Array.isArray(expected)) return actual.includes(expected)
  return actual === expected
}

const compare = (actual: unknown, operator: string, operand: unknown, context: EvaluationContext) => {
  const expected = evaluate(operand, context)
  switch (operator) {
    case '$eq':
      return equal(actual, expected)
    case '$ne':
      return !equal(actual, expected)
    case '$gt':
      return numeric(actual) > numeric(expected)
    case '$gte':
      return numeric(actual) >= numeric(expected)
    case '$lt':
      return numeric(actual) < numeric(expected)
    case '$lte':
      return numeric(actual) <= numeric(expected)
    case '$in':
      return Array.isArray(expected) && expected.includes(actual as never)
    case '$nin':
      return Array.isArray(expected) && !expected.includes(actual as never)
    case '$exists':
      return expected ? actual !== undefined : actual === undefined
    default:
      return false
  }
}

const collectionValues = (value: unknown) =>
  Array.isArray(value) ? value : isObject(value) ? Object.values(value) : []

const matchesField = (actual: unknown, expected: unknown, context: EvaluationContext): boolean => {
  if (!isObject(expected) || !Object.keys(expected).some((key) => key.startsWith('$')))
    return equal(actual, evaluate(expected, context))
  if ('$some' in expected)
    return collectionValues(actual).some((item) =>
      matchesQuery(item, expected.$some as Query, { ...context, entity: item }),
    )
  if ('$none' in expected)
    return collectionValues(actual).every(
      (item) => !matchesQuery(item, expected.$none as Query, { ...context, entity: item }),
    )
  if ('$every' in expected)
    return collectionValues(actual).every((item) =>
      matchesQuery(item, expected.$every as Query, { ...context, entity: item }),
    )
  return Object.entries(expected).every(([operator, operand]) => compare(actual, operator, operand, context))
}

export const matchesQuery = (entity: unknown, query: Query, context: EvaluationContext): boolean => {
  if ('$and' in query)
    return (query.$and as unknown as Query[]).every((clause) => matchesQuery(entity, clause, context))
  if ('$or' in query) return (query.$or as unknown as Query[]).some((clause) => matchesQuery(entity, clause, context))
  if ('$not' in query) return !matchesQuery(entity, query.$not as unknown as Query, context)
  return Object.entries(query).every(([path, expected]) => {
    const actual = reference(path, { ...context, entity })
    return matchesField(actual, expected, { ...context, entity })
  })
}

export const matchesWhen = (when: Query[] | undefined, host: DeclarativeHost, scope?: EventScope<unknown>) =>
  (when ?? []).every((clause) => matchesQuery(host.root, clause, { host, scope }))
