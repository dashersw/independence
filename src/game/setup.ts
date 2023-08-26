import Faction from './faction'
import Player from './player'
import Territory from './territory'
import factionData from './factions.json'
import territoriesData from './territories.json'
import playerData from './db.json'
import { SCENARIO } from './scenario'

export interface GameSetup {
  factions: Faction[]
  players: Player[]
  territories: Territory[]
  bySlug: Record<string, Territory>
}

const validateScenarioReferences = (factions: Faction[], bySlug: Record<string, Territory>) => {
  const factionNames = new Set(factions.map((faction) => faction.name))
  const territoryNames = new Set(Object.keys(bySlug))
  for (const name of Object.keys(SCENARIO.alliances))
    if (!factionNames.has(name)) throw new Error(`Scenario assigns an alliance to unknown faction ${name}`)
  for (const name of SCENARIO.movement.navies)
    if (!factionNames.has(name)) throw new Error(`Scenario assigns a navy to unknown faction ${name}`)
  for (const lane of SCENARIO.movement.seaLanes)
    for (const slug of lane.ports)
      if (!territoryNames.has(slug)) throw new Error(`Scenario sea lane references unknown territory ${slug}`)
  for (const slug of SCENARIO.presentation.governmentSeats)
    if (!territoryNames.has(slug)) throw new Error(`Scenario government seat references unknown territory ${slug}`)
  if (!factionNames.has(SCENARIO.presentation.governmentFaction))
    throw new Error(`Scenario presentation references unknown faction ${SCENARIO.presentation.governmentFaction}`)
  for (const permission of SCENARIO.diplomacy.permissions) {
    if (permission.attacker && !factionNames.has(permission.attacker))
      throw new Error(`Scenario diplomacy references unknown attacker ${permission.attacker}`)
    if (permission.defender && !factionNames.has(permission.defender))
      throw new Error(`Scenario diplomacy references unknown defender ${permission.defender}`)
  }
}

/** Builds the mutable board model from static setup documents. */
export const createGameSetup = (): GameSetup => {
  const factions = factionData.factions.map((faction) => {
    const alliance = SCENARIO.alliances[faction.name]
    if (!alliance) throw new Error(`Scenario does not assign an alliance to ${faction.name}`)
    return new Faction(faction.name, faction.color, alliance)
  })
  const nameBySlug = Object.fromEntries(
    territoriesData.territories.map((territory) => [territory.slug, territory.name]),
  )
  const bySlug: Record<string, Territory> = {}
  factionData.factions.forEach((faction, index) => {
    faction.territories.forEach(({ slug, troops }) => {
      if (bySlug[slug]) throw new Error(`Territory ${slug} has more than one setup owner`)
      const territory = new Territory(slug, nameBySlug[slug] ?? slug, factions[index])
      territory.troops = troops
      factions[index].territories.push(territory)
      bySlug[slug] = territory
    })
  })
  const territories = Object.values(bySlug)
  territoriesData.territories.forEach((record) => {
    const territory = bySlug[record.slug]
    if (!territory) throw new Error(`Territory ${record.slug} has no setup owner`)
    record.adjacentTerritories.forEach((slug) => {
      const adjacent = bySlug[slug]
      if (!adjacent) throw new Error(`Territory ${record.slug} references unknown adjacent territory ${slug}`)
      if (!territory.adjacent.includes(adjacent)) territory.adjacent.push(adjacent)
    })
  })
  validateScenarioReferences(factions, bySlug)
  const players = playerData.players.map((record) => {
    const faction = factions.find((candidate) => candidate.name === record.faction)
    if (!faction) throw new Error(`Player ${record.name} references unknown faction ${record.faction}`)
    return new Player(record.name, faction, record.type === 'Human')
  })
  const humans = players.filter((player) => player.isHuman)
  if (humans.length !== 1 || humans[0].faction.name !== SCENARIO.humanFaction)
    throw new Error(`Scenario requires exactly one human player for ${SCENARIO.humanFaction}`)
  return { factions, players, territories, bySlug }
}
