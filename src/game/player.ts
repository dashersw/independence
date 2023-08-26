import Faction from './faction'

export interface LeadershipSuccession {
  variable: string
  name: string
}

export default class Player {
  name: string
  faction: Faction
  isHuman: boolean
  successions: LeadershipSuccession[]

  constructor(name: string, faction: Faction, isHuman: boolean, successions: LeadershipSuccession[] = []) {
    this.name = name
    this.faction = faction
    this.isHuman = isHuman
    this.successions = successions
  }
}
