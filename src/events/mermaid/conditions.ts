import type { DeclarativeCampaign, DeclarativeEvent, Query } from '../declarative-types'
import { GraphWriter } from './GraphWriter'
import {
  graphConditionPath,
  graphEntityLabel,
  graphId,
  graphInlineExpression,
  graphQuery,
  isObject,
  QUERY_OPERATORS,
} from './format'
import type { ConditionExit, ConditionFlow } from './model'

export const compileConditionTree = (
  writer: GraphWriter,
  document: DeclarativeCampaign,
  event: DeclarativeEvent,
  scope: string,
  queries: Query[],
  trail: string,
  entityLabel?: string,
): ConditionFlow => {
  const singular = (path: string) =>
    path.endsWith('ies') ? `${path.slice(0, -3)}y` : path.endsWith('s') ? path.slice(0, -1) : path
  const connect = (exits: ConditionExit[], targetId: string) =>
    exits.forEach((exit) => writer.line(`  ${exit.id} -->|${exit.label}| ${targetId}`))
  const atom = (
    label: string | string[],
    atomTrail: string,
    passLabel: ConditionExit['label'] = 'yes',
  ): ConditionFlow => {
    const id = graphId('condition', event.id, scope, atomTrail)
    writer.addNode(id, 'condition', Array.isArray(label) ? label : [label])
    const failLabel = passLabel === 'yes' ? 'no' : 'yes'
    return { entryId: id, pass: [{ id, label: passLabel }], fail: [{ id, label: failLabel }] }
  }
  const all = (flows: ConditionFlow[]): ConditionFlow => {
    if (!flows.length) return atom('Always true?', `${trail}-always`)
    for (let index = 0; index < flows.length - 1; index++) connect(flows[index].pass, flows[index + 1].entryId)
    return {
      entryId: flows[0].entryId,
      pass: flows.at(-1)!.pass,
      fail: flows.flatMap((flow) => flow.fail),
    }
  }
  const any = (flows: ConditionFlow[]): ConditionFlow => {
    if (!flows.length) return atom('Always false?', `${trail}-never`)
    for (let index = 0; index < flows.length - 1; index++) connect(flows[index].fail, flows[index + 1].entryId)
    return {
      entryId: flows[0].entryId,
      pass: flows.flatMap((flow) => flow.pass),
      fail: flows.at(-1)!.fail,
    }
  }
  const quantifierSubject = (path: string) =>
    path === 'territories'
      ? 'Territory'
      : path === 'factions'
        ? 'Faction'
        : path === 'adjacent'
          ? 'Adjacent territory'
          : graphEntityLabel(singular(path))
  const expandedGroupMembers = (groupName: string) =>
    groupName === 'nationalPact'
      ? []
      : (document.groups?.[groupName] ?? [])
          .filter((member): member is string => typeof member === 'string')
          .map(graphEntityLabel)
  const groupLines = (subject: string, path: string, operator: string, operand: unknown) => {
    if (!isObject(operand) || !('$group' in operand)) return null
    const groupName = String(operand.$group)
    const members = expandedGroupMembers(groupName)
    const relation =
      path === 'heldBy'
        ? `${subject} ${operator === '$nin' ? 'is not held by' : 'is held by'} one of ${groupName}`
        : `${subject} ${operator === '$nin' ? 'is not' : 'is'} one of ${groupName}`
    return members.length ? [relation, `(${members.join(', ')})`] : [relation]
  }
  const predicateLines = (query: unknown, subject: string): string[] => {
    if (!isObject(query)) return [`${subject}: ${graphInlineExpression(query)}`]
    if ('$and' in query || '$or' in query) {
      const operator = '$and' in query ? '$and' : '$or'
      const clauses = Array.isArray(query[operator]) ? (query[operator] as unknown[]) : []
      return clauses.flatMap((clause, index) => {
        const rendered = predicateLines(clause, subject)
        return operator === '$or' && index > 0 ? [`OR — ${rendered[0]}`, ...rendered.slice(1)] : rendered
      })
    }
    if ('$not' in query) return ['Not:', ...predicateLines(query.$not, subject)]
    return Object.entries(query).flatMap(([path, expected]) => {
      if (isObject(expected)) {
        for (const operator of ['$some', '$none', '$every'] as const) {
          if (!(operator in expected)) continue
          const nestedSubject = quantifierSubject(path)
          const quantifier = operator === '$some' ? 'Any' : operator === '$none' ? 'No' : 'Every'
          return [
            `${quantifier} ${nestedSubject.toLowerCase()} matches:`,
            ...predicateLines(expected[operator], nestedSubject).map((line) => `↳ ${line}`),
          ]
        }
        const comparisons = Object.entries(expected).filter(([operator]) => operator.startsWith('$'))
        if (comparisons.length)
          return comparisons.flatMap(([operator, operand]) => {
            const grouped = groupLines(subject, path, operator, operand)
            if (grouped) return grouped
            if (path === 'troops' && typeof operand === 'number') {
              const troop = operand === 1 ? 'troop' : 'troops'
              const phrase: Record<string, string> = {
                $eq: `has exactly ${operand} ${troop}`,
                $ne: `does not have exactly ${operand} ${troop}`,
                $gt: `has more than ${operand} ${troop}`,
                $gte: `has at least ${operand} ${troop}`,
                $lt: `has fewer than ${operand} ${troop}`,
                $lte: `has at most ${operand} ${troop}`,
              }
              if (phrase[operator]) return [`${subject} ${phrase[operator]}`]
            }
            const label = QUERY_OPERATORS[operator] ?? operator.replace(/^\$/, '').toUpperCase()
            return [`${subject} · ${path} ${label} ${graphInlineExpression(operand)}`]
          })
      }
      if (path === 'heldBy' && typeof expected === 'string') return [`${subject} held by ${expected}`]
      if (path === 'slug' && typeof expected === 'string') return [`${subject} is ${graphEntityLabel(expected)}`]
      if (path === 'name' && typeof expected === 'string') return [`${subject} is ${expected}`]
      if (typeof expected === 'boolean') {
        const field = path.replace(/([a-z])([A-Z])/g, '$1 $2').toLowerCase()
        return [`${subject} ${expected ? 'is' : 'is not'} ${field}`]
      }
      return [`${subject} · ${path} = ${graphInlineExpression(expected)}`]
    })
  }
  const addField = (path: string, expected: unknown, fieldTrail: string): ConditionFlow => {
    const displayPath = graphConditionPath(path)
    const territoryOwnerPath = displayPath.match(/^territories\.([^.]+)\.heldBy$/)
    const heldSubject =
      displayPath === 'heldBy' && entityLabel
        ? entityLabel
        : territoryOwnerPath
          ? graphEntityLabel(territoryOwnerPath[1])
          : null
    const heldByLabel = heldSubject && typeof expected === 'string' ? `${heldSubject} held by ${expected}` : null
    if (isObject(expected)) {
      for (const [operator, quantifier] of [
        ['$some', 'ANY'],
        ['$none', 'NO'],
        ['$every', 'EVERY'],
      ] as const) {
        if (!(operator in expected)) continue
        if (isObject(expected[operator])) {
          const subject = quantifierSubject(displayPath)
          const details = predicateLines(expected[operator], subject)
          const withoutRepeatedSubject = details.map((line) => {
            if (!line.startsWith(`${subject} `)) return line
            const fragment = line.slice(subject.length + 1)
            return fragment ? `${fragment[0].toUpperCase()}${fragment.slice(1)}` : fragment
          })
          if (details.length === 1 && details[0].startsWith(`${subject} `)) {
            const predicate = details[0].slice(subject.length + 1)
            const lead =
              operator === '$some'
                ? `At least one ${subject.toLowerCase()}`
                : operator === '$none'
                  ? `No ${subject.toLowerCase()}`
                  : `Every ${subject.toLowerCase()}`
            return atom(`${lead} ${predicate}`, `${fieldTrail}-${operator}`)
          }
          return atom(
            [
              `${quantifier === 'ANY' ? 'At least one' : quantifier === 'NO' ? 'No' : 'Every'} ${subject.toLowerCase()} satisfies all:`,
              ...withoutRepeatedSubject,
            ],
            `${fieldTrail}-${operator}`,
          )
        }
        return atom(
          `${quantifier} ${singular(displayPath)} where ${graphQuery(expected[operator])}?`,
          `${fieldTrail}-${operator}`,
        )
      }

      const comparisons = Object.entries(expected).filter(([operator]) => operator.startsWith('$'))
      if (comparisons.length)
        return all(
          comparisons.map(([operator, operand], index) => {
            if (
              displayPath === 'slug' &&
              entityLabel &&
              isObject(operand) &&
              '$group' in operand &&
              (operator === '$in' || operator === '$nin')
            ) {
              const groupName = String(operand.$group)
              const members = expandedGroupMembers(groupName)
              const memberList = members.length ? ` (${members.join(', ')})` : ''
              return atom(
                `${entityLabel} ${operator === '$nin' ? 'is not' : 'is'} one of ${groupName}${memberList}`,
                `${fieldTrail}-${operator}-${index}`,
              )
            }
            if (heldSubject && typeof operand === 'string' && (operator === '$eq' || operator === '$ne'))
              return atom(
                `${heldSubject} ${operator === '$ne' ? 'not ' : ''}held by ${operand}`,
                `${fieldTrail}-${operator}-${index}`,
              )
            if ((operator === '$eq' || operator === '$ne') && typeof operand === 'boolean') {
              const passesWhenTrue = operator === '$eq' ? operand : !operand
              return atom(displayPath, `${fieldTrail}-${operator}-${index}`, passesWhenTrue ? 'yes' : 'no')
            }
            if (operator === '$exists' && typeof operand === 'boolean')
              return atom(`${displayPath} exists?`, `${fieldTrail}-${operator}-${index}`, operand ? 'yes' : 'no')
            if (entityLabel && displayPath === 'troops' && typeof operand === 'number') {
              const troop = operand === 1 ? 'troop' : 'troops'
              const phrase: Record<string, string> = {
                $eq: `has exactly ${operand} ${troop}`,
                $ne: `does not have exactly ${operand} ${troop}`,
                $gt: `has more than ${operand} ${troop}`,
                $gte: `has at least ${operand} ${troop}`,
                $lt: `has fewer than ${operand} ${troop}`,
                $lte: `has at most ${operand} ${troop}`,
              }
              if (phrase[operator])
                return atom(`${entityLabel} ${phrase[operator]}`, `${fieldTrail}-${operator}-${index}`)
            }
            const label = QUERY_OPERATORS[operator] ?? operator.replace(/^\$/, '').toUpperCase()
            return atom(
              `${displayPath} ${label} ${graphInlineExpression(operand)}`,
              `${fieldTrail}-${operator}-${index}`,
            )
          }),
        )
    }
    if (typeof expected === 'boolean') return atom(displayPath, `${fieldTrail}-equals`, expected ? 'yes' : 'no')
    if (heldByLabel) return atom(heldByLabel, `${fieldTrail}-equals`)
    if (entityLabel && displayPath === 'troops' && typeof expected === 'number')
      return atom(`${entityLabel} has ${expected} ${expected === 1 ? 'troop' : 'troops'}`, `${fieldTrail}-equals`)
    return atom(`${displayPath} = ${graphInlineExpression(expected)}`, `${fieldTrail}-equals`)
  }

  type ActionRole = { role: 'attacker' | 'defender'; value: string }
  const actionRole = (query: unknown): ActionRole | null => {
    if (!isObject(query) || Object.keys(query).length !== 1) return null
    const [path, expected] = Object.entries(query)[0]
    if (path !== 'action.attacker' && path !== 'action.defender') return null
    const value =
      isObject(expected) && Object.keys(expected).length === 1 && '$eq' in expected ? expected.$eq : expected
    if (typeof value !== 'string' || value.startsWith('$')) return null
    return { role: path === 'action.attacker' ? 'attacker' : 'defender', value }
  }
  const compactActionPair = (first: unknown, second: unknown) => {
    const roles = [actionRole(first), actionRole(second)]
    if (!roles[0] || !roles[1] || roles[0].role === roles[1].role) return null
    const attacker = roles.find((role) => role?.role === 'attacker')!
    const defender = roles.find((role) => role?.role === 'defender')!
    return `${attacker.value} attacks ${defender.value}`
  }
  const addSequence = (clauses: unknown[], sequenceTrail: string): ConditionFlow => {
    const flows: ConditionFlow[] = []
    for (let index = 0; index < clauses.length; index++) {
      const compactLabel = index + 1 < clauses.length ? compactActionPair(clauses[index], clauses[index + 1]) : null
      if (compactLabel) {
        flows.push(atom(compactLabel, `${sequenceTrail}-${index}-attack-pair`))
        index++
      } else {
        flows.push(addQuery(clauses[index], `${sequenceTrail}-${index}`))
      }
    }
    return all(flows)
  }
  const addQuery = (query: unknown, queryTrail: string): ConditionFlow => {
    if (!isObject(query)) return atom(graphInlineExpression(query), `${queryTrail}-value`)
    if ('$and' in query || '$or' in query) {
      const operator = '$and' in query ? '$and' : '$or'
      const clauses = Array.isArray(query[operator]) ? (query[operator] as unknown[]) : []
      if (operator === '$and') return addSequence(clauses, `${queryTrail}-${operator}`)
      return any(clauses.map((clause, index) => addQuery(clause, `${queryTrail}-${operator}-${index}`)))
    }
    if ('$not' in query) {
      const flow = addQuery(query.$not, `${queryTrail}-not`)
      return { entryId: flow.entryId, pass: flow.fail, fail: flow.pass }
    }
    return all(
      Object.entries(query).map(([path, expected], index) =>
        addField(path, expected, `${queryTrail}-${path}-${index}`),
      ),
    )
  }

  return addSequence(queries, trail)
}
