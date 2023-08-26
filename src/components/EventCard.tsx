import React from 'react'
import { HistoricalEvent } from '../game/game'
import { t } from '../i18n'
import { FlagIcon } from './MapView'

export interface CardEntry {
  // the event's textKey — the body copy is looked up from it
  textKey: string
  faction: string
  // fill-ins for the body copy, if the event declares any
  vars?: Record<string, string | number>
}

interface EventCardProps {
  // several notices can land on one turn (Sakarya, Kars and the Ankara
  // Agreement all fall in autumn 1921) — they arrive as one card rather than a
  // stack to dismiss one by one
  entries: CardEntry[]
  // when present the card is a decision and cannot be dismissed without answering
  choices?: HistoricalEvent['choices']
  onDismiss: () => void
  onChoose: (key: string) => void
}

// Historical turning points arrive as a card over the map rather than a line in
// the log, so the player actually reads them. Decisions carry their options
// instead of a dismiss button.
const EventCard = ({ entries, choices, onDismiss, onChoose }: EventCardProps) => (
  <div className="overlay event-overlay">
    <div className="overlay-card event-card">
      {entries.map((e, i) => (
        <div className="event-entry" key={e.textKey + i}>
          {e.faction && <FlagIcon faction={e.faction} className="event-flag" />}
          <p className="event-text">{t(e.textKey, e.vars)}</p>
        </div>
      ))}
      {choices ? (
        <div className="event-choices">
          {choices.map((c, i) => (
            <button key={c.key} className={i === 0 ? 'primary' : ''} onClick={() => onChoose(c.key)}>
              {t(`card.choice.${c.key}`)}
            </button>
          ))}
        </div>
      ) : (
        <button className="primary" onClick={onDismiss}>
          {t('card.dismiss')}
        </button>
      )}
    </div>
  </div>
)

export default EventCard
