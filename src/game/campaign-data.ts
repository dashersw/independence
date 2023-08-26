import factionData from './factions.json'
import campaignDocument from './campaign-events.json'

export const NATIONAL_PACT: string[] = campaignDocument.groups.nationalPact
export const ASSEMBLY_SEATS: string[] = campaignDocument.groups.assemblySeats
export const CAMPAIGN_GROUPS: Record<string, string[]> = campaignDocument.groups

export const campaignGroup = (name: string): string[] => {
  const group = CAMPAIGN_GROUPS[name]
  if (!group) throw new Error(`Unknown campaign territory group: ${name}`)
  return group
}

export const STARTING_TERRITORIES: Record<string, number> = Object.fromEntries(
  factionData.factions.map((faction) => [faction.name, faction.territories.length]),
)

export const HOMELAND_OWNER: Record<string, string> = Object.fromEntries(
  factionData.factions.flatMap((faction) => faction.territories.map((territory) => [territory.slug, faction.name])),
)
for (const slug of NATIONAL_PACT) HOMELAND_OWNER[slug] = 'Turkey'
