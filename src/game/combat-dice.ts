import type { RandomSource } from './random'

export interface DiceLosses {
  attacker: number
  defender: number
}

export const rollDice = (random: RandomSource, count: number) =>
  Array.from({ length: count }, () => Math.floor(random.next() * 6) + 1).sort((left, right) => right - left)

export const resolveDice = (attackerDice: number[], defenderDice: number[]): DiceLosses => {
  const losses = { attacker: 0, defender: 0 }
  for (let index = 0; index < Math.min(attackerDice.length, defenderDice.length); index++) {
    if (attackerDice[index] > defenderDice[index]) losses.defender++
    else losses.attacker++
  }
  return losses
}

const rolls = (count: number): number[][] =>
  count === 0 ? [[]] : rolls(count - 1).flatMap((rest) => [1, 2, 3, 4, 5, 6].map((value) => [value, ...rest]))

const EXCHANGE_ODDS: Record<string, DiceLosses> = (() => {
  const table: Record<string, DiceLosses> = {}
  for (let attacker = 1; attacker <= 3; attacker++)
    for (let defender = 1; defender <= 3; defender++) {
      const losses = { attacker: 0, defender: 0 }
      let outcomes = 0
      for (const attackerRolls of rolls(attacker))
        for (const defenderRolls of rolls(defender)) {
          const exchange = resolveDice(
            [...attackerRolls].sort((left, right) => right - left),
            [...defenderRolls].sort((left, right) => right - left),
          )
          losses.attacker += exchange.attacker
          losses.defender += exchange.defender
          outcomes++
        }
      table[`${attacker}v${defender}`] = {
        attacker: losses.attacker / outcomes,
        defender: losses.defender / outcomes,
      }
    }
  return table
})()

export const exchangeOdds = (attackerDice: number, defenderDice: number) =>
  EXCHANGE_ODDS[`${attackerDice}v${defenderDice}`]
