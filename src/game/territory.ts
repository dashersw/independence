import type Faction from './faction'

export default class Territory {
  slug: string
  name: string
  faction: Faction
  troops: number
  adjacent: Territory[]
  // Occupation entrenchment (see Game.entrench): turns this province has gone
  // uncontested, and how many free garrison troops it has already drawn.
  quietTurns: number
  entrenched: number
  // the round this province last changed hands, so liberation can tell a
  // province snatched back immediately from one the enemy has settled into
  heldSince: number
  // the round this province last attacked the homeland from
  raidedOn: number

  constructor(slug: string, name: string, faction: Faction) {
    this.slug = slug
    this.name = name
    this.faction = faction
    this.troops = 0
    this.adjacent = []
    this.quietTurns = 0
    this.entrenched = 0
    this.heldSince = 1
    this.raidedOn = 0
  }

  isAdjacentTo(other: Territory) {
    return this.adjacent.includes(other)
  }
}
