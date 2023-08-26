import Territory from './territory'

export type Card = 'infantry' | 'cavalry' | 'cannon'
export type Alliance = 'turkey' | 'entente' | 'neutral'

export default class Faction {
  name: string
  color: string
  territories: Territory[]
  alliance: Alliance
  // factions that attacked us — fair game for retaliation regardless of alliance
  grudges: Set<string>
  // set when someone attacks this faction after it settled out of the war:
  // the peace is void, it mobilizes and fights on despite the treaty events
  peaceBroken: boolean
  hand: Card[]

  constructor(name: string, color: string, alliance: Alliance) {
    this.name = name
    this.color = color
    this.territories = []
    this.alliance = alliance
    this.grudges = new Set()
    this.peaceBroken = false
    this.hand = []
  }

  get eliminated() {
    return this.territories.length === 0
  }

  get troopTotal() {
    return this.territories.reduce((sum, t) => sum + t.troops, 0)
  }
}
