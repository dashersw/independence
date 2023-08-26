import type { EventCalendar, EventData, EventDate, EventEngine, EventPresentation, EventRetry } from './event-map'

export type JsonScalar = string | number | boolean | null
export type JsonValue = JsonScalar | JsonValue[] | { [key: string]: JsonValue }
export type JsonObject = { [key: string]: JsonValue }
export type Query = JsonObject

export interface EntityUpdate {
  id?: string
  where?: Query
  select?: {
    $sample?: { fraction?: number; count?: number; round?: 'up' | 'down' }
    $sort?: Record<string, 'asc' | 'desc'>
    $limit?: number
  }
  set: JsonObject
}

export interface DeclarativeThen {
  variables?: JsonObject
  territories?: EntityUpdate[]
  factions?: EntityUpdate[]
  turn?: JsonObject
  game?: JsonObject
  result?: JsonObject
  cards?: Array<{ faction: JsonValue; count?: JsonValue }>
  logs?: Array<{ key: JsonValue; faction?: JsonValue; vars?: Record<string, JsonValue>; event?: JsonValue }>
  battles?: Array<{
    repeat?: JsonValue
    attacker: { from: 'factions'; where?: Query; select?: '$sample'; field?: string }
    target: { from: 'territories'; where?: Query; select?: '$sample'; field?: string }
    troops: JsonValue
  }>
}

export interface DeclarativeChoice {
  key: string
  label: string
  then?: DeclarativeThen
}

export interface DeclarativeEvent {
  id: string
  title: string
  at: EventDate
  actor?: string
  category?: 'political' | 'battle' | 'treaty' | 'supply' | 'deadline'
  presentation?: EventPresentation
  data?: EventData
  when?: Query[]
  gate?: { id: string; label: string; requires?: string[] }
  retry?: EventRetry
  then?: DeclarativeThen
  outcome?: { id: string; label: string; writes?: string[] }
  choices?: DeclarativeChoice[]
  vars?: Record<string, JsonValue>
}

export interface DeclarativeRule {
  id: string
  on: string
  priority?: number
  when?: Query[]
  then: DeclarativeThen
}

export interface DeclarativeCampaign {
  $schema: 'campaign-map.v1'
  id: string
  version: number
  title: string
  description?: string
  calendar: EventCalendar
  groups?: Record<string, JsonValue[]>
  variables?: JsonObject
  events: DeclarativeEvent[]
  rules?: DeclarativeRule[]
}

export interface DeclarativeEntity {
  $source?: unknown
  [key: string]: unknown
}

export interface DeclarativeHost {
  root: Record<string, unknown>
  groups?: Record<string, JsonValue[]>
  collections: { territories: DeclarativeEntity[]; factions: DeclarativeEntity[] }
  setVariable?: (path: string, value: unknown) => void
  setEntity: (collection: 'territories' | 'factions', entity: DeclarativeEntity, field: string, value: unknown) => void
  setRoot?: (root: 'turn' | 'game' | 'result', field: string, value: unknown) => void
  drawCards?: (faction: string, count: number) => void
  writeLog?: (key: string, faction: string | null, vars: Record<string, unknown>, event: boolean) => void
  resolveBattle?: (attacker: string, target: string, troops: number) => void
  random?: () => number
  afterApply?: (
    changed: ReadonlySet<'variables' | 'territories' | 'factions' | 'turn' | 'game' | 'result' | 'cards'>,
  ) => void
}

export interface DeclarativeEventEngine<Context> extends EventEngine<Context> {
  document: DeclarativeCampaign
  host(context: Context): DeclarativeHost
  initialVariables(): Record<string, unknown>
  variable<Value = unknown>(context: Context, path: string): Value
  setVariable(context: Context, path: string, value: unknown): void
  select(context: Context, collection: 'territories' | 'factions', where?: Query): DeclarativeEntity[]
  apply(eventId: string, context: Context): void
  group<Value extends JsonValue = JsonValue>(name: string): Value[]
  fireRules(on: string, context: Context, extraRoot?: Record<string, unknown>): DeclarativeHost
}
