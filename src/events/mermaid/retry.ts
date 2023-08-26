import type { DeclarativeEvent } from '../declarative-types'
import { GraphWriter } from './GraphWriter'
import { graphId } from './format'
import type { ConditionFlow } from './model'

export const compileRetryFlow = (writer: GraphWriter, event: DeclarativeEvent, flow: ConditionFlow) => {
  const retryPolicy = event.retry
  const waitNode = graphId('effect', event.id, 'retry-wait')
  const connectFailureToWait = () => {
    writer.addNode(waitNode, 'effect', ['Wait until next turn'])
    flow.fail.forEach((exit) => writer.line(`  ${exit.id} -->|${exit.label}| ${waitNode}`))
  }
  if (retryPolicy?.mode === 'forever') {
    connectFailureToWait()
    writer.line(`  ${waitNode} -->|retry| ${flow.entryId}`)
    return
  }

  const missNode = graphId('miss', event.id, 'gate-failed')
  if (!retryPolicy || retryPolicy.mode === 'once') {
    writer.addNode(missNode, 'miss', ['Event does not fire'])
    flow.fail.forEach((exit) => writer.line(`  ${exit.id} -->|${exit.label}| ${missNode}`))
    return
  }

  const retryNode = graphId('condition', event.id, 'retry-available')
  const retryLabel =
    retryPolicy.mode === 'attempts'
      ? `Fewer than ${retryPolicy.attempts} checks used?`
      : `Still inside ${retryPolicy.rounds}-round retry window?`
  connectFailureToWait()
  writer.addNode(retryNode, 'condition', [retryLabel])
  writer.addNode(missNode, 'miss', ['Event expires'])
  writer.line(`  ${waitNode} --> ${retryNode}`)
  writer.line(`  ${retryNode} -->|yes · retry| ${flow.entryId}`)
  writer.line(`  ${retryNode} -->|no · expire| ${missNode}`)
}
