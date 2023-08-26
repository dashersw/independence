import type { Query } from '../declarative-types'

export type GraphNodeKind =
  'event' | 'outcome' | 'choice' | 'input' | 'write' | 'effect' | 'rule' | 'formula' | 'value' | 'condition' | 'miss'

export interface GraphAssignment {
  path: string
  value: unknown
}

export interface GraphDetail {
  id: string
  kind: 'write' | 'effect'
  lines: string[]
  collection?: 'territories' | 'factions'
  entityLabel?: string
  where?: Query
  assignments?: GraphAssignment[]
}

export interface ConditionExit {
  id: string
  label: 'yes' | 'no'
}

export interface ConditionFlow {
  entryId: string
  pass: ConditionExit[]
  fail: ConditionExit[]
}

export interface ExpressionFlow {
  entryId: string
  exits: string[]
}
