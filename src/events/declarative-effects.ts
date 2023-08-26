import type { EventScope } from './event-map'
import type { DeclarativeHost, DeclarativeThen, EntityUpdate } from './declarative-types'
import { evaluate, getPath, matchesQuery, numeric, setPath } from './declarative-query'

const selectedEntities = (
  update: EntityUpdate,
  host: DeclarativeHost,
  collection: 'territories' | 'factions',
  scope?: EventScope<unknown>,
) => {
  let selected = host.collections[collection].filter(
    (entity) => !update.where || matchesQuery(entity, update.where, { host, entity, scope }),
  )
  if (update.select?.$sort) {
    const fields = Object.entries(update.select.$sort)
    selected = [...selected].sort((left, right) => {
      for (const [field, direction] of fields) {
        const a = getPath(left, field) as number | string
        const b = getPath(right, field) as number | string
        if (a === b) continue
        const comparison = a < b ? -1 : 1
        return direction === 'desc' ? -comparison : comparison
      }
      return 0
    })
  }
  if (update.select?.$sample) {
    const random = host.random ?? Math.random
    const shuffled = [...selected]
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1))
      ;[shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]]
    }
    const sample = update.select.$sample
    const raw = sample.count ?? selected.length * (sample.fraction ?? 1)
    const count = sample.round === 'down' ? Math.floor(raw) : Math.ceil(raw)
    selected = shuffled.slice(0, Math.max(0, count))
  }
  if (update.select?.$limit != null) selected = selected.slice(0, update.select.$limit)
  return selected
}

export const applyThen = (then: DeclarativeThen | undefined, host: DeclarativeHost, scope?: EventScope<unknown>) => {
  if (!then) return
  const changed = new Set<'variables' | 'territories' | 'factions' | 'turn' | 'game' | 'result' | 'cards'>()

  for (const [path, expression] of Object.entries(then.variables ?? {})) {
    const value = evaluate(expression, { host, scope })
    host.setVariable?.(path, value)
    if (!host.setVariable) setPath(host.root.variables as Record<string, unknown>, path, value)
    changed.add('variables')
  }

  for (const collection of ['territories', 'factions'] as const) {
    for (const update of then[collection] ?? []) {
      const selected = selectedEntities(update, host, collection, scope)
      const patches = selected.map((entity, index) => ({
        entity,
        values: Object.fromEntries(
          Object.entries(update.set).map(([field, expression]) => [
            field,
            evaluate(expression, { host, entity, selection: { index, count: selected.length }, scope }),
          ]),
        ),
      }))
      for (const patch of patches)
        for (const [field, value] of Object.entries(patch.values))
          host.setEntity(collection, patch.entity, field, value)
      if (patches.length) changed.add(collection)
    }
  }

  for (const rootName of ['turn', 'game', 'result'] as const) {
    for (const [field, expression] of Object.entries(then[rootName] ?? {})) {
      const value = evaluate(expression, { host, scope })
      host.setRoot?.(rootName, field, value)
      if (!host.setRoot) setPath(host.root[rootName] as Record<string, unknown>, field, value)
      changed.add(rootName)
    }
  }

  for (const card of then.cards ?? []) {
    const faction = String(evaluate(card.faction, { host, scope }))
    const count = numeric(evaluate(card.count ?? 1, { host, scope }))
    host.drawCards?.(faction, count)
    changed.add('cards')
  }
  for (const log of then.logs ?? []) {
    const key = String(evaluate(log.key, { host, scope }))
    const factionValue = evaluate(log.faction ?? null, { host, scope })
    const vars = Object.fromEntries(
      Object.entries(log.vars ?? {}).map(([name, expression]) => [name, evaluate(expression, { host, scope })]),
    )
    host.writeLog?.(
      key,
      factionValue == null ? null : String(factionValue),
      vars,
      evaluate(log.event ?? false, { host, scope }) === true,
    )
  }
  for (const battle of then.battles ?? []) {
    const repeat = numeric(evaluate(battle.repeat ?? 1, { host, scope }))
    for (let n = 0; n < repeat; n++) {
      const choose = (selection: typeof battle.attacker | typeof battle.target) => {
        const candidates = host.collections[selection.from].filter(
          (entity) => !selection.where || matchesQuery(entity, selection.where, { host, entity, scope }),
        )
        if (!candidates.length) return undefined
        const index =
          selection.select === '$sample' ? Math.floor((host.random ?? Math.random)() * candidates.length) : 0
        return getPath(candidates[index], selection.field ?? (selection.from === 'factions' ? 'name' : 'slug'))
      }
      const attacker = choose(battle.attacker)
      const target = choose(battle.target)
      if (attacker != null && target != null)
        host.resolveBattle?.(String(attacker), String(target), numeric(evaluate(battle.troops, { host, scope })))
    }
  }
  host.afterApply?.(changed)
}
