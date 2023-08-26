export type EventPresentation = 'card' | 'log'

export interface EventDate {
  year: number
  /** Human month number, January = 1. */
  month: number
  day?: number
}

export interface EventCalendar {
  starts: EventDate
  monthsPerRound: number
}

export type EventData = Readonly<Record<string, unknown>>

export type EventRetry =
  { mode: 'once' } | { mode: 'attempts'; attempts: number } | { mode: 'window'; rounds: number } | { mode: 'forever' }

export interface EventScope<Context> {
  event: EventDefinition<Context>
  map: EventMap<Context>
  currentRound: number
  scheduledRound: number
  attempts: number
  elapsedRounds: number
  onSchedule: boolean
  hasFired: (eventId: string) => boolean
  value: <Value = unknown>(key: string) => Value
}

export interface EventCondition<Context> {
  /** Stable identifier used by diagnostics and generated diagrams. */
  id: string
  /** Human-readable rule shown in admin tooling. */
  label: string
  test: (context: Context, scope: EventScope<Context>) => boolean
  /** Events whose outcomes make this condition possible. */
  requires?: string[]
}

export interface EventOutcome<Context> {
  /** Stable identifier used by diagnostics and generated diagrams. */
  id: string
  /** Human-readable result shown in admin tooling. */
  label: string
  apply: (context: Context, scope: EventScope<Context>) => void
  /** Named pieces of campaign state changed by this outcome. */
  writes?: string[]
}

export interface EventChoiceSpec<Context> {
  key: string
  label: string
  outcomes?: EventOutcome<Context>[]
}

export interface EventSpec<Context> {
  id: string
  title: string
  /** Use either a raw round or a calendar date resolved by the engine. */
  round?: number
  at?: EventDate
  /** Campaign-owned parameters colocated with the event that consumes them. */
  data?: EventData
  actor?: string
  presentation?: EventPresentation
  category?: 'political' | 'battle' | 'treaty' | 'supply' | 'deadline'
  conditions?: EventCondition<Context>[]
  retry?: EventRetry
  outcomes?: EventOutcome<Context>[]
  choices?: EventChoiceSpec<Context>[]
  vars?: (context: Context, scope: EventScope<Context>) => Record<string, string | number>
}

export interface EventDefinition<Context> extends Omit<EventSpec<Context>, 'round'> {
  round: number
}

export interface EventMap<Context> {
  id: string
  title: string
  description?: string
  calendar?: EventCalendar
  /** Reads the active round when callers do not provide one explicitly. */
  currentRound?: (context: Context) => number
  events: EventDefinition<Context>[]
}

export const eventDate = (year: number, month: number, day?: number): EventDate => ({ year, month, day })

export const roundForDate = (calendar: EventCalendar, at: EventDate) => {
  const start = calendar.starts.year * 12 + calendar.starts.month - 1
  const target = at.year * 12 + at.month - 1
  return Math.ceil((target - start) / calendar.monthsPerRound) + 1
}

export const dateForRound = (calendar: EventCalendar, round: number): EventDate => {
  const monthIndex = calendar.starts.year * 12 + calendar.starts.month - 1 + (round - 1) * calendar.monthsPerRound
  return { year: Math.floor(monthIndex / 12), month: (monthIndex % 12) + 1 }
}

export const condition = <Context>(
  id: string,
  label: string,
  test: (context: Context, scope: EventScope<Context>) => boolean,
  requires?: string[],
): EventCondition<Context> => ({ id, label, test, requires })

export const outcome = <Context>(
  id: string,
  label: string,
  apply: (context: Context, scope: EventScope<Context>) => void,
  writes?: string[],
): EventOutcome<Context> => ({ id, label, apply, writes })

export const choice = <Context>(
  key: string,
  label: string,
  outcomes: EventOutcome<Context>[] = [],
): EventChoiceSpec<Context> => ({ key, label, outcomes })

export const retry = {
  once: { mode: 'once' } as EventRetry,
  forever: { mode: 'forever' } as EventRetry,
  attempts: (attempts: number): EventRetry => ({ mode: 'attempts', attempts }),
  window: (rounds: number): EventRetry => ({ mode: 'window', rounds }),
}

const applyOutcomes = <Context>(
  outcomes: EventOutcome<Context>[] | undefined,
  context: Context,
  scope: EventScope<Context>,
) => {
  for (const eventOutcome of outcomes ?? []) eventOutcome.apply(context, scope)
}

const attemptsFor = (retryPolicy: EventRetry | undefined) => {
  if (!retryPolicy || retryPolicy.mode === 'once') return undefined
  if (retryPolicy.mode === 'forever') return Number.POSITIVE_INFINITY
  return retryPolicy.mode === 'attempts' ? retryPolicy.attempts : retryPolicy.rounds
}

const valueFrom = <Context, Value>(event: EventDefinition<Context>, key: string): Value => {
  if (!event.data || !(key in event.data)) throw new Error(`${event.id} has no data value named ${key}`)
  return event.data[key] as Value
}

export const eventScopeFor = <Context>(
  map: EventMap<Context>,
  event: EventDefinition<Context>,
  currentRound: number,
  attempts = 0,
  hasFired: (eventId: string) => boolean = () => false,
): EventScope<Context> => ({
  event,
  map,
  currentRound,
  scheduledRound: event.round,
  attempts,
  elapsedRounds: currentRound - event.round,
  onSchedule: currentRound === event.round,
  hasFired,
  value: <Value = unknown>(key: string) => valueFrom<Context, Value>(event, key),
})

export const defineEventMap = <Context>(
  meta: Omit<EventMap<Context>, 'events'>,
  specs: EventSpec<Context>[],
): EventMap<Context> => {
  const ids = new Set<string>()
  const conditionIds = new Set<string>()
  const outcomeIds = new Set<string>()
  const events = specs.map((spec) => {
    if (ids.has(spec.id)) throw new Error(`Duplicate event id: ${spec.id}`)
    ids.add(spec.id)
    if ((spec.round == null) === (spec.at == null))
      throw new Error(`${spec.id} must declare exactly one of round or at`)
    const round = spec.round ?? (meta.calendar && spec.at ? roundForDate(meta.calendar, spec.at) : NaN)
    if (!Number.isFinite(round) || round < 1) throw new Error(`Invalid schedule for ${spec.id}`)
    if (spec.retry && !spec.conditions?.length) throw new Error(`${spec.id} retries without a condition`)
    for (const gate of spec.conditions ?? []) {
      if (conditionIds.has(gate.id)) throw new Error(`Duplicate condition id: ${gate.id}`)
      conditionIds.add(gate.id)
    }
    for (const eventOutcome of [
      ...(spec.outcomes ?? []),
      ...(spec.choices ?? []).flatMap((eventChoice) => eventChoice.outcomes ?? []),
    ]) {
      if (outcomeIds.has(eventOutcome.id)) throw new Error(`Duplicate outcome id: ${eventOutcome.id}`)
      outcomeIds.add(eventOutcome.id)
    }

    const runtime: EventDefinition<Context> = {
      ...spec,
      round,
    }
    return runtime
  })

  for (const event of events)
    for (const gate of event.conditions ?? [])
      for (const required of gate.requires ?? [])
        if (!ids.has(required)) throw new Error(`${event.id} depends on unknown event ${required}`)

  const map = { ...meta, events }
  return map
}

export const eventById = <Context>(map: EventMap<Context>, eventId: string) => {
  const event = map.events.find((candidate) => candidate.id === eventId)
  if (!event) throw new Error(`Unknown event: ${eventId}`)
  return event
}

export class EventEngine<Context> {
  constructor(readonly map: EventMap<Context>) {}

  get events() {
    return this.map.events
  }
  event(eventId: string) {
    return eventById(this.map, eventId)
  }
  round(eventId: string) {
    return this.event(eventId).round
  }
  value<Value = unknown>(eventId: string, key: string) {
    return valueFrom<Context, Value>(this.event(eventId), key)
  }
  conditionsPass(
    eventId: string,
    context: Context,
    currentRound = this.map.currentRound?.(context) ?? this.round(eventId),
    attempts = 0,
    hasFired: (eventId: string) => boolean = () => false,
  ) {
    const event = this.event(eventId)
    if (event.retry?.mode === 'window' && currentRound > event.round + event.retry.rounds - 1) return false
    const scope = eventScopeFor(this.map, event, currentRound, attempts, hasFired)
    return (event.conditions ?? []).every((eventCondition) => eventCondition.test(context, scope))
  }
  variables(
    event: EventDefinition<Context>,
    context: Context,
    currentRound = this.map.currentRound?.(context) ?? event.round,
    attempts = 0,
  ) {
    return event.vars?.(context, eventScopeFor(this.map, event, currentRound, attempts))
  }
  dispatch(runtime: EventRuntime<Context>) {
    return dispatchEventMap(this.map, runtime)
  }
  resolveChoice(
    event: EventDefinition<Context>,
    choiceKey: string,
    context: Context,
    currentRound = this.map.currentRound?.(context) ?? event.round,
  ) {
    return resolveEventChoice(this.map, event, choiceKey, context, currentRound)
  }
}

export const defineEventEngine = <Context>(meta: Omit<EventMap<Context>, 'events'>, specs: EventSpec<Context>[]) =>
  new EventEngine(defineEventMap(meta, specs))

export interface EventRuntime<Context> {
  context: Context
  round: number
  isHumanTurn: boolean
  hasPendingDecision: () => boolean
  hasFired: (eventId: string) => boolean
  markFired: (eventId: string) => void
  gateLastChecked: (eventId: string) => number | undefined
  setGateLastChecked: (eventId: string, round: number) => void
  gateAttempts: (eventId: string) => number
  setGateAttempts: (eventId: string, attempts: number) => void
  actorEliminated: (actor: string) => boolean
  announce: (event: EventDefinition<Context>, scope: EventScope<Context>) => void
  queueCard: (eventId: string) => void
  setPendingDecision: (event: EventDefinition<Context>) => void
}

/** Dispatch one event pass. All campaign-specific behavior enters via Context. */
export const dispatchEventMap = <Context>(map: EventMap<Context>, runtime: EventRuntime<Context>) => {
  for (const event of map.events) {
    if (runtime.hasPendingDecision()) return
    if (runtime.round < event.round || runtime.hasFired(event.id)) continue

    const attempts = runtime.gateAttempts(event.id)
    const scope = eventScopeFor(map, event, runtime.round, attempts, runtime.hasFired)
    if (event.retry?.mode === 'window' && runtime.round > event.round + event.retry.rounds - 1) {
      runtime.markFired(event.id)
      continue
    }

    if (event.conditions?.length && !event.conditions.every((gate) => gate.test(runtime.context, scope))) {
      if (runtime.gateLastChecked(event.id) !== runtime.round) {
        runtime.setGateLastChecked(event.id, runtime.round)
        const tried = runtime.gateAttempts(event.id) + 1
        runtime.setGateAttempts(event.id, tried)
        const limit = attemptsFor(event.retry) ?? 1
        const windowEnded = event.retry?.mode === 'window' && runtime.round >= event.round + event.retry.rounds - 1
        if (tried >= limit || windowEnded) runtime.markFired(event.id)
      }
      continue
    }

    if (event.actor && runtime.actorEliminated(event.actor)) {
      runtime.markFired(event.id)
      continue
    }
    if (event.choices?.length && !runtime.isHumanTurn) continue

    runtime.markFired(event.id)
    runtime.announce(event, scope)
    if (event.choices?.length) {
      runtime.setPendingDecision(event)
      return
    }
    applyOutcomes(event.outcomes, runtime.context, scope)
    if ((event.presentation ?? 'card') === 'card') runtime.queueCard(event.id)
  }
}

export const resolveEventChoice = <Context>(
  map: EventMap<Context>,
  event: EventDefinition<Context>,
  choiceKey: string,
  context: Context,
  currentRound = event.round,
) => {
  const selected = event.choices?.find((eventChoice) => eventChoice.key === choiceKey)
  if (!selected) return false
  applyOutcomes(selected.outcomes, context, eventScopeFor(map, event, currentRound))
  return true
}

const mermaidId = (prefix: string, value: string) =>
  `${prefix}_${value.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^([0-9])/, '_$1')}`
export const eventMermaidNodeId = (eventId: string) => mermaidId('event', eventId)
const mermaidLabel = (value: string) => value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/\n/g, ' ')

export interface MermaidOptions {
  direction?: 'LR' | 'TB'
  selectedEvent?: string
  eventIds?: string[]
  /** Events whose internal gates and effects should be expanded. Omit to expand every included event. */
  expandedEventIds?: string[]
  includeChronology?: boolean
}

export interface MermaidEventRecord {
  id: string
  title: string
  round: number
  at?: EventDate
  retry?: EventRetry
  conditions?: Array<Pick<EventCondition<unknown>, 'id' | 'label' | 'requires'>>
  outcomes?: Array<Pick<EventOutcome<unknown>, 'id' | 'label'>>
  choices?: Array<{
    key: string
    label: string
    outcomes?: Array<Pick<EventOutcome<unknown>, 'id' | 'label'>>
  }>
}

export interface MermaidEventCollection {
  id: string
  events: MermaidEventRecord[]
}

const MERMAID_MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
const mermaidDate = (at: EventDate) => `${at.day ? `${at.day} ` : ''}${MERMAID_MONTHS[at.month - 1]} ${at.year}`
/** Generate Mermaid source from event metadata without requiring executable callbacks. */
export const eventRecordsToMermaid = (map: MermaidEventCollection, options: MermaidOptions = {}) => {
  const included = options.eventIds ? new Set(options.eventIds) : null
  const events = map.events.filter((event) => !included || included.has(event.id))
  const lines = [`flowchart ${options.direction ?? 'LR'}`]
  const known = new Set(events.map((event) => event.id))
  const retryNodes: string[] = []
  const missNodes: string[] = []

  for (const event of events) {
    const eventNode = eventMermaidNodeId(event.id)
    const schedule = `Round ${event.round}${event.at ? ` · ${mermaidDate(event.at)}` : ''}`
    lines.push(`  ${eventNode}["${mermaidLabel(`${event.title}<br/>${schedule}`)}"]`)
    const gates = event.conditions ?? []
    const gateNodesForEvent = gates.map((gate) => mermaidId('gate', `${event.id}_${gate.id}`))
    gates.forEach((gate, index) => {
      const gateNode = gateNodesForEvent[index]
      lines.push(`  ${gateNode}{"${mermaidLabel(gate.label)}"}`)
      lines.push(`  ${gateNode} -->|yes| ${gateNodesForEvent[index + 1] ?? eventNode}`)
      for (const dependency of gate.requires ?? [])
        if (known.has(dependency)) lines.push(`  ${eventMermaidNodeId(dependency)} -. enables .-> ${gateNode}`)
    })
    if (gateNodesForEvent.length) {
      const firstGate = gateNodesForEvent[0]
      if (event.retry?.mode === 'forever') {
        gateNodesForEvent.forEach((gateNode) => lines.push(`  ${gateNode} -->|no · next round| ${firstGate}`))
      } else if (event.retry?.mode === 'attempts' || event.retry?.mode === 'window') {
        const retryNode = mermaidId('retry', event.id)
        const missNode = mermaidId('miss', event.id)
        const retryLabel =
          event.retry.mode === 'attempts'
            ? `Fewer than ${event.retry.attempts} checks used?`
            : `Still inside ${event.retry.rounds}-round window?`
        lines.push(`  ${retryNode}{"${mermaidLabel(retryLabel)}"}`)
        lines.push(`  ${missNode}(["Event expires"])`)
        gateNodesForEvent.forEach((gateNode) => lines.push(`  ${gateNode} -->|no| ${retryNode}`))
        lines.push(`  ${retryNode} -->|yes · next round| ${firstGate}`)
        lines.push(`  ${retryNode} -->|no| ${missNode}`)
        retryNodes.push(retryNode)
        missNodes.push(missNode)
      } else {
        const missNode = mermaidId('miss', event.id)
        lines.push(`  ${missNode}(["Event does not fire"])`)
        gateNodesForEvent.forEach((gateNode) => lines.push(`  ${gateNode} -->|no| ${missNode}`))
        missNodes.push(missNode)
      }
    }
    for (const eventOutcome of event.outcomes ?? []) {
      const outcomeNode = mermaidId('outcome', `${event.id}_${eventOutcome.id}`)
      lines.push(`  ${outcomeNode}(["${mermaidLabel(eventOutcome.label)}"])`)
      lines.push(`  ${eventNode} --> ${outcomeNode}`)
    }
    for (const eventChoice of event.choices ?? []) {
      const choiceNode = mermaidId('choice', `${event.id}_${eventChoice.key}`)
      lines.push(`  ${choiceNode}(["${mermaidLabel(eventChoice.label)}"])`)
      lines.push(`  ${eventNode} -->|choice| ${choiceNode}`)
      for (const eventOutcome of eventChoice.outcomes ?? []) {
        const outcomeNode = mermaidId('outcome', `${event.id}_${eventChoice.key}_${eventOutcome.id}`)
        lines.push(`  ${outcomeNode}(["${mermaidLabel(eventOutcome.label)}"])`)
        lines.push(`  ${choiceNode} --> ${outcomeNode}`)
      }
    }
  }

  if (options.includeChronology) {
    const ordered = [...events].sort((a, b) => a.round - b.round || map.events.indexOf(a) - map.events.indexOf(b))
    for (let i = 1; i < ordered.length; i++)
      lines.push(`  ${eventMermaidNodeId(ordered[i - 1].id)} ~~~ ${eventMermaidNodeId(ordered[i].id)}`)
  }

  lines.push('  classDef event fill:#e8dfc2,stroke:#23384a,color:#152633,stroke-width:1.5px')
  lines.push('  classDef gate fill:#f5f0df,stroke:#b6713b,color:#3b2c20,stroke-dasharray:4 3')
  lines.push('  classDef outcome fill:#dce8df,stroke:#4e765e,color:#173525')
  lines.push('  classDef choice fill:#e5def0,stroke:#70558d,color:#30203e')
  lines.push('  classDef miss fill:#ece9df,stroke:#8b8577,color:#575247,stroke-dasharray:2 2')
  lines.push('  classDef selected fill:#d2a84c,stroke:#152633,color:#152633,stroke-width:4px')
  if (events.length) lines.push(`  class ${events.map((event) => eventMermaidNodeId(event.id)).join(',')} event`)
  const gateNodes = events.flatMap((event) =>
    (event.conditions ?? []).map((gate) => mermaidId('gate', `${event.id}_${gate.id}`)),
  )
  if (gateNodes.length) lines.push(`  class ${gateNodes.join(',')} gate`)
  if (retryNodes.length) lines.push(`  class ${retryNodes.join(',')} gate`)
  if (missNodes.length) lines.push(`  class ${missNodes.join(',')} miss`)
  const outcomeNodes = events.flatMap((event) => [
    ...(event.outcomes ?? []).map((eventOutcome) => mermaidId('outcome', `${event.id}_${eventOutcome.id}`)),
    ...(event.choices ?? []).flatMap((eventChoice) =>
      (eventChoice.outcomes ?? []).map((eventOutcome) =>
        mermaidId('outcome', `${event.id}_${eventChoice.key}_${eventOutcome.id}`),
      ),
    ),
  ])
  if (outcomeNodes.length) lines.push(`  class ${outcomeNodes.join(',')} outcome`)
  const choiceNodes = events.flatMap((event) =>
    (event.choices ?? []).map((eventChoice) => mermaidId('choice', `${event.id}_${eventChoice.key}`)),
  )
  if (choiceNodes.length) lines.push(`  class ${choiceNodes.join(',')} choice`)
  if (options.selectedEvent && known.has(options.selectedEvent))
    lines.push(`  class ${eventMermaidNodeId(options.selectedEvent)} selected`)
  return lines.join('\n')
}

/** Generate Mermaid source directly from the same map the runtime executes. */
export const eventMapToMermaid = <Context>(map: EventMap<Context>, options: MermaidOptions = {}) =>
  eventRecordsToMermaid(map, options)
