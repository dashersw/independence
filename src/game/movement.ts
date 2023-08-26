import type Game from './game'
import type Faction from './faction'
import type Territory from './territory'
import type { Convoy, PendingLanding } from './types'
import { campaignGroup } from './campaign-data'
import { SCENARIO } from './scenario'
import { logFaction, logTerritory } from './log'

export const SEA_LANES = SCENARIO.movement.seaLanes
const NAVIES = new Set(SCENARIO.movement.navies)
const OCCUPIED_TERRITORIES = new Set(campaignGroup(SCENARIO.movement.occupiedTerritoryGroup))

export class MovementSystem {
  convoys: Convoy[] = []
  /** Human landings awaiting an assault-or-retreat decision (see landConvoys). */
  pendingLandings: PendingLanding[] = []

  constructor(readonly game: Game) {}

  snapshot() {
    return {
      convoys: this.convoys.map((convoy) => ({ ...convoy })),
      pendingLandings: this.pendingLandings.map((landing) => ({ ...landing })),
    }
  }

  restore(snapshot: { convoys: Convoy[]; pendingLandings?: PendingLanding[] }) {
    this.convoys = snapshot.convoys.map((convoy) => ({ ...convoy }))
    this.pendingLandings = (snapshot.pendingLandings ?? []).map((landing) => ({ ...landing }))
  }

  troopsAtSea(faction: Faction) {
    let total = 0
    for (const convoy of this.convoys) if (convoy.faction === faction.name) total += convoy.troops
    return total
  }

  movable(from: Territory) {
    const spare = from.troops - 1
    const occupied = from.faction.alliance !== 'turkey' && OCCUPIED_TERRITORIES.has(from.slug)
    return occupied ? Math.floor(spare * SCENARIO.movement.occupiedMovementFactor) : spare
  }

  fortify(fromSlug: string, toSlug: string, count: number) {
    const game = this.game
    if (game.turn.phase !== 'fortify' || game.turn.fortifiesUsed >= game.campaign.fortifyLimit) return false
    const from = game.bySlug[fromSlug]
    const to = game.bySlug[toSlug]
    const faction = game.turn.currentPlayer.faction
    if (from.faction !== faction || to.faction !== faction || !from.isAdjacentTo(to)) return false
    const moved = Math.min(count, this.movable(from))
    if (moved <= 0) return false
    from.troops -= moved
    to.troops += moved
    game.turn.useFortify()
    return true
  }

  seaTargets(fromSlug: string): string[] {
    const game = this.game
    const from = game.bySlug[fromSlug]
    if (!from || game.turn.phase !== 'fortify' || game.turn.fortifiesUsed >= game.campaign.fortifyLimit) return []
    const faction = game.turn.currentPlayer.faction
    if (from.faction !== faction || !NAVIES.has(faction.name) || this.movable(from) <= 0) return []
    return SEA_LANES.flatMap((lane) => {
      const other = lane.ports[0] === fromSlug ? lane.ports[1] : lane.ports[1] === fromSlug ? lane.ports[0] : null
      return other && game.bySlug[other]?.faction === faction ? [other] : []
    })
  }

  shippable(from: Territory) {
    return Math.min(this.movable(from), SCENARIO.movement.crossingCapacity)
  }

  embark(fromSlug: string, toSlug: string, count: number) {
    const game = this.game
    if (!this.seaTargets(fromSlug).includes(toSlug)) return false
    const from = game.bySlug[fromSlug]
    const faction = game.turn.currentPlayer.faction
    const moved = Math.min(count, this.shippable(from))
    if (moved <= 0) return false
    from.troops -= moved
    this.convoys.push({
      faction: faction.name,
      from: fromSlug,
      to: toSlug,
      troops: moved,
      arrives: game.turn.round + SCENARIO.movement.crossingRounds,
    })
    game.turn.useFortify()
    game.record(faction, 'log.embark', {
      faction: logFaction(faction.name),
      n: moved,
      from: logTerritory(fromSlug, from.name),
      to: logTerritory(toSlug, game.bySlug[toSlug].name),
    })
    return true
  }

  landConvoys() {
    if (!this.convoys.length) return
    const game = this.game
    const faction = game.turn.currentPlayer.faction
    const stillAtSea: Convoy[] = []
    for (const convoy of this.convoys) {
      if (convoy.faction !== faction.name || game.turn.round < convoy.arrives) {
        stillAtSea.push(convoy)
        continue
      }
      const destination = game.bySlug[convoy.to]
      const origin = game.bySlug[convoy.from]
      // The port is still ours: disembark, unopposed.
      if (destination.faction === faction) {
        destination.troops += convoy.troops
        game.record(faction, convoy.returning ? 'log.convoyReturned' : 'log.convoyLanded', {
          faction: logFaction(faction.name),
          n: convoy.troops,
          territory: logTerritory(destination.slug, destination.name),
        })
        continue
      }
      // The port was lost while we crossed. Falling back is only possible for an
      // outbound convoy whose home port is still ours; a returning convoy has
      // nowhere left to run and must land where it is.
      const canFallBack = !convoy.returning && origin.faction === faction
      if (canFallBack) {
        // Never assault an ally: fall back is the only option there.
        if (destination.faction.alliance === faction.alliance) {
          this.turnBack(faction, destination, origin, convoy.troops)
          continue
        }
        // The human weighs the assault; the AI decides on the spot.
        if (faction === game.humanPlayer.faction) {
          this.pendingLandings.push({ faction: faction.name, from: convoy.from, to: convoy.to, troops: convoy.troops })
          continue
        }
        if (this.worthStorming(destination, convoy.troops)) game.combat.land(faction, destination, convoy.troops)
        else this.turnBack(faction, destination, origin, convoy.troops)
        continue
      }
      // No bolt-hole: storm a hostile shore, or reinforce a friendly one — both
      // resolved by combat.land (which lands allied troops unopposed).
      game.combat.land(faction, destination, convoy.troops)
    }
    this.convoys = stillAtSea
  }

  /** Resolve the oldest pending human landing: true storms the port, false turns back. */
  resolveLanding(assault: boolean) {
    const landing = this.pendingLandings.shift()
    if (!landing) return
    const game = this.game
    const faction = game.factions.find((candidate) => candidate.name === landing.faction)
    if (faction) {
      const destination = game.bySlug[landing.to]
      const origin = game.bySlug[landing.from]
      // Turn back only if home is still ours; otherwise the troops must fight.
      if (!assault && origin.faction === faction) this.turnBack(faction, destination, origin, landing.troops)
      else game.combat.land(faction, destination, landing.troops)
    }
    // Once the last landing is settled, the turn can finish opening — its draft is
    // now counted from the board the fighting left behind (see TurnController.start).
    if (!this.pendingLandings.length && game.turn.awaitingLanding && game.turn.phase !== 'gameover')
      game.turn.openTurn()
  }

  /** Send a stranded landing force back home — another full sea crossing. */
  private turnBack(faction: Faction, from: Territory, home: Territory, troops: number) {
    this.convoys.push({
      faction: faction.name,
      from: from.slug,
      to: home.slug,
      troops,
      arrives: this.game.turn.round + SCENARIO.movement.crossingRounds,
      returning: true,
    })
    this.game.record(faction, 'log.convoyTurnedBack', {
      faction: logFaction(faction.name),
      n: troops,
      territory: logTerritory(home.slug, home.name),
    })
  }

  /** AI heuristic: only storm a hostile port when the landing force outnumbers the garrison. */
  private worthStorming(destination: Territory, troops: number) {
    return troops > destination.troops
  }
}
