import type { DeclarativeCampaign } from './declarative-types'
import { eventMermaidNodeId, roundForDate, type MermaidOptions } from './event-map'
import { graphRulesFor } from './mermaid/analysis'
import { compileConditionTree } from './mermaid/conditions'
import { compileThen } from './mermaid/effects'
import { GRAPH_MONTHS, graphId, graphValue } from './mermaid/format'
import { GraphWriter } from './mermaid/GraphWriter'
import { compileRetryFlow } from './mermaid/retry'

/** Generate a complete executable-flow graph directly from a loaded campaign JSON document. */
export const declarativeCampaignToMermaid = (document: DeclarativeCampaign, options: MermaidOptions = {}) => {
  const included = options.eventIds ? new Set(options.eventIds) : null
  const events = document.events.filter((event) => !included || included.has(event.id))
  const known = new Set(events.map((event) => event.id))
  const expanded = options.expandedEventIds ? new Set(options.expandedEventIds) : null
  const writer = new GraphWriter(options.direction ?? 'LR')

  for (const event of events) {
    const eventNode = eventMermaidNodeId(event.id)
    const round = roundForDate(document.calendar, event.at)
    const date = `${event.at.day ? `${event.at.day} ` : ''}${GRAPH_MONTHS[event.at.month - 1]} ${event.at.year}`
    writer.addNode(eventNode, 'event', [
      event.title,
      `Round ${round} · ${date}`,
      `${event.actor ?? 'System'} · ${event.category ?? 'uncategorized'}`,
    ])

    // Focus maps keep prerequisite events as causal landmarks. Expanding their
    // own gates here makes those gates look like requirements of the selected
    // event, even though they belong to a separate earlier event.
    if (expanded && !expanded.has(event.id)) continue

    if (event.data && Object.keys(event.data).length) {
      const inputNode = graphId('input', event.id, 'parameters')
      writer.addNode(inputNode, 'input', [
        'Parameters',
        ...Object.entries(event.data).map(([key, value]) => `${key} ← ${graphValue(value)}`),
      ])
      writer.line(`  ${inputNode} -. parameters .-> ${eventNode}`)
    }
    if (event.vars && Object.keys(event.vars).length) {
      const inputNode = graphId('input', event.id, 'bindings')
      writer.addNode(inputNode, 'input', [
        'Card bindings',
        ...Object.entries(event.vars).map(([key, value]) => `${key} ← ${graphValue(value)}`),
      ])
      writer.line(`  ${inputNode} -. bindings .-> ${eventNode}`)
    }

    if (event.when?.length) {
      const conditionFlow = compileConditionTree(writer, document, event, 'when', event.when, 'when')
      conditionFlow.pass.forEach((exit) => writer.line(`  ${exit.id} -->|${exit.label}| ${eventNode}`))
      compileRetryFlow(writer, event, conditionFlow)
      for (const dependency of event.gate?.requires ?? [])
        if (known.has(dependency))
          writer.line(`  ${eventMermaidNodeId(dependency)} -. enables .-> ${conditionFlow.entryId}`)
    }

    const writeIds: string[] = []
    if (event.then) {
      const outcomeNode = graphId('outcome', event.id, event.outcome?.id ?? 'then')
      writer.addNode(outcomeNode, 'outcome', [event.outcome?.label ?? 'Apply declared changes'])
      writer.line(`  ${eventNode} --> ${outcomeNode}`)
      writeIds.push(...compileThen(writer, document, event, outcomeNode, 'then', event.then))
    }
    for (const eventChoice of event.choices ?? []) {
      const choiceNode = graphId('choice', event.id, eventChoice.key)
      writer.addNode(choiceNode, 'choice', [eventChoice.label, `Choice: ${eventChoice.key}`])
      writer.line(`  ${eventNode} -->|choice| ${choiceNode}`)
      writeIds.push(...compileThen(writer, document, event, choiceNode, `choice-${eventChoice.key}`, eventChoice.then))
    }

    if (!options.selectedEvent || options.selectedEvent === event.id) {
      for (const rule of graphRulesFor(document, event)) {
        const ruleNode = graphId('rule', event.id, rule.id)
        writer.addNode(ruleNode, 'rule', [
          rule.id,
          `On: ${rule.on}${rule.priority == null ? '' : ` · priority ${rule.priority}`}`,
        ])
        if (rule.when?.length) {
          const scope = `rule-${rule.id}`
          const conditionFlow = compileConditionTree(writer, document, event, scope, rule.when, `${scope}-when`)
          conditionFlow.pass.forEach((exit) => writer.line(`  ${exit.id} -->|${exit.label}| ${ruleNode}`))
          const missNode = graphId('miss', event.id, scope, 'not-applied')
          writer.addNode(missNode, 'miss', ['Rule does not apply'])
          conditionFlow.fail.forEach((exit) => writer.line(`  ${exit.id} -->|${exit.label}| ${missNode}`))
        }
        for (const sourceId of writeIds.length ? writeIds : [eventNode])
          writer.line(`  ${sourceId} -. affects .-> ${ruleNode}`)
        compileThen(writer, document, event, ruleNode, `rule-${rule.id}`, rule.then)
      }
    }
  }

  if (options.includeChronology) {
    const ordered = [...events].sort(
      (left, right) =>
        roundForDate(document.calendar, left.at) - roundForDate(document.calendar, right.at) ||
        document.events.indexOf(left) - document.events.indexOf(right),
    )
    for (let index = 1; index < ordered.length; index++)
      writer.line(`  ${eventMermaidNodeId(ordered[index - 1].id)} ~~~ ${eventMermaidNodeId(ordered[index].id)}`)
  }

  return writer.render(options.selectedEvent, !!options.selectedEvent && known.has(options.selectedEvent))
}
