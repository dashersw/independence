import type Game from './game'

/** Placement policy is separate from turn state and uses only legal turn commands. */
export class ReinforcementSystem {
  constructor(readonly game: Game) {}

  autoPlace() {
    const turn = this.game.turn
    if (turn.phase !== 'reinforce') return
    const faction = turn.currentPlayer.faction
    if (!faction.territories.length || turn.reinforcementsLeft === 0) {
      turn.finishReinforcementPhase()
      return
    }
    while (turn.reinforcementsLeft > 0) {
      const border = faction.territories
        .filter((territory) => territory.adjacent.some((adjacent) => adjacent.faction !== faction))
        .sort((left, right) => this.game.threatOf(right) - this.game.threatOf(left))[0]
      turn.placeReinforcements((border ?? faction.territories[0]).slug, 1)
    }
  }
}
