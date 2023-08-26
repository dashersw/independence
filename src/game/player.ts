import Faction from './faction'

export default class Player {
  name: string
  faction: Faction
  isHuman: boolean

  constructor(name: string, faction: Faction, isHuman: boolean) {
    this.name = name
    this.faction = faction
    this.isHuman = isHuman
  }
}
