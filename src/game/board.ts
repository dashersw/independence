import type Game from './game'
import type Faction from './faction'
import type Territory from './territory'

export interface BoardSnapshot {
  territories: Record<
    string,
    {
      faction: string
      troops: number
      quietTurns: number
      entrenched: number
      heldSince: number
      raidedOn: number
    }
  >
}

/** Owns every mutation that changes the board or its ownership indexes. */
export class BoardSystem {
  constructor(readonly game: Game) {}

  changeControl(territory: Territory, newFaction: Faction, round = 1) {
    if (territory.faction === newFaction) return
    const oldFaction = territory.faction
    const index = oldFaction.territories.indexOf(territory)
    if (index >= 0) oldFaction.territories.splice(index, 1)
    territory.faction = newFaction
    if (!newFaction.territories.includes(territory)) newFaction.territories.push(territory)
    territory.quietTurns = 0
    territory.entrenched = 0
    territory.heldSince = round
  }

  addTroops(territory: Territory, amount: number) {
    territory.troops = Math.max(0, territory.troops + Math.trunc(amount))
    return territory.troops
  }

  moveTroops(from: Territory, to: Territory, amount: number) {
    const moved = Math.min(Math.max(0, Math.trunc(amount)), from.troops)
    from.troops -= moved
    to.troops += moved
    return moved
  }

  snapshot(): BoardSnapshot {
    return {
      territories: Object.fromEntries(
        this.game.territories.map((territory) => [
          territory.slug,
          {
            faction: territory.faction.name,
            troops: territory.troops,
            quietTurns: territory.quietTurns,
            entrenched: territory.entrenched,
            heldSince: territory.heldSince,
            raidedOn: territory.raidedOn,
          },
        ]),
      ),
    }
  }

  restore(snapshot: BoardSnapshot) {
    const factions = new Map(this.game.factions.map((faction) => [faction.name, faction]))
    this.game.factions.forEach((faction) => (faction.territories = []))
    for (const territory of this.game.territories) {
      const record = snapshot.territories[territory.slug]
      const faction = record && factions.get(record.faction)
      if (!record || !faction) throw new Error(`Board snapshot is missing territory ${territory.slug}`)
      territory.faction = faction
      territory.troops = record.troops
      territory.quietTurns = record.quietTurns
      territory.entrenched = record.entrenched
      territory.heldSince = record.heldSince
      territory.raidedOn = record.raidedOn
      faction.territories.push(territory)
    }
  }

  simulate<T>(mutate: () => void, evaluate: () => T): T {
    const snapshot = this.snapshot()
    try {
      mutate()
      return evaluate()
    } finally {
      this.restore(snapshot)
    }
  }
}
