import Ajv from 'ajv'
import campaignSchema from './campaign-schema.json'

const validateSchema = new Ajv({ allErrors: true, strict: true, allowUnionTypes: true }).compile(campaignSchema)
const OPERATORS = new Set([
  '$add',
  '$and',
  '$count',
  '$divide',
  '$eq',
  '$exists',
  '$group',
  '$gt',
  '$gte',
  '$if',
  '$in',
  '$limit',
  '$lt',
  '$lte',
  '$max',
  '$min',
  '$mod',
  '$multiply',
  '$ne',
  '$nin',
  '$none',
  '$not',
  '$or',
  '$round',
  '$sample',
  '$some',
  '$sort',
  '$subtract',
  '$every',
  '$literal',
])

const object = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)

const semanticValidation = (document: Record<string, unknown>) => {
  const groups = object(document.groups) ? new Set(Object.keys(document.groups)) : new Set<string>()
  const events = document.events as Array<Record<string, unknown>>
  const rules = (document.rules ?? []) as Array<Record<string, unknown>>
  const eventIds = new Set<string>()
  const ruleIds = new Set<string>()
  for (const event of events) {
    const id = String(event.id)
    if (eventIds.has(id)) throw new Error(`Campaign document contains duplicate event id ${id}`)
    eventIds.add(id)
    const choices = (event.choices ?? []) as Array<Record<string, unknown>>
    const choiceKeys = new Set<string>()
    for (const choice of choices) {
      const key = String(choice.key)
      if (choiceKeys.has(key)) throw new Error(`Campaign event ${id} contains duplicate choice key ${key}`)
      choiceKeys.add(key)
    }
  }
  for (const rule of rules) {
    const id = String(rule.id)
    if (ruleIds.has(id)) throw new Error(`Campaign document contains duplicate rule id ${id}`)
    ruleIds.add(id)
  }
  for (const event of events) {
    const gate = object(event.gate) ? event.gate : null
    for (const required of (gate?.requires ?? []) as string[])
      if (!eventIds.has(required)) throw new Error(`Campaign event ${event.id} requires unknown event ${required}`)
  }
  const visit = (value: unknown, path: string): void => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, `${path}/${index}`))
      return
    }
    if (!object(value)) return
    for (const [key, item] of Object.entries(value)) {
      if (key === '$group' && (typeof item !== 'string' || !groups.has(item)))
        throw new Error(`Campaign document references unknown group ${String(item)} at ${path}`)
      if (key.startsWith('$') && key !== '$schema' && !OPERATORS.has(key))
        throw new Error(`Campaign document uses unsupported operator ${key} at ${path}`)
      visit(item, `${path}/${key}`)
    }
  }
  visit(document, '')
}

export const validateCampaignDocument = (document: unknown) => {
  if (!object(document)) throw new Error('Campaign document must be a JSON object')
  if (document.$schema !== 'campaign-map.v1') throw new Error('Unsupported campaign document schema')
  if (!Array.isArray(document.events)) throw new Error('Campaign document requires an events array')
  if (!validateSchema(document)) {
    const details = validateSchema.errors?.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')
    throw new Error(`Invalid campaign document: ${details}`)
  }
  semanticValidation(document)
}
