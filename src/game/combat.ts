import type Game from './game'
import type Faction from './faction'
import type Territory from './territory'
import type { BattleResult, BattleRound } from './types'
import { logFaction, logTerritory } from './log'
import { exchangeOdds, resolveDice, rollDice } from './combat-dice'

interface ActiveBattle {
  from: Territory
  to: Territory
  attackerLosses: number
  defenderLosses: number
  equippedUsed?: number
}

interface AttackContext {
  from: Territory
  to: Territory
  attacker: Faction
  defender: Faction
}

export interface PendingAdvance {
  from: string
  to: string
  min: number
  max: number
}

export class CombatSystem {
  private active: ActiveBattle | null = null
  pendingAdvance: PendingAdvance | null = null
  landedOn: string[] = []

  constructor(readonly game: Game) {}

  snapshot() {
    return {
      active: this.active
        ? {
            from: this.active.from.slug,
            to: this.active.to.slug,
            attackerLosses: this.active.attackerLosses,
            defenderLosses: this.active.defenderLosses,
            equippedUsed: this.active.equippedUsed,
          }
        : null,
      pendingAdvance: this.pendingAdvance ? { ...this.pendingAdvance } : null,
      landedOn: [...this.landedOn],
    }
  }

  restore(snapshot: ReturnType<CombatSystem['snapshot']>) {
    this.active = snapshot.active
      ? {
          ...snapshot.active,
          from: this.game.bySlug[snapshot.active.from],
          to: this.game.bySlug[snapshot.active.to],
        }
      : null
    if (this.active && (!this.active.from || !this.active.to))
      throw new Error('Combat snapshot references unknown territory')
    this.pendingAdvance = snapshot.pendingAdvance ? { ...snapshot.pendingAdvance } : null
    this.landedOn = [...snapshot.landedOn]
  }

  diceCaps(from: Territory, to: Territory): { attacker: number; defender: number; equipped: boolean } {
    const attacker = from.faction
    const defender = to.faction
    const sameBattle = this.active?.from === from && this.active?.to === to
    const spent = sameBattle ? (this.active?.equippedUsed ?? 0) : 0
    return this.game.campaign.combatDice(attacker, defender, to, spent)
  }

  worthPressing(from: Territory, to: Territory): boolean {
    if (from.troops < 2 || to.troops < 1) return false
    const caps = this.diceCaps(from, to)
    const odds = exchangeOdds(Math.min(caps.attacker, from.troops - 1), Math.min(caps.defender, to.troops))
    if (!odds || odds.defender <= odds.attacker) return false
    const cost = (to.troops * odds.attacker) / odds.defender
    return from.troops - 1 > cost
  }

  targets(fromSlug: string): string[] {
    const game = this.game
    const from = game.bySlug[fromSlug]
    if (!from || game.turn.phase !== 'attack') return []
    const attacker = from.faction
    if (
      attacker !== game.turn.currentPlayer.faction ||
      from.troops < 2 ||
      game.campaign.frozen(attacker) ||
      !from.adjacent.some((to) => game.turn.canStartAttack(fromSlug, to.slug))
    )
      return []
    return from.adjacent
      .filter(
        (to) =>
          to.faction !== attacker &&
          game.turn.canStartAttack(fromSlug, to.slug) &&
          game.campaign.mayAttack(attacker, to.faction) &&
          !game.campaign.frontClosed(attacker, to),
      )
      .map((to) => to.slug)
  }

  private breakPeace(attacker: Faction, defender: Faction) {
    const game = this.game
    if (!game.campaign.atPeace(defender)) return
    const result = game.campaign.attackStarted(attacker, defender)
    if (result.peaceBroken)
      game.record(
        defender,
        'log.peaceBroken',
        { attacker: logFaction(attacker.name), defender: logFaction(defender.name) },
        true,
      )
    const troops = result.remobilized
    if (troops > 0) game.record(defender, 'log.armeniaRemobilizes', { n: troops }, true)
  }

  private resolveAttack(fromSlug: string, toSlug: string): AttackContext | null {
    const game = this.game
    if (game.turn.phase !== 'attack') return null
    const from = game.bySlug[fromSlug]
    const to = game.bySlug[toSlug]
    if (!from || !to) return null
    const attacker = from.faction
    const defender = to.faction
    const continuing = this.active?.from === from && this.active?.to === to
    if (attacker !== game.turn.currentPlayer.faction || defender === attacker) return null
    if (!from.isAdjacentTo(to) || from.troops < 2) return null
    if (
      !game.campaign.mayAttack(attacker, defender) ||
      game.campaign.frontClosed(attacker, to) ||
      game.campaign.frozen(attacker)
    )
      return null
    if (!continuing && !game.turn.canStartAttack(fromSlug, toSlug)) return null
    return { from, to, attacker, defender }
  }

  private ensureActive(context: AttackContext) {
    const { from, to, attacker, defender } = context
    if (this.active && (this.active.from !== from || this.active.to !== to)) this.pullBack()
    if (this.active) return this.active
    if (!this.game.turn.useAttack(from.slug, to.slug)) return null
    this.active = { from, to, attackerLosses: 0, defenderLosses: 0 }
    if (attacker.alliance !== 'turkey' && defender.alliance === 'turkey') from.raidedOn = this.game.turn.round
    defender.grudges.add(attacker.name)
    to.quietTurns = 0
    this.breakPeace(attacker, defender)
    return this.active
  }

  begin(fromSlug: string, toSlug: string): BattleResult | null {
    if (this.pendingAdvance) this.advance(0)
    const context = this.resolveAttack(fromSlug, toSlug)
    if (!context) return null
    const { from, to, attacker, defender } = context
    const battle = this.ensureActive(context)
    if (!battle) return null
    return {
      from,
      to,
      attacker,
      defender,
      rounds: [],
      conquered: false,
      attackerLosses: battle.attackerLosses,
      defenderLosses: battle.defenderLosses,
      troopsMoved: 0,
      eliminatedFaction: null,
      pending: true,
    }
  }

  step(fromSlug: string, toSlug: string): BattleResult | null {
    const game = this.game
    const context = this.resolveAttack(fromSlug, toSlug)
    if (!context) return null
    const { from, to, attacker, defender } = context
    const battle = this.ensureActive(context)
    if (!battle) return null
    const caps = this.diceCaps(from, to)
    if (caps.equipped) battle.equippedUsed = (battle.equippedUsed ?? 0) + 1

    const attackerDice = rollDice(game.random, Math.min(caps.attacker, from.troops - 1))
    const defenderDice = rollDice(game.random, Math.min(caps.defender, to.troops))
    const { attacker: attackerLosses, defender: defenderLosses } = resolveDice(attackerDice, defenderDice)
    from.troops -= attackerLosses
    to.troops -= defenderLosses
    battle.attackerLosses += attackerLosses
    battle.defenderLosses += defenderLosses
    const round: BattleRound = { attackerDice, defenderDice, attackerLosses, defenderLosses }

    let conquered = false
    let troopsMoved = 0
    let eliminatedFaction: Faction | null = null
    if (to.troops === 0) {
      conquered = true
      game.turn.recordConquest(from.slug, to.slug)
      const occupiedFor = game.turn.round - to.heldSince
      game.board.changeControl(to, attacker, game.turn.round)
      const max = from.troops - 1
      const min = Math.min(attackerDice.length, max)
      troopsMoved = attacker === game.humanPlayer.faction ? min : max
      from.troops -= troopsMoved
      to.troops = troopsMoved
      this.pendingAdvance =
        attacker === game.humanPlayer.faction && max > min ? { from: from.slug, to: to.slug, min, max } : null
      game.campaign.territoryCaptured(attacker, to, occupiedFor)
      if (defender.eliminated) {
        eliminatedFaction = defender
        attacker.hand.push(...defender.hand)
        defender.hand = []
        game.record(defender, 'log.knockedOut', { faction: logFaction(defender.name) })
      }
    }

    const pending = !conquered && from.troops > 1 && to.troops > 0
    const totalAttackerLosses = battle.attackerLosses
    const totalDefenderLosses = battle.defenderLosses
    if (conquered) {
      game.record(attacker, 'log.captured', {
        attacker: logFaction(attacker.name),
        territory: logTerritory(to.slug, to.name),
        territoryAcc: logTerritory(to.slug, to.name, 'acc'),
        defender: logFaction(defender.name),
        atkLoss: totalAttackerLosses,
        defLoss: totalDefenderLosses,
      })
      this.active = null
    } else if (!pending) {
      this.logRepel(attacker, defender, to, totalAttackerLosses, totalDefenderLosses)
      this.active = null
    }
    game.checkGameEnd()
    return {
      from,
      to,
      attacker,
      defender,
      rounds: [round],
      conquered,
      attackerLosses: totalAttackerLosses,
      defenderLosses: totalDefenderLosses,
      troopsMoved,
      eliminatedFaction,
      pending,
    }
  }

  advance(count: number) {
    const move = this.pendingAdvance
    if (!move) return 0
    const from = this.game.bySlug[move.from]
    const to = this.game.bySlug[move.to]
    this.pendingAdvance = null
    const wanted = Math.min(Math.max(count, move.min), move.max)
    const extra = wanted - move.min
    if (extra > 0) {
      from.troops -= extra
      to.troops += extra
    }
    return to.troops
  }

  private logRepel(
    attacker: Faction,
    defender: Faction,
    to: Territory,
    attackerLosses: number,
    defenderLosses: number,
  ) {
    this.game.record(attacker, 'log.repelled', {
      attacker: logFaction(attacker.name),
      territory: logTerritory(to.slug, to.name),
      territoryDat: logTerritory(to.slug, to.name, 'dat'),
      defender: logFaction(defender.name),
      atkLoss: attackerLosses,
      defLoss: defenderLosses,
    })
  }

  pullBack() {
    const battle = this.active
    if (!battle) return
    this.active = null
    this.logRepel(battle.from.faction, battle.to.faction, battle.to, battle.attackerLosses, battle.defenderLosses)
  }

  blitz(fromSlug: string, toSlug: string): BattleResult | null {
    let last: BattleResult | null = null
    let result = this.step(fromSlug, toSlug)
    while (result) {
      last = result
      if (!result.pending) break
      result = this.step(fromSlug, toSlug)
    }
    return last
  }

  land(power: Faction, site: Territory, strength: number) {
    const game = this.game
    const defender = site.faction
    if (defender.alliance === power.alliance) {
      site.troops += strength
      game.record(
        power,
        'log.landingUnopposed',
        {
          faction: logFaction(power.name),
          territory: logTerritory(site.slug, site.name),
          n: strength,
        },
        true,
      )
      return
    }
    let attackers = strength
    let defenders = site.troops
    const caps = game.campaign.combatDice(power, defender, site, Number.MAX_SAFE_INTEGER, 'landing')
    const attackerCap = caps.attacker
    const defenderCap = caps.defender
    while (attackers > 0 && defenders > 0) {
      const attackDice = rollDice(game.random, Math.min(attackerCap, attackers))
      const defenceDice = rollDice(game.random, Math.min(defenderCap, defenders))
      const losses = resolveDice(attackDice, defenceDice)
      attackers -= losses.attacker
      defenders -= losses.defender
    }
    if (defenders > 0) {
      site.troops = defenders
      game.record(
        power,
        'log.landingRepelled',
        {
          faction: logFaction(power.name),
          territory: logTerritory(site.slug, site.name),
          n: strength,
        },
        true,
      )
      return
    }
    game.board.changeControl(site, power, game.turn.round)
    site.troops = Math.max(1, attackers)
    site.raidedOn = game.turn.round
    if (!this.landedOn.includes(site.slug)) this.landedOn.push(site.slug)
    defender.grudges.add(power.name)
    power.peaceBroken = true
    game.record(
      power,
      'log.landing',
      {
        faction: logFaction(power.name),
        territory: logTerritory(site.slug, site.name),
        n: site.troops,
      },
      true,
    )
    game.checkGameEnd()
  }
}
