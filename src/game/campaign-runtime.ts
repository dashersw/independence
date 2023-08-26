import type Game from './game'
import type Faction from './faction'
import type Territory from './territory'
import type { EventDefinition } from '../events/event-map'
import { getPath } from '../events/declarative'
import { campaignGroup, HOMELAND_OWNER } from './campaign-data'
import { CAMPAIGN_EVENTS } from './campaign-events'
import { SCENARIO, type DiplomacyPermission } from './scenario'

export type HistoricalEvent = EventDefinition<Game>

/** Owns campaign state and translates generic declarative rules into gameplay queries. */
export class CampaignRuntime {
  variables: Record<string, unknown> = CAMPAIGN_EVENTS.initialVariables()
  retries: Record<string, number> = {}
  checkedOn: Record<string, number> = {}
  announcedEvents = new Set<string>()
  pendingCards: string[] = []
  pendingDecision: HistoricalEvent | null = null

  constructor(readonly game: Game) {}

  snapshot() {
    return {
      variables: structuredClone(this.variables),
      retries: { ...this.retries },
      checkedOn: { ...this.checkedOn },
      announcedEvents: [...this.announcedEvents],
      pendingCards: [...this.pendingCards],
      pendingDecision: this.pendingDecision?.id ?? null,
    }
  }

  restore(snapshot: ReturnType<CampaignRuntime['snapshot']>) {
    this.variables = structuredClone(snapshot.variables)
    this.retries = { ...snapshot.retries }
    this.checkedOn = { ...snapshot.checkedOn }
    this.announcedEvents = new Set(snapshot.announcedEvents)
    this.pendingCards = [...snapshot.pendingCards]
    this.pendingDecision = snapshot.pendingDecision
      ? (CAMPAIGN_EVENTS.events.find((event) => event.id === snapshot.pendingDecision) ?? null)
      : null
  }

  private resultNumber(root: Record<string, unknown>, path: string) {
    const value = getPath(root, path)
    if (typeof value !== 'number' || !Number.isFinite(value))
      throw new Error(`Rule result ${path} must be a finite number`)
    return value
  }

  private resultBoolean(root: Record<string, unknown>, path: string) {
    const value = getPath(root, path)
    if (typeof value !== 'boolean') throw new Error(`Rule result ${path} must be a boolean`)
    return value
  }

  private permissionMatches(permission: DiplomacyPermission, attacker: Faction, defender: Faction) {
    return (
      (!permission.attacker || permission.attacker === attacker.name) &&
      (!permission.attackerAlliance || permission.attackerAlliance === attacker.alliance) &&
      (!permission.defender || permission.defender === defender.name) &&
      (!permission.defenderAlliance || permission.defenderAlliance === defender.alliance)
    )
  }

  private fireRules(trigger: string, extraRoot: Record<string, unknown> = {}) {
    return CAMPAIGN_EVENTS.fireRules(trigger, this.game, extraRoot)
  }

  turnStarted(faction: Faction) {
    this.fireRules('turn.started', { action: { faction: faction.name } })
  }

  roundUpkeep() {
    this.fireRules('round.upkeep')
  }

  territoryCaptured(attacker: Faction, target: Territory, occupiedFor: number) {
    this.fireRules('territory.captured', {
      action: {
        attacker: attacker.name,
        attackerAlliance: attacker.alliance,
        target: { slug: target.slug },
        occupiedFor,
      },
    })
  }

  combatDice(
    attacker: Faction,
    defender: Faction,
    target: Territory,
    exchangesSpent: number,
    kind: 'battle' | 'landing' = 'battle',
  ) {
    const evaluated = this.fireRules('combatDice.calculate', {
      action: {
        kind,
        attacker: attacker.name,
        attackerAlliance: attacker.alliance,
        defender: defender.name,
        defenderAlliance: defender.alliance,
        target: { slug: target.slug },
        exchangesSpent,
      },
      result: { attacker: 3, defender: 2, equipped: false },
    })
    return {
      attacker: this.resultNumber(evaluated.root, 'result.attacker'),
      defender: this.resultNumber(evaluated.root, 'result.defender'),
      equipped: this.resultBoolean(evaluated.root, 'result.equipped'),
    }
  }

  attackStarted(attacker: Faction, defender: Faction) {
    const result = this.fireRules('attack.started', {
      action: { attacker: attacker.name, defender: defender.name, defenderAtPeace: true },
      result: { peaceBroken: false, remobilized: 0 },
    })
    return {
      peaceBroken: this.resultBoolean(result.root, 'result.peaceBroken'),
      remobilized: this.resultNumber(result.root, 'result.remobilized'),
    }
  }

  get attackLimit() {
    const faction = this.game.turn.currentPlayer.faction
    const evaluated = this.fireRules('attackLimit.calculate', {
      action: { faction: faction.name },
      result: { value: SCENARIO.combat.attacksPerTurn },
    })
    return Math.max(0, Math.trunc(this.resultNumber(evaluated.root, 'result.value')))
  }

  maximumAdvanceDepth(targetSlug: string) {
    const faction = this.game.turn.currentPlayer.faction
    const target = this.game.bySlug[targetSlug]
    if (!target) return 0
    const homeland = HOMELAND_OWNER[target.slug] === faction.name
    const evaluated = this.fireRules('maximumAdvanceDepth.calculate', {
      action: { faction: faction.name, target: { slug: target.slug } },
      result: {
        value: homeland ? SCENARIO.combat.advanceDepth.homeland : SCENARIO.combat.advanceDepth.foreign,
      },
    })
    return Math.max(0, Math.trunc(this.resultNumber(evaluated.root, 'result.value')))
  }

  get fortifyLimit() {
    const faction = this.game.turn.currentPlayer.faction
    const base = SCENARIO.economy.fortifyLimitByFaction[faction.name] ?? SCENARIO.economy.defaultFortifyLimit
    const evaluated = this.fireRules('fortifyLimit.calculate', {
      action: { faction: faction.name },
      result: { value: base },
    })
    return this.resultNumber(evaluated.root, 'result.value')
  }

  reinforcementsFor(faction: Faction) {
    const occupiedTerritories = campaignGroup(SCENARIO.movement.occupiedTerritoryGroup)
    const homeTerritoryCount = faction.territories.filter(
      (territory) => !occupiedTerritories.includes(territory.slug),
    ).length
    const base = Math.max(
      SCENARIO.economy.minimumReinforcements,
      Math.floor(faction.territories.length / SCENARIO.economy.territoriesPerReinforcement),
    )
    const evaluated = this.fireRules('reinforcements.calculate', {
      action: {
        faction: faction.name,
        alliance: faction.alliance,
        peaceBroken: faction.peaceBroken,
        homeTerritoryCount,
      },
      result: { value: base },
    })
    return this.resultNumber(evaluated.root, 'result.value')
  }

  isPassive(faction: Faction) {
    const status = this.fireRules('faction.peaceStatus', {
      action: { faction: faction.name, peaceBroken: faction.peaceBroken },
      result: { passive: false, atPeace: false },
    })
    return this.resultBoolean(status.root, 'result.passive')
  }

  atPeace(faction: Faction) {
    const status = this.fireRules('faction.peaceStatus', {
      action: { faction: faction.name, peaceBroken: faction.peaceBroken },
      result: { passive: false, atPeace: false },
    })
    return this.resultBoolean(status.root, 'result.atPeace')
  }

  frontClosed(attacker: Faction, target: Territory) {
    const game = this.game
    const validation = this.fireRules('attack.target.validate', {
      action: {
        attacker: attacker.name,
        attackerAlliance: attacker.alliance,
        defender: target.faction.name,
        target: { slug: target.slug },
        targetLandedOn: game.combat.landedOn.includes(target.slug),
        retaliationActive: target.raidedOn > 0 && game.turn.round - target.raidedOn <= SCENARIO.retaliationWindow,
      },
      result: { allowed: true },
    })
    return !this.resultBoolean(validation.root, 'result.allowed')
  }

  frozen(faction: Faction) {
    const evaluated = this.fireRules('faction.turnStatus', {
      action: { faction: faction.name },
      result: { frozen: false },
    })
    return this.resultBoolean(evaluated.root, 'result.frozen')
  }

  mayAttack(attacker: Faction, defender: Faction) {
    const validation = this.fireRules('attack.validate', {
      action: { attacker: attacker.name, attackerAlliance: attacker.alliance, defender: defender.name },
      result: { allowed: true },
    })
    if (!this.resultBoolean(validation.root, 'result.allowed')) return false
    if (SCENARIO.diplomacy.grudgesOverride && attacker.grudges.has(defender.name)) return true
    return SCENARIO.diplomacy.permissions.some((permission) => this.permissionMatches(permission, attacker, defender))
  }

  dispatch() {
    const game = this.game
    CAMPAIGN_EVENTS.dispatch({
      context: game,
      round: game.turn.round,
      isHumanTurn: game.turn.currentPlayer.isHuman,
      hasPendingDecision: () => !!this.pendingDecision,
      hasFired: (id) => this.announcedEvents.has(id),
      markFired: (id) => this.announcedEvents.add(id),
      gateLastChecked: (id) => this.checkedOn[id],
      setGateLastChecked: (id, round) => {
        this.checkedOn[id] = round
      },
      gateAttempts: (id) => this.retries[id] ?? 0,
      setGateAttempts: (id, attempts) => {
        this.retries[id] = attempts
      },
      actorEliminated: (actor) => game.factions.find((faction) => faction.name === actor)?.eliminated ?? false,
      announce: (event, scope) => {
        const actor = game.factions.find((faction) => faction.name === event.actor) ?? null
        game.record(actor, event.id, event.vars?.(game, scope), true)
      },
      queueCard: (id) => this.pendingCards.push(id),
      setPendingDecision: (event) => {
        this.pendingDecision = event
      },
    })
  }

  resolveDecision(choiceKey: string) {
    const event = this.pendingDecision
    if (!event || !event.choices?.some((choice) => choice.key === choiceKey)) return
    this.pendingDecision = null
    this.game.record(this.game.turn.currentPlayer.faction, `${event.id}.${choiceKey}.log`, {}, true)
    CAMPAIGN_EVENTS.resolveChoice(event, choiceKey, this.game, this.game.turn.round)
    this.dispatch()
  }

  clearCards() {
    this.pendingCards.length = 0
  }
}
