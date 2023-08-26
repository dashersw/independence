import {
  choice,
  condition,
  defineEventEngine,
  eventScopeFor,
  outcome,
  type EventChoiceSpec,
  type EventScope,
} from './event-map'
import type { DeclarativeCampaign, DeclarativeEventEngine, DeclarativeHost } from './declarative-types'
import { applyThen } from './declarative-effects'
import { evaluate, getPath, matchesQuery, matchesWhen, numeric, setPath } from './declarative-query'

export const defineDeclarativeEventEngine = <Context>(
  document: DeclarativeCampaign,
  hostFactory: (context: Context, extraRoot?: Record<string, unknown>) => DeclarativeHost,
): DeclarativeEventEngine<Context> => {
  const rulesByTrigger = new Map<string, NonNullable<DeclarativeCampaign['rules']>>()
  for (const rule of document.rules ?? []) {
    const rules = rulesByTrigger.get(rule.on) ?? []
    rules.push(rule)
    rulesByTrigger.set(rule.on, rules)
  }
  for (const rules of rulesByTrigger.values()) rules.sort((left, right) => (left.priority ?? 0) - (right.priority ?? 0))

  const runtime = defineEventEngine<Context>(
    {
      id: document.id,
      title: document.title,
      description: document.description,
      calendar: document.calendar,
      currentRound: (context) => numeric(getPath(hostFactory(context).root, 'game.round')),
    },
    document.events.map((spec) => ({
      id: spec.id,
      title: spec.title,
      at: spec.at,
      actor: spec.actor,
      category: spec.category,
      presentation: spec.presentation,
      data: spec.data,
      retry: spec.retry,
      conditions: spec.when?.length
        ? [
            condition<Context>(
              spec.gate?.id ?? `${spec.id}.when`,
              spec.gate?.label ?? 'Declared conditions are satisfied',
              (context, scope) => matchesWhen(spec.when, hostFactory(context), scope as unknown as EventScope<unknown>),
              spec.gate?.requires,
            ),
          ]
        : undefined,
      outcomes: spec.then
        ? [
            outcome<Context>(
              spec.outcome?.id ?? `${spec.id}.then`,
              spec.outcome?.label ?? 'Apply declared changes',
              (context, scope) => applyThen(spec.then, hostFactory(context), scope as unknown as EventScope<unknown>),
              spec.outcome?.writes,
            ),
          ]
        : undefined,
      choices: spec.choices?.map((item) =>
        choice<Context>(
          item.key,
          item.label,
          item.then
            ? [
                outcome<Context>(`${spec.id}.${item.key}`, item.label, (context, scope) =>
                  applyThen(item.then, hostFactory(context), scope as unknown as EventScope<unknown>),
                ),
              ]
            : [],
        ),
      ) as EventChoiceSpec<Context>[] | undefined,
      vars: spec.vars
        ? (context, scope) =>
            Object.fromEntries(
              Object.entries(spec.vars!).map(([key, value]) => [
                key,
                evaluate(value, { host: hostFactory(context), scope: scope as unknown as EventScope<unknown> }),
              ]),
            ) as Record<string, string | number>
        : undefined,
    })),
  ) as DeclarativeEventEngine<Context>
  const engine = runtime
  engine.document = document
  engine.host = hostFactory
  engine.initialVariables = () => JSON.parse(JSON.stringify(document.variables ?? {})) as Record<string, unknown>
  engine.variable = (context, path) => getPath(hostFactory(context).root.variables, path) as never
  engine.setVariable = (context, path, value) => {
    const host = hostFactory(context)
    host.setVariable?.(path, value)
    if (!host.setVariable) setPath(host.root.variables as Record<string, unknown>, path, value)
  }
  engine.select = (context, collection, where) => {
    const host = hostFactory(context)
    return host.collections[collection].filter((entity) => !where || matchesQuery(entity, where, { host, entity }))
  }
  engine.group = (name) => (document.groups?.[name] ?? []) as never
  engine.apply = (eventId, context) => {
    const spec = document.events.find((candidate) => candidate.id === eventId)
    if (!spec) throw new Error(`Unknown event: ${eventId}`)
    const event = runtime.event(eventId)
    const currentRound = numeric(getPath(hostFactory(context).root, 'game.round'))
    applyThen(
      spec.then,
      hostFactory(context),
      eventScopeFor(runtime.map, event, currentRound) as unknown as EventScope<unknown>,
    )
  }
  engine.fireRules = (on, context, extraRoot = {}) => {
    const host = hostFactory(context, extraRoot)
    for (const rule of rulesByTrigger.get(on) ?? []) {
      if (matchesWhen(rule.when, host)) applyThen(rule.then, host)
    }
    return host
  }
  return engine
}
