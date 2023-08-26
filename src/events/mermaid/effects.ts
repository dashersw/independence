import type { DeclarativeCampaign, DeclarativeEvent, DeclarativeThen } from '../declarative-types'
import { graphThenDetails } from './analysis'
import { compileConditionTree } from './conditions'
import { compileExpression } from './expressions'
import { graphId, graphInlineExpression, isObject } from './format'
import { GraphWriter } from './GraphWriter'
import type { GraphAssignment } from './model'

export const compileThen = (
  writer: GraphWriter,
  document: DeclarativeCampaign,
  event: DeclarativeEvent,
  parentId: string,
  scope: string,
  then: DeclarativeThen | undefined,
) => {
  const writeIds: string[] = []
  type SelfScale = { factor: number; divisor?: number; rounding?: 'up' | 'down' }
  type BoundedChange = {
    direction: 'increase' | 'decrease'
    amount: number
    bound: number
  }
  const finiteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)
  const conciseNumber = (value: number) => String(Number(value.toFixed(6)))
  const boundedChange = (assignment: GraphAssignment): BoundedChange | null => {
    if (!isObject(assignment.value) || Object.keys(assignment.value).length !== 1) return null
    const self = `$${assignment.path}`
    const matchBound = (operands: unknown, direction: BoundedChange['direction']): BoundedChange | null => {
      if (!Array.isArray(operands) || operands.length !== 2) return null
      const boundIndex = operands.findIndex(finiteNumber)
      if (boundIndex < 0) return null
      const bound = operands[boundIndex] as number
      const change = operands[boundIndex === 0 ? 1 : 0]
      if (!isObject(change) || Object.keys(change).length !== 1) return null
      if (direction === 'increase') {
        if (!Array.isArray(change.$add) || change.$add.length !== 2) return null
        const amount = change.$add[0] === self ? change.$add[1] : change.$add[1] === self ? change.$add[0] : undefined
        return finiteNumber(amount) && amount > 0 ? { direction, amount, bound } : null
      }
      if (!Array.isArray(change.$subtract) || change.$subtract.length !== 2 || change.$subtract[0] !== self) return null
      const amount = change.$subtract[1]
      return finiteNumber(amount) && amount > 0 ? { direction, amount, bound } : null
    }
    if ('$min' in assignment.value) return matchBound(assignment.value.$min, 'increase')
    if ('$max' in assignment.value) return matchBound(assignment.value.$max, 'decrease')
    return null
  }
  const assignmentNoun = (path: string, amount: number) => {
    const field = path.split('.').at(-1) ?? path
    if (field === 'entrenched') return 'entrenchment'
    if (field === 'troops') return amount === 1 ? 'troop' : 'troops'
    return field.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
  }
  const selfScale = (value: unknown, self: string): SelfScale | null => {
    if (!isObject(value) || Object.keys(value).length !== 1) return null
    if (Array.isArray(value.$round) && value.$round.length === 2) {
      const [operand, mode] = value.$round as unknown[]
      const scale = selfScale(operand, self)
      if (!scale || (mode !== 'up' && mode !== 'down')) return null
      return { ...scale, rounding: mode }
    }
    if (Array.isArray(value.$multiply) && value.$multiply.length === 2) {
      const factors = value.$multiply as unknown[]
      const factor = factors[0] === self ? factors[1] : factors[1] === self ? factors[0] : undefined
      return finiteNumber(factor) ? { factor } : null
    }
    if (Array.isArray(value.$divide) && value.$divide.length === 2) {
      const [dividend, divisor] = value.$divide as unknown[]
      return dividend === self && finiteNumber(divisor) && divisor !== 0 ? { factor: 1 / divisor, divisor } : null
    }
    return null
  }
  const scaleLines = (path: string, scale: SelfScale) => {
    const operation =
      scale.factor === 0.5
        ? `Halve ${path}`
        : scale.factor === 2
          ? `Double ${path}`
          : scale.divisor
            ? `Divide ${path} by ${conciseNumber(scale.divisor)}`
            : `Multiply ${path} by ${conciseNumber(scale.factor)}`
    return scale.rounding ? [operation, scale.rounding === 'down' ? 'Round down' : 'Round up'] : [operation]
  }
  const withMinimum = (lines: string[], minimum: number) => {
    const qualifier = `minimum ${conciseNumber(minimum)}`
    if (lines.length > 1) lines[lines.length - 1] = `${lines.at(-1)} · ${qualifier}`
    else writer.line(`Minimum ${conciseNumber(minimum)}`)
    return lines
  }
  const compactAssignment = (assignment: GraphAssignment) => {
    if (!isObject(assignment.value) || Object.keys(assignment.value).length !== 1) return null
    const self = `$${assignment.path}`
    const addOperands = assignment.value.$add
    if (Array.isArray(addOperands) && addOperands.length === 2) {
      const value = addOperands[0] === self ? addOperands[1] : addOperands[1] === self ? addOperands[0] : undefined
      if (typeof value === 'number' && Number.isFinite(value)) return [`Add ${value} ${assignment.path}`]
    }

    const subtractOperands = assignment.value.$subtract
    if (Array.isArray(subtractOperands) && subtractOperands.length === 2 && subtractOperands[0] === self) {
      if (finiteNumber(subtractOperands[1]))
        return [`Subtract ${conciseNumber(subtractOperands[1])} ${assignment.path}`]
      const removed = selfScale(subtractOperands[1], self)
      if (removed) {
        const remaining: SelfScale = {
          factor: 1 - removed.factor,
          rounding: removed.rounding === 'down' ? 'up' : removed.rounding === 'up' ? 'down' : undefined,
        }
        return scaleLines(assignment.path, remaining)
      }
    }

    const directScale = selfScale(assignment.value, self)
    if (directScale) return scaleLines(assignment.path, directScale)

    const maxOperands = assignment.value.$max
    if (!Array.isArray(maxOperands) || maxOperands.length !== 2) return null
    const minimumIndex = maxOperands.findIndex(finiteNumber)
    if (minimumIndex < 0) return null
    const minimum = maxOperands[minimumIndex] as number
    const limited = maxOperands[minimumIndex === 0 ? 1 : 0]
    const limitedScale = selfScale(limited, self)
    if (limitedScale) return withMinimum(scaleLines(assignment.path, limitedScale), minimum)
    if (isObject(limited) && Array.isArray(limited.$subtract)) {
      const operands = limited.$subtract as unknown[]
      if (operands.length === 2 && operands[0] === self && finiteNumber(operands[1]))
        return withMinimum([`Subtract ${conciseNumber(operands[1])} ${assignment.path}`], minimum)
    }
    return null
  }
  for (const detail of graphThenDetails(then)) {
    const id = graphId(detail.kind, event.id, scope, detail.id)
    const collapseSingleAssignment =
      detail.kind === 'write' && detail.assignments?.length === 1 && detail.lines.length === 1
    if (!collapseSingleAssignment) {
      writer.addNode(id, detail.kind, detail.lines)
      if (detail.where) {
        const whereScope = `${scope}-${detail.id}-where`
        const entityLabel = detail.entityLabel ?? (detail.collection === 'factions' ? 'Faction' : 'Territory')
        const conditionFlow = compileConditionTree(
          writer,
          document,
          event,
          whereScope,
          [detail.where],
          whereScope,
          entityLabel,
        )
        writer.line(`  ${parentId} --> ${conditionFlow.entryId}`)
        conditionFlow.pass.forEach((exit) => writer.line(`  ${exit.id} -->|${exit.label}| ${id}`))
        const missNode = graphId('miss', event.id, whereScope, 'not-updated')
        const entity = detail.entityLabel ?? (detail.collection === 'factions' ? 'Faction' : 'Territory')
        writer.addNode(missNode, 'miss', [`${entity} not updated`])
        conditionFlow.fail.forEach((exit) => writer.line(`  ${exit.id} -->|${exit.label}| ${missNode}`))
      } else {
        writer.line(`  ${parentId} --> ${id}`)
      }
    }
    const assignmentParent = collapseSingleAssignment ? parentId : id
    for (const [index, assignment] of (detail.assignments ?? []).entries()) {
      const bounded = boundedChange(assignment)
      if (bounded) {
        const self = `$${assignment.path}`
        const conditionNode = graphId('condition', event.id, scope, detail.id, assignment.path, String(index), 'bound')
        const assignmentNode = graphId('write', event.id, scope, detail.id, assignment.path, String(index))
        const skipNode = graphId('miss', event.id, scope, detail.id, assignment.path, String(index), 'skip')
        const comparison = bounded.direction === 'increase' ? '<' : '>'
        const verb = bounded.direction === 'increase' ? 'Add' : 'Subtract'
        const actionLines = [
          `${verb} ${conciseNumber(bounded.amount)} ${assignmentNoun(assignment.path, bounded.amount)}`,
        ]
        if (bounded.amount !== 1)
          actionLines.push(
            `${bounded.direction === 'increase' ? 'Maximum' : 'Minimum'} ${conciseNumber(bounded.bound)}`,
          )
        writer.addNode(conditionNode, 'condition', [`${self} ${comparison} ${conciseNumber(bounded.bound)}?`])
        writer.addNode(assignmentNode, 'write', actionLines)
        writer.addNode(skipNode, 'miss', ['Skip'])
        writer.line(`  ${assignmentParent} --> ${conditionNode}`)
        writer.line(`  ${conditionNode} -->|yes| ${assignmentNode}`)
        writer.line(`  ${conditionNode} -->|no| ${skipNode}`)
        if (detail.kind === 'write') writeIds.push(assignmentNode, skipNode)
        continue
      }
      const assignmentNode = graphId('write', event.id, scope, detail.id, assignment.path, String(index))
      const computed = isObject(assignment.value) && Object.keys(assignment.value).some((key) => key.startsWith('$'))
      const compactLabel = compactAssignment(assignment)
      const ownershipLabel =
        detail.collection === 'territories' && assignment.path === 'heldBy' && typeof assignment.value === 'string'
          ? `${detail.entityLabel ?? 'Territory'} moves to ${assignment.value}`
          : null
      writer.addNode(
        assignmentNode,
        'write',
        ownershipLabel
          ? [ownershipLabel]
          : compactLabel
            ? compactLabel
            : computed
              ? ['Set', assignment.path]
              : [assignment.path, `← ${graphInlineExpression(assignment.value)}`],
      )
      writer.line(`  ${assignmentParent} --> ${assignmentNode}`)
      if (computed && !compactLabel)
        compileExpression(writer, event, scope, assignmentNode, assignment.value, `${detail.id}-${index}`)
      if (detail.kind === 'write') writeIds.push(assignmentNode)
    }
    if (detail.kind === 'write' && !detail.assignments?.length) writeIds.push(id)
  }
  return writeIds
}
