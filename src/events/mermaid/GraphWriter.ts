import { eventMermaidNodeId } from '../event-map'
import { graphLabel } from './format'
import type { GraphNodeKind } from './model'

const DEFINITIONS: Record<GraphNodeKind, string> = {
  event: 'fill:#e8dfc2,stroke:#23384a,color:#152633,stroke-width:1.5px',
  outcome: 'fill:#dce8df,stroke:#4e765e,color:#173525',
  choice: 'fill:#e5def0,stroke:#70558d,color:#30203e',
  input: 'fill:#e7eef1,stroke:#496f82,color:#244a5d,stroke-dasharray:2 2',
  write: 'fill:#e3eee5,stroke:#3f7654,color:#214b30,stroke-width:2px',
  effect: 'fill:#efe8d6,stroke:#8a6e2d,color:#4d3b17',
  rule: 'fill:#f0e0d8,stroke:#a45632,color:#5c2c1c,stroke-width:1.5px',
  formula: 'fill:#e8e1f0,stroke:#70558d,color:#342447,stroke-width:1.5px',
  value: 'fill:#edf2f3,stroke:#6c8793,color:#294855',
  condition: 'fill:#f7eddc,stroke:#b6713b,color:#4a3020,stroke-dasharray:3 2',
  miss: 'fill:#ece9df,stroke:#8b8577,color:#575247,stroke-dasharray:2 2',
}

export class GraphWriter {
  private readonly lines: string[]
  private readonly nodes = new Map<GraphNodeKind, Set<string>>()

  constructor(direction: string) {
    this.lines = [`flowchart ${direction}`]
  }

  line(source: string) {
    this.lines.push(source)
  }

  addNode(id: string, kind: GraphNodeKind, labelLines: Array<string | number | undefined>) {
    const label = graphLabel(labelLines)
    if (kind === 'condition') this.lines.push(`  ${id}{"${label}"}`)
    else if (kind === 'outcome' || kind === 'choice' || kind === 'formula' || kind === 'miss')
      this.lines.push(`  ${id}(["${label}"])`)
    else if (kind === 'rule') this.lines.push(`  ${id}{{"${label}"}}`)
    else this.lines.push(`  ${id}["${label}"]`)
    if (!this.nodes.has(kind)) this.nodes.set(kind, new Set())
    this.nodes.get(kind)!.add(id)
  }

  render(selectedEvent?: string, selectedKnown = false) {
    for (const [kind, definition] of Object.entries(DEFINITIONS) as Array<[GraphNodeKind, string]>) {
      this.lines.push(`  classDef ${kind} ${definition}`)
      const ids = [...(this.nodes.get(kind) ?? [])]
      if (ids.length) this.lines.push(`  class ${ids.join(',')} ${kind}`)
    }
    this.lines.push('  classDef selected fill:#d2a84c,stroke:#152633,color:#152633,stroke-width:4px')
    if (selectedEvent && selectedKnown) this.lines.push(`  class ${eventMermaidNodeId(selectedEvent)} selected`)
    return this.lines.join('\n')
  }
}
