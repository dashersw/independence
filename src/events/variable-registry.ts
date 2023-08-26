import type { DeclarativeCampaign, DeclarativeThen } from './declarative'

export type VariableUsage = {
  key: string
  kind: 'event' | 'rule'
  id: string
  label: string
  reads: boolean
  writes: boolean
}

export type VariableRegistryEntry = {
  path: string
  initial: unknown
  usages: VariableUsage[]
}

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const collectExpressionReferences = (value: unknown, references = new Set<string>()) => {
  if (typeof value === 'string' && value.startsWith('$')) references.add(value.slice(1))
  else if (Array.isArray(value)) value.forEach((item) => collectExpressionReferences(item, references))
  else if (isRecord(value)) Object.values(value).forEach((item) => collectExpressionReferences(item, references))
  return references
}

const collectQueryReferences = (value: unknown, references = new Set<string>()) => {
  if (Array.isArray(value)) value.forEach((item) => collectQueryReferences(item, references))
  else if (isRecord(value))
    Object.entries(value).forEach(([key, item]) => {
      if (!key.startsWith('$')) references.add(key)
      collectQueryReferences(item, references)
    })
  else collectExpressionReferences(value, references)
  return references
}

const collectThenWrites = (then: DeclarativeThen | undefined, writes = new Set<string>()) => {
  if (!then) return writes
  for (const root of ['variables', 'game', 'turn', 'result'] as const)
    Object.keys(then[root] ?? {}).forEach((path) => writes.add(`${root}.${path}`))
  return writes
}

const collectThenReferences = (then: DeclarativeThen | undefined, references = new Set<string>()) => {
  if (!then) return references
  collectExpressionReferences(then, references)
  for (const update of [...(then.territories ?? []), ...(then.factions ?? [])])
    if (update.where) collectQueryReferences(update.where, references)
  for (const battle of then.battles ?? []) {
    if (battle.attacker.where) collectQueryReferences(battle.attacker.where, references)
    if (battle.target.where) collectQueryReferences(battle.target.where, references)
  }
  return references
}

export const campaignVariableRegistry = (document: DeclarativeCampaign): VariableRegistryEntry[] => {
  const initialValues = new Map<string, unknown>()
  const flatten = (value: unknown, path: string) => {
    if (isRecord(value) && Object.keys(value).length) {
      for (const [field, child] of Object.entries(value)) flatten(child, `${path}.${field}`)
    } else {
      initialValues.set(path, value)
    }
  }
  for (const [field, value] of Object.entries(document.variables ?? {})) flatten(value, `variables.${field}`)

  const usages = new Map<string, Map<string, VariableUsage>>()
  const recordUsage = (
    descriptor: Pick<VariableUsage, 'kind' | 'id' | 'label'>,
    reads: Set<string>,
    writes: Set<string>,
  ) => {
    const paths = new Set([...reads, ...writes].filter((path) => path.startsWith('variables.')))
    for (const path of paths) {
      if (!usages.has(path)) usages.set(path, new Map())
      const key = `${descriptor.kind}:${descriptor.id}`
      usages.get(path)!.set(key, {
        ...descriptor,
        key,
        reads: reads.has(path),
        writes: writes.has(path),
      })
    }
  }

  for (const event of document.events) {
    const reads = collectQueryReferences(event.when ?? [])
    collectExpressionReferences(event.data, reads)
    collectExpressionReferences(event.vars, reads)
    collectThenReferences(event.then, reads)
    const writes = collectThenWrites(event.then)
    for (const eventChoice of event.choices ?? []) {
      collectThenReferences(eventChoice.then, reads)
      collectThenWrites(eventChoice.then, writes)
    }
    recordUsage({ kind: 'event', id: event.id, label: event.title }, reads, writes)
  }

  for (const rule of document.rules ?? []) {
    const reads = collectQueryReferences(rule.when ?? [])
    collectThenReferences(rule.then, reads)
    const writes = collectThenWrites(rule.then)
    recordUsage({ kind: 'rule', id: rule.id, label: rule.on }, reads, writes)
  }

  const paths = new Set([...initialValues.keys(), ...usages.keys()])
  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .map((path) => ({
      path,
      initial: initialValues.get(path),
      usages: [...(usages.get(path)?.values() ?? [])].sort(
        (left, right) => left.kind.localeCompare(right.kind) || left.label.localeCompare(right.label),
      ),
    }))
}
