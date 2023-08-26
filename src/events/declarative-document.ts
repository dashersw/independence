import { roundForDate, type MermaidEventRecord } from './event-map'
import { validateCampaignDocument } from './campaign-validation'
import type { DeclarativeCampaign } from './declarative-types'

/** Validate an imported JSON document at the engine boundary. */
export const loadDeclarativeCampaign = (document: unknown): DeclarativeCampaign => {
  validateCampaignDocument(document)
  return document as unknown as DeclarativeCampaign
}

/** Project the JSON declaration into the metadata consumed by graph tooling. */
export const declarativeCampaignEventRecords = (document: DeclarativeCampaign): MermaidEventRecord[] =>
  document.events.map((event) => ({
    id: event.id,
    title: event.title,
    round: roundForDate(document.calendar, event.at),
    at: event.at,
    retry: event.retry,
    conditions: event.when?.length
      ? [
          {
            id: event.gate?.id ?? `${event.id}.when`,
            label: event.gate?.label ?? 'Declared conditions are satisfied',
            requires: event.gate?.requires,
          },
        ]
      : undefined,
    outcomes: event.then
      ? [{ id: event.outcome?.id ?? `${event.id}.then`, label: event.outcome?.label ?? 'Apply declared changes' }]
      : undefined,
    choices: event.choices?.map((eventChoice) => ({
      key: eventChoice.key,
      label: eventChoice.label,
      outcomes: eventChoice.then ? [{ id: `${event.id}.${eventChoice.key}`, label: eventChoice.label }] : undefined,
    })),
  }))
