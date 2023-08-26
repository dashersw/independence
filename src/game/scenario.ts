import Ajv from 'ajv'
import type { Alliance, Card } from './faction'
import scenarioDocument from './scenario.json'
import scenarioSchema from './scenario-schema.json'

export interface DiplomacyPermission {
  attacker?: string
  attackerAlliance?: Alliance
  defender?: string
  defenderAlliance?: Alliance
}

export interface ScenarioDefinition {
  $schema: 'game-scenario.v1'
  humanFaction: string
  alliances: Record<string, Alliance>
  diplomacy: {
    grudgesOverride: boolean
    permissions: DiplomacyPermission[]
  }
  movement: {
    navies: string[]
    seaLanes: Array<{ ports: [string, string]; at: [number, number] }>
    crossingRounds: number
    crossingCapacity: number
    occupiedTerritoryGroup: string
    occupiedMovementFactor: number
  }
  combat: {
    attacksPerTurn: number
    advanceDepth: {
      homeland: number
      foreign: number
    }
  }
  economy: {
    minimumReinforcements: number
    territoriesPerReinforcement: number
    defaultFortifyLimit: number
    fortifyLimitByFaction: Record<string, number>
    cardTypes: Card[]
    tradeBonuses: number[]
    tradeIncrement: number
  }
  presentation: {
    governmentFaction: string
    governmentSeats: string[]
  }
  retaliationWindow: number
}

const validate = new Ajv({ allErrors: true, strict: true }).compile(scenarioSchema)

export const loadScenario = (document: unknown): ScenarioDefinition => {
  if (!validate(document)) {
    const detail = validate.errors?.map((error) => `${error.instancePath || '/'} ${error.message}`).join('; ')
    throw new Error(`Invalid scenario document: ${detail}`)
  }
  return document as unknown as ScenarioDefinition
}

export const SCENARIO = loadScenario(scenarioDocument)
