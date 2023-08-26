import { t, tCase, tDateLoc, tFaction, tTerritory } from '../i18n'
import type { LogEntry, LogValue } from './types'

export const logFaction = (name: string): LogValue => ({ kind: 'faction', name })
export const logTerritory = (
  slug: string,
  fallback: string,
  grammaticalCase?: 'dat' | 'acc' | 'loc' | 'abl',
): LogValue => ({
  kind: 'territory',
  slug,
  fallback,
  grammaticalCase,
})
export const logDate = (value: string): LogValue => ({ kind: 'date', value })

const resolveValue = (value: LogValue): string | number => {
  if (typeof value === 'string' || typeof value === 'number') return value
  if (value.kind === 'faction') return tFaction(value.name)
  if (value.kind === 'date') return tDateLoc(value.value)
  const territory = tTerritory(value.slug, value.fallback)
  return value.grammaticalCase ? tCase(territory, value.grammaticalCase) : territory
}

export const renderLogEntry = (entry: LogEntry) =>
  t(entry.key, Object.fromEntries(Object.entries(entry.vars).map(([name, value]) => [name, resolveValue(value)])))
