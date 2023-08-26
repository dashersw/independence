import type Game from './game'
import campaignDocument from './campaign-events.json'
import { tCase, tDateLoc, tTerritory } from '../i18n'
import {
  DeclarativeEntity,
  DeclarativeHost,
  defineDeclarativeEventEngine,
  loadDeclarativeCampaign,
  setPath,
} from '../events/declarative'
import { HOMELAND_OWNER, NATIONAL_PACT, STARTING_TERRITORIES } from './campaign-data'
import type { Phase } from './types'
import { SCENARIO } from './scenario'

export const CAMPAIGN_DOCUMENT = loadDeclarativeCampaign(campaignDocument)

type HostFactory = (extraRoot?: Record<string, unknown>) => DeclarativeHost

const hostFactories = new WeakMap<Game, HostFactory>()

const dynamicView = (
  source: unknown,
  fixed: Record<string, unknown>,
  values: Record<string, () => unknown>,
): DeclarativeEntity => {
  const view: DeclarativeEntity = { $source: source, ...fixed }
  Object.defineProperties(
    view,
    Object.fromEntries(
      Object.entries(values).map(([name, get]) => [name, { enumerable: true, configurable: false, get }]),
    ),
  )
  return view
}

const createHostFactory = (game: Game): HostFactory => {
  const territoryViews: DeclarativeEntity[] = game.territories.map((territory) =>
    dynamicView(
      territory,
      {
        slug: territory.slug,
        homelandOwner: HOMELAND_OWNER[territory.slug],
        adjacent: territory.adjacent.map((adjacent) =>
          dynamicView(
            adjacent,
            { slug: adjacent.slug },
            {
              heldBy: () => adjacent.faction.name,
              heldByAlliance: () => adjacent.faction.alliance,
              troops: () => adjacent.troops,
            },
          ),
        ),
      },
      {
        heldBy: () => territory.faction.name,
        heldByAlliance: () => territory.faction.alliance,
        troops: () => territory.troops,
        entrenched: () => territory.entrenched,
        quietTurns: () => territory.quietTurns,
        heldSince: () => territory.heldSince,
        raidedOn: () => territory.raidedOn,
      },
    ),
  )
  const factionViews: DeclarativeEntity[] = game.factions.map((faction) =>
    dynamicView(
      faction,
      {
        name: faction.name,
        alliance: faction.alliance,
        setupTerritoryCount: STARTING_TERRITORIES[faction.name] ?? Number.POSITIVE_INFINITY,
      },
      {
        territoryCount: () => faction.territories.length,
        homeTerritoryCount: () =>
          faction.territories.filter((territory) => !NATIONAL_PACT.includes(territory.slug)).length,
        eliminated: () => faction.eliminated,
        peaceBroken: () => faction.peaceBroken,
      },
    ),
  )
  const territories = Object.fromEntries(territoryViews.map((view) => [view.slug, view]))
  const factions = Object.fromEntries(factionViews.map((view) => [view.name, view]))

  const gameView = dynamicView(
    game,
    {},
    {
      round: () => game.turn.round,
      phase: () => game.turn.phase,
      pactProgress: () => game.pactProgress,
      liberatedThisTurn: () => game.turn.liberatedHomeland,
    },
  )
  const turnView = dynamicView(
    game.turn,
    {},
    {
      currentFaction: () => game.turn.currentPlayer.faction.name,
      phase: () => game.turn.phase,
      reinforcementsLeft: () => game.turn.reinforcementsLeft,
    },
  )
  const presentationView = dynamicView(
    game,
    {},
    {
      currentDate: () => game.date,
      currentDateLoc: () => tDateLoc(game.date),
      assemblySeat: () => {
        const seat =
          SCENARIO.presentation.governmentSeats.find(
            (slug) => game.bySlug[slug]?.faction.name === SCENARIO.presentation.governmentFaction,
          ) ?? SCENARIO.presentation.governmentSeats[SCENARIO.presentation.governmentSeats.length - 1]
        return tCase(tTerritory(seat, game.bySlug[seat].name), 'loc')
      },
    },
  )

  const baseHost: Omit<DeclarativeHost, 'root'> = {
    groups: CAMPAIGN_DOCUMENT.groups,
    collections: { territories: territoryViews, factions: factionViews },
    setVariable(path, value) {
      setPath(game.campaign.variables, path, value)
    },
    setEntity(collection, entity, field, value) {
      const source = entity.$source as Record<string, unknown>
      if (collection === 'territories' && field === 'heldBy') {
        const territory = source as unknown as Game['territories'][number]
        const owner = game.factions.find((faction) => faction.name === value)
        if (owner && territory.faction !== owner) game.board.changeControl(territory, owner, game.turn.round)
        return
      }
      source[field] = value
    },
    drawCards(factionName, count) {
      const faction = game.factions.find((candidate) => candidate.name === factionName)
      if (faction) for (let n = 0; n < count; n++) game.drawCard(faction)
    },
    writeLog(key, factionName, vars, event) {
      const faction = factionName ? (game.factions.find((candidate) => candidate.name === factionName) ?? null) : null
      const interpolation = Object.fromEntries(
        Object.entries(vars).map(([name, value]) => [name, typeof value === 'number' ? value : String(value)]),
      )
      game.record(faction, key, interpolation, event)
    },
    resolveBattle(attackerName, targetSlug, troops) {
      const attacker = game.factions.find((candidate) => candidate.name === attackerName)
      const target = game.bySlug[targetSlug]
      if (attacker && target) game.combat.land(attacker, target, troops)
    },
    random: () => game.random.next(),
    afterApply(changed) {
      if (changed.has('territories')) game.checkGameEnd()
    },
  }

  return (extraRoot = {}) => {
    const root: Record<string, unknown> = {
      game: gameView,
      turn: turnView,
      variables: game.campaign.variables,
      territories,
      factions,
      presentation: presentationView,
      result: { allowed: true },
      ...extraRoot,
    }
    return {
      ...baseHost,
      root,
      setRoot(target, field, value) {
        if (target === 'turn') {
          if (field === 'reinforcementsLeft') game.turn.setReinforcements(Number(value))
          else if (field === 'phase') game.turn.setPhase(value as Phase)
          return
        }
        if (target === 'game') {
          if (field === 'winner')
            game.winner = value ? (game.factions.find((faction) => faction.name === value) ?? null) : null
          else if (field === 'phase') game.turn.setPhase(value as Phase)
          else if (field === 'liberatedThisTurn' && value) game.turn.recordLiberation()
          else (game as unknown as Record<string, unknown>)[field] = value
          return
        }
        setPath(root.result as Record<string, unknown>, field, value)
      },
    }
  }
}

const campaignHost = (game: Game, extraRoot?: Record<string, unknown>): DeclarativeHost => {
  let factory = hostFactories.get(game)
  if (!factory) {
    factory = createHostFactory(game)
    hostFactories.set(game, factory)
  }
  return factory(extraRoot)
}

export const createCampaignEventEngine = () => defineDeclarativeEventEngine(CAMPAIGN_DOCUMENT, campaignHost)
export const CAMPAIGN_EVENTS = createCampaignEventEngine()
export const CAMPAIGN_EVENT_MAP = CAMPAIGN_EVENTS.map
export const HISTORICAL_EVENTS = CAMPAIGN_EVENTS.events

// Exported only for generic gameplay integration and focused diagnostics.
export const campaignRuleState = (game: Game, extraRoot?: Record<string, unknown>) => campaignHost(game, extraRoot)
