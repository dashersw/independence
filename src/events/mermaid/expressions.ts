import type { DeclarativeEvent } from '../declarative-types'
import { GraphWriter } from './GraphWriter'
import { EXPRESSION_OPERATORS, graphId, graphInlineExpression, graphQuery, isObject } from './format'
import type { ExpressionFlow } from './model'

export const compileExpression = (
  writer: GraphWriter,
  event: DeclarativeEvent,
  scope: string,
  parentId: string,
  value: unknown,
  trail: string,
  edgeLabel?: string,
): ExpressionFlow => {
  const connect = (childId: string) => writer.line(`  ${parentId} -->${edgeLabel ? `|${edgeLabel}|` : ''} ${childId}`)
  if (!isObject(value) || Object.keys(value).length !== 1) {
    const valueNode = graphId('value', event.id, scope, trail)
    writer.addNode(valueNode, 'value', [graphInlineExpression(value)])
    connect(valueNode)
    return { entryId: valueNode, exits: [valueNode] }
  }
  if ('$if' in value && Array.isArray(value.$if)) {
    const [condition, whenTrue, whenFalse] = value.$if as unknown[]
    const conditionNode = graphId('condition', event.id, scope, trail, 'condition')
    writer.addNode(conditionNode, 'condition', [graphQuery(condition)])
    connect(conditionNode)
    const thenFlow = compileExpression(writer, event, scope, conditionNode, whenTrue, `${trail}-then`, 'then')
    const elseFlow = compileExpression(writer, event, scope, conditionNode, whenFalse, `${trail}-else`, 'else')
    return { entryId: conditionNode, exits: [...thenFlow.exits, ...elseFlow.exits] }
  }
  if ('$round' in value && Array.isArray(value.$round)) {
    const [operand, mode] = value.$round as unknown[]
    const formulaNode = graphId('formula', event.id, scope, trail, 'round')
    writer.addNode(formulaNode, 'formula', [`ROUND ${String(mode).toUpperCase()}`])
    connect(formulaNode)
    const operandFlow = compileExpression(writer, event, scope, formulaNode, operand, `${trail}-value`, 'value')
    return { entryId: formulaNode, exits: operandFlow.exits }
  }
  if ('$count' in value) {
    const formulaNode = graphId('formula', event.id, scope, trail, 'count')
    writer.addNode(formulaNode, 'formula', ['COUNT'])
    connect(formulaNode)
    const collectionFlow = compileExpression(
      writer,
      event,
      scope,
      formulaNode,
      value.$count,
      `${trail}-collection`,
      'collection',
    )
    return { entryId: formulaNode, exits: collectionFlow.exits }
  }
  for (const [operator, details] of Object.entries(EXPRESSION_OPERATORS)) {
    if (!(operator in value)) continue
    const operands = Array.isArray(value[operator]) ? (value[operator] as unknown[]) : [value[operator]]
    const formulaNode = graphId('formula', event.id, scope, trail, operator)
    writer.addNode(formulaNode, 'formula', [details.name])
    connect(formulaNode)
    const connectors: Record<string, string> = {
      $add: 'plus',
      $subtract: 'minus',
      $multiply: 'with',
      $divide: 'by',
      $mod: 'modulo',
      $min: 'and',
      $max: 'and',
    }
    let exits = [formulaNode]
    operands.forEach((operand, index) => {
      const label = index === 0 ? undefined : (connectors[operator] ?? 'with')
      const operandFlow = compileExpression(
        writer,
        event,
        scope,
        exits[0],
        operand,
        `${trail}-${operator}-${index}`,
        label,
      )
      for (const additionalExit of exits.slice(1))
        writer.line(`  ${additionalExit} -->${label ? `|${label}|` : ''} ${operandFlow.entryId}`)
      exits = operandFlow.exits
    })
    return { entryId: formulaNode, exits }
  }
  if ('$group' in value) {
    const valueNode = graphId('value', event.id, scope, trail, 'group')
    writer.addNode(valueNode, 'value', [`Group: ${String(value.$group)}`])
    connect(valueNode)
    return { entryId: valueNode, exits: [valueNode] }
  }
  const valueNode = graphId('value', event.id, scope, trail)
  writer.addNode(valueNode, 'value', [graphInlineExpression(value)])
  connect(valueNode)
  return { entryId: valueNode, exits: [valueNode] }
}
