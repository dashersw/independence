import type { RandomSource } from './random'

export type TerrainType = 'plain' | 'plateau' | 'hills' | 'mountains' | 'forest'

export interface TerrainCombatModifier {
  type: TerrainType
  attacker: number
  defender: number
}

const TERRAIN_MODIFIERS: Record<TerrainType, Omit<TerrainCombatModifier, 'type'>> = {
  plain: { attacker: 10, defender: 0 },
  plateau: { attacker: -3, defender: 3 },
  hills: { attacker: -5, defender: 5 },
  mountains: { attacker: -15, defender: 10 },
  forest: { attacker: -5, defender: 7 },
}

/**
 * Predominant relief of every playable map territory. The map intentionally
 * uses broad operational regions rather than modern administrative borders,
 * so each entry describes the terrain an army would meet across most of that
 * region, not the ground beneath the city bearing its name.
 */
export const TERRAIN_BY_TERRITORY: Record<string, TerrainType> = {
  edirne: 'plain',
  balikesir: 'hills',
  usak: 'plateau',
  eskisehir: 'plateau',
  kutahya: 'hills',
  ankara: 'plateau',
  konya: 'plain',
  sivas: 'hills',
  kastamonu: 'forest',
  samsun: 'forest',
  trabzon: 'mountains',
  erzurum: 'mountains',
  van: 'mountains',
  elazig: 'mountains',
  diyarbakir: 'plateau',
  salonica: 'plain',
  kozani: 'mountains',
  'western-thrace': 'plain',
  lesbos: 'hills',
  rhodes: 'mountains',
  izmir: 'plain',
  aydin: 'hills',
  sofia: 'mountains',
  plovdiv: 'plain',
  varna: 'hills',
  burgas: 'plain',
  gyumri: 'plateau',
  yerevan: 'plain',
  vanadzor: 'mountains',
  sevan: 'mountains',
  antalya: 'mountains',
  isparta: 'mountains',
  istanbul: 'hills',
  izmit: 'forest',
  gelibolu: 'hills',
  canakkale: 'hills',
  sakarya: 'forest',
  adana: 'plain',
  maras: 'mountains',
  hatay: 'mountains',
  aleppo: 'plain',
  mosul: 'hills',
  baghdad: 'plain',
  kars: 'plateau',
  igdir: 'plain',
}

export const terrainFor = (slug: string): TerrainCombatModifier => {
  const type = TERRAIN_BY_TERRITORY[slug]
  if (!type) throw new Error(`No terrain assigned to territory ${slug}`)
  return { type, ...TERRAIN_MODIFIERS[type] }
}

/**
 * A percentage is the chance for each die to shift by one face. This keeps
 * even 3–5% modifiers meaningful without multiplying casualties or adding
 * extra dice, both of which proved too swingy for the small Risk-style pools.
 */
export const applyTerrainRoll = (random: RandomSource, dice: number[], modifier: number): number[] => {
  if (modifier === 0) return [...dice]
  const direction = modifier > 0 ? 1 : -1
  const chance = Math.abs(modifier) / 100
  return dice
    .map((value) => {
      const shifts = random.next() >= 1 - chance
      return shifts ? Math.min(6, Math.max(1, value + direction)) : value
    })
    .sort((left, right) => right - left)
}

/** Approximation used only when the AI decides whether to continue a battle. */
export const terrainExchangeFactor = ({ attacker, defender }: TerrainCombatModifier) =>
  Math.max(0.5, 1 + (attacker - defender) / 100)
