import type { DeclarativeCampaign, DeclarativeEvent, DeclarativeThen, Query } from '../declarative-types'
import { graphEntityLabel, graphSelection, graphValue, isObject } from './format'
import type { GraphDetail } from './model'

const literalTerritorySelector = (where: Query | undefined) => {
  if (!where || !('slug' in where)) return null
  const expected = where.slug
  const slug =
    typeof expected === 'string'
      ? expected
      : isObject(expected) && Object.keys(expected).length === 1 && typeof expected.$eq === 'string'
        ? expected.$eq
        : null
  if (!slug || slug.startsWith('$')) return null
  const remaining = Object.fromEntries(Object.entries(where).filter(([path]) => path !== 'slug')) as Query
  return {
    label: graphEntityLabel(slug),
    where: Object.keys(remaining).length ? remaining : undefined,
  }
}

export const graphThenDetails = (then: DeclarativeThen | undefined): GraphDetail[] => {
  if (!then) return []
  const details: GraphDetail[] = []
  for (const root of ['variables', 'game', 'turn', 'result'] as const) {
    const values = then[root]
    if (values)
      details.push({
        id: root,
        kind: 'write',
        lines: [`Set ${root}`],
        assignments: Object.entries(values).map(([field, value]) => ({ path: `${root}.${field}`, value })),
      })
  }
  for (const collection of ['territories', 'factions'] as const) {
    for (const [index, update] of (then[collection] ?? []).entries()) {
      const literalTerritory = collection === 'territories' ? literalTerritorySelector(update.where) : null
      details.push({
        id: `${collection}-${update.id ?? index + 1}`,
        kind: 'effect',
        collection,
        entityLabel: literalTerritory?.label,
        where: literalTerritory ? literalTerritory.where : update.where,
        lines: [
          literalTerritory ? `Update ${literalTerritory.label}` : `Update ${collection}`,
          graphSelection(update.select),
        ].filter((line): line is string => !!line),
        assignments: Object.entries(update.set).map(([field, value]) => ({ path: field, value })),
      })
    }
  }
  if (then.cards?.length)
    details.push({
      id: 'cards',
      kind: 'effect',
      lines: [
        'Draw cards',
        ...then.cards.map((draw) => `${graphValue(draw.faction)} draws ${graphValue(draw.count ?? 1)}`),
      ],
    })
  if (then.logs?.length)
    details.push({
      id: 'logs',
      kind: 'effect',
      lines: [
        'Write logs',
        ...then.logs.map(
          (log) => `${graphValue(log.key)}${log.faction === undefined ? '' : ` · ${graphValue(log.faction)}`}`,
        ),
      ],
    })
  if (then.battles?.length)
    details.push({
      id: 'battles',
      kind: 'effect',
      lines: [
        'Resolve battles',
        ...then.battles.map(
          (battle) =>
            `${graphValue(battle.repeat ?? 1)}× ${graphValue(battle.attacker)} → ${graphValue(battle.target)} · ${graphValue(battle.troops)} troops`,
        ),
      ],
    })
  return details
}

const collectGraphReferences = (value: unknown, references = new Set<string>()) => {
  if (typeof value === 'string' && value.startsWith('$')) references.add(value.slice(1))
  else if (Array.isArray(value)) value.forEach((item) => collectGraphReferences(item, references))
  else if (isObject(value))
    Object.entries(value).forEach(([key, item]) => {
      if (!key.startsWith('$')) references.add(key)
      collectGraphReferences(item, references)
    })
  return references
}

const collectGraphExpressionReferences = (value: unknown, references = new Set<string>()) => {
  if (typeof value === 'string' && value.startsWith('$')) references.add(value.slice(1))
  else if (Array.isArray(value)) value.forEach((item) => collectGraphExpressionReferences(item, references))
  else if (isObject(value) && '$if' in value && Array.isArray(value.$if)) {
    const [condition, whenTrue, whenFalse] = value.$if as unknown[]
    collectGraphReferences(condition, references)
    collectGraphExpressionReferences(whenTrue, references)
    collectGraphExpressionReferences(whenFalse, references)
  } else if (isObject(value)) Object.values(value).forEach((item) => collectGraphExpressionReferences(item, references))
  return references
}

const collectGraphThenReferences = (then: DeclarativeThen, references = new Set<string>()) => {
  for (const root of ['variables', 'game', 'turn', 'result'] as const)
    Object.values(then[root] ?? {}).forEach((value) => collectGraphExpressionReferences(value, references))
  for (const collection of ['territories', 'factions'] as const) {
    for (const update of then[collection] ?? []) {
      if (update.where) collectGraphReferences(update.where, references)
      if (update.select) collectGraphExpressionReferences(update.select, references)
      Object.values(update.set).forEach((value) => collectGraphExpressionReferences(value, references))
    }
  }
  for (const action of [...(then.cards ?? []), ...(then.logs ?? []), ...(then.battles ?? [])])
    collectGraphExpressionReferences(action, references)
  return references
}

const collectGraphWrites = (then: DeclarativeThen | undefined, writes = new Set<string>()) => {
  if (!then) return writes
  for (const root of ['variables', 'game', 'turn', 'result'] as const)
    Object.keys(then[root] ?? {}).forEach((path) => writes.add(`${root}.${path}`))
  return writes
}

export const graphRulesFor = (document: DeclarativeCampaign, event: DeclarativeEvent) => {
  const writes = collectGraphWrites(event.then)
  event.choices?.forEach((eventChoice) => collectGraphWrites(eventChoice.then, writes))
  const overlaps = (left: string, right: string) =>
    left === right || left.startsWith(`${right}.`) || right.startsWith(`${left}.`)
  return (document.rules ?? []).filter((rule) => {
    const reads = collectGraphReferences(rule.when)
    collectGraphThenReferences(rule.then, reads)
    return [...writes].some((write) => [...reads].some((read) => overlaps(write, read)))
  })
}
