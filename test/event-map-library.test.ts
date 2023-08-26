import { describe, test } from 'node:test'
import assert from 'node:assert/strict'
import {
  choice,
  condition,
  defineEventEngine,
  defineEventMap,
  dispatchEventMap,
  eventDate,
  eventMapToMermaid,
  outcome,
  roundForDate,
  resolveEventChoice,
  retry,
} from '../src/events/event-map'
import { declarativeCampaignToMermaid, loadDeclarativeCampaign } from '../src/events/declarative'
import campaignDocument from '../src/game/campaign-events.json'
import { CAMPAIGN_DOCUMENT, CAMPAIGN_EVENTS, CAMPAIGN_EVENT_MAP, HISTORICAL_EVENTS } from '../src/game/campaign-events'

type ToyContext = { open: boolean; effects: string[] }

const toyEngine = defineEventEngine<ToyContext>({ id: 'toy', title: 'Toy campaign' }, [
  {
    id: 'event.seed',
    title: 'Seed event',
    round: 1,
    outcomes: [outcome('seed.write', 'Write seed state', (context) => context.effects.push('seed'), ['seeded'])],
  },
  {
    id: 'event.waiting',
    title: 'Waiting event',
    round: 1,
    conditions: [condition('waiting.open', 'The route is open', (context) => context.open, ['event.seed'])],
    retry: retry.forever,
    outcomes: [outcome('waiting.write', 'Write waiting state', (context) => context.effects.push('waiting'))],
  },
  {
    id: 'event.decision',
    title: 'Decision event',
    round: 2,
    choices: [
      choice('left', 'Take the left road', [
        outcome('decision.left', 'Record left road', (context) => context.effects.push('left')),
      ]),
      choice('right', 'Take the right road', [
        outcome('decision.right', 'Record right road', (context) => context.effects.push('right')),
      ]),
    ],
  },
])
const toyMap = toyEngine.map

const harness = () => {
  const context: ToyContext = { open: false, effects: [] }
  const fired = new Set<string>()
  const checked: Record<string, number> = {}
  const attempts: Record<string, number> = {}
  const cards: string[] = []
  let decision = null as (typeof toyMap.events)[number] | null
  const pass = (round: number, human = true) =>
    dispatchEventMap(toyMap, {
      context,
      round,
      isHumanTurn: human,
      hasPendingDecision: () => !!decision,
      hasFired: (id) => fired.has(id),
      markFired: (id) => fired.add(id),
      gateLastChecked: (id) => checked[id],
      setGateLastChecked: (id, value) => {
        checked[id] = value
      },
      gateAttempts: (id) => attempts[id] ?? 0,
      setGateAttempts: (id, value) => {
        attempts[id] = value
      },
      actorEliminated: () => false,
      announce: () => {},
      queueCard: (id) => cards.push(id),
      setPendingDecision: (event) => {
        decision = event
      },
    })
  return {
    context,
    fired,
    checked,
    attempts,
    cards,
    pass,
    decision: () => decision,
    clearDecision: () => {
      decision = null
    },
  }
}

describe('reusable declarative event maps', () => {
  test('the engine derives schedules from a declared calendar and owns event data', () => {
    type CalendarContext = { round: number }
    const engine = defineEventEngine<CalendarContext>(
      {
        id: 'calendar',
        title: 'Calendar campaign',
        calendar: { starts: eventDate(2000, 1), monthsPerRound: 2 },
        currentRound: (context) => context.round,
      },
      [
        {
          id: 'event.dated',
          title: 'Dated event',
          at: eventDate(2000, 4, 12),
          data: { strength: 7 },
          vars: (_context, scope) => ({
            strength: scope.value<number>('strength'),
            elapsed: scope.elapsedRounds,
          }),
        },
      ],
    )

    assert.equal(engine.round('event.dated'), 3)
    assert.equal(engine.value('event.dated', 'strength'), 7)
    assert.deepEqual(engine.variables(engine.event('event.dated'), { round: 5 }), { strength: 7, elapsed: 2 })
    assert.throws(() => engine.value('event.dated', 'missing'), /has no data value/)
    assert.throws(() => engine.event('event.missing'), /Unknown event/)
  })

  test('a round window expires from elapsed time even when intermediate passes are skipped', () => {
    type WindowContext = { applied: boolean }
    const engine = defineEventEngine<WindowContext>({ id: 'window', title: 'Window campaign' }, [
      {
        id: 'event.window',
        title: 'Windowed event',
        round: 4,
        conditions: [condition('window.closed', 'The gate remains closed', () => false)],
        retry: retry.window(2),
        outcomes: [
          outcome('window.apply', 'Apply result', (context) => {
            context.applied = true
          }),
        ],
      },
    ])
    const context = { applied: false }
    const fired = new Set<string>()
    let attempts = 0
    engine.dispatch({
      context,
      round: 7,
      isHumanTurn: true,
      hasPendingDecision: () => false,
      hasFired: (id) => fired.has(id),
      markFired: (id) => fired.add(id),
      gateLastChecked: () => undefined,
      setGateLastChecked: () => {},
      gateAttempts: () => attempts,
      setGateAttempts: (_id, value) => {
        attempts = value
      },
      actorEliminated: () => false,
      announce: () => {},
      queueCard: () => {},
      setPendingDecision: () => {},
    })

    assert.ok(fired.has('event.window'))
    assert.equal(attempts, 0, 'an already-expired window is not counted as a fresh attempt')
    assert.equal(context.applied, false)
  })

  test('retry gates receive engine-owned attempt state and event parameters', () => {
    type AttemptContext = { scopes: number[]; applied: boolean }
    const engine = defineEventEngine<AttemptContext>({ id: 'attempts', title: 'Attempt campaign' }, [
      {
        id: 'event.fallback',
        title: 'Fallback event',
        round: 2,
        data: { fallbackAfter: 2 },
        conditions: [
          condition('fallback.ready', 'Fallback becomes available after two failures', (context, scope) => {
            context.scopes.push(scope.attempts)
            return scope.attempts >= scope.value<number>('fallbackAfter')
          }),
        ],
        retry: retry.forever,
        outcomes: [
          outcome('fallback.apply', 'Apply fallback', (context) => {
            context.applied = true
          }),
        ],
      },
    ])
    const context: AttemptContext = { scopes: [], applied: false }
    const fired = new Set<string>()
    const checked: Record<string, number> = {}
    const attempts: Record<string, number> = {}
    const pass = (round: number) =>
      engine.dispatch({
        context,
        round,
        isHumanTurn: true,
        hasPendingDecision: () => false,
        hasFired: (id) => fired.has(id),
        markFired: (id) => fired.add(id),
        gateLastChecked: (id) => checked[id],
        setGateLastChecked: (id, value) => {
          checked[id] = value
        },
        gateAttempts: (id) => attempts[id] ?? 0,
        setGateAttempts: (id, value) => {
          attempts[id] = value
        },
        actorEliminated: () => false,
        announce: () => {},
        queueCard: () => {},
        setPendingDecision: () => {},
      })

    pass(2)
    pass(3)
    pass(4)
    assert.deepEqual(context.scopes, [0, 1, 2])
    assert.equal(context.applied, true)
  })

  test('normalization preserves only the declared event model', () => {
    const waiting = toyMap.events[1]
    assert.equal(waiting.id, 'event.waiting')
    assert.equal(waiting.presentation, undefined)
    assert.deepEqual(waiting.retry, retry.forever)
    assert.equal(toyEngine.conditionsPass(waiting.id, { open: true, effects: [] }), true)
  })

  test('dispatch runs outcomes once and retries a named gate once per round', () => {
    const runtime = harness()
    runtime.pass(1)
    runtime.pass(1)
    assert.deepEqual(runtime.context.effects, ['seed'])
    assert.equal(runtime.attempts['event.waiting'], 1)
    assert.ok(!runtime.fired.has('event.waiting'))

    runtime.context.open = true
    runtime.pass(2)
    assert.deepEqual(runtime.context.effects, ['seed', 'waiting'])
    assert.ok(runtime.fired.has('event.waiting'))
  })

  test('decisions defer on AI turns and apply only the selected branch', () => {
    const runtime = harness()
    runtime.context.open = true
    runtime.pass(2, false)
    assert.equal(runtime.decision(), null)
    assert.ok(!runtime.fired.has('event.decision'))

    runtime.pass(2, true)
    const pending = runtime.decision()
    assert.equal(pending?.id, 'event.decision')
    assert.ok(resolveEventChoice(toyMap, pending!, 'right', runtime.context))
    assert.deepEqual(runtime.context.effects, ['seed', 'waiting', 'right'])
    assert.equal(resolveEventChoice(toyMap, pending!, 'missing', runtime.context), false)
  })

  test('invalid maps fail early with useful diagnostics', () => {
    assert.throws(
      () =>
        defineEventMap({ id: 'bad', title: 'Bad map' }, [
          { id: 'event.same', title: 'One', round: 1 },
          { id: 'event.same', title: 'Two', round: 2 },
        ]),
      /Duplicate event id/,
    )
    assert.throws(
      () =>
        defineEventMap({ id: 'bad-dependency', title: 'Bad dependency' }, [
          {
            id: 'event.only',
            title: 'Only',
            round: 1,
            conditions: [condition('only.gate', 'Impossible dependency', () => true, ['event.missing'])],
          },
        ]),
      /unknown event/,
    )
    assert.throws(
      () =>
        defineEventMap({ id: 'no-calendar', title: 'No calendar' }, [
          { id: 'event.dated', title: 'Dated', at: eventDate(2000, 1) },
        ]),
      /Invalid schedule/,
    )
    assert.throws(
      () =>
        defineEventMap({ id: 'two-schedules', title: 'Two schedules' }, [
          { id: 'event.overdefined', title: 'Overdefined', round: 1, at: eventDate(2000, 1) },
        ]),
      /exactly one/,
    )
  })
})

describe('Mermaid serialization', () => {
  test('draws events, gates, dependencies, outcomes and choices', () => {
    const source = eventMapToMermaid(toyMap, { selectedEvent: 'event.waiting' })
    assert.match(source, /^flowchart LR/)
    assert.match(source, /The route is open/)
    assert.match(source, /gate_event_waiting_waiting_open -->\|yes\| event_event_waiting/)
    assert.match(source, /gate_event_waiting_waiting_open -->\|no · next round\| gate_event_waiting_waiting_open/)
    assert.match(source, /enables/)
    assert.match(source, /Write waiting state/)
    assert.match(source, /Take the right road/)
    assert.match(source, /class event_event_waiting selected/)
  })

  test('can emit a focused event subset without dangling dependency edges', () => {
    const source = eventMapToMermaid(toyMap, { eventIds: ['event.waiting'] })
    assert.match(source, /Waiting event/)
    assert.doesNotMatch(source, /Seed event/)
    assert.doesNotMatch(source, /enables/)
  })
})

describe('campaign registry metadata', () => {
  test('the game and admin share the exact same event objects', () => {
    assert.equal(CAMPAIGN_EVENT_MAP.events, HISTORICAL_EVENTS)
  })

  test('every campaign event is diagrammable and every executable rule is named', () => {
    const calendar = CAMPAIGN_EVENT_MAP.calendar
    assert.ok(calendar, 'the campaign map must own its calendar')
    for (const event of HISTORICAL_EVENTS) {
      assert.ok(event.title, `${event.id} has no admin title`)
      assert.ok(event.at, `${event.id} bypasses the calendar with a hard-coded round`)
      assert.equal(event.round, roundForDate(calendar!, event.at!), `${event.id} has a non-derived round`)
      for (const eventCondition of event.conditions ?? []) {
        assert.ok(eventCondition.id && eventCondition.label, `${event.id} has an unnamed gate`)
        assert.equal(typeof eventCondition.test, 'function')
      }
      for (const eventOutcome of event.outcomes ?? []) {
        assert.ok(eventOutcome.id && eventOutcome.label, `${event.id} has an unnamed outcome`)
        assert.equal(typeof eventOutcome.apply, 'function')
      }
    }
  })

  test('campaign timing and parameters are queried through the engine', () => {
    assert.equal(CAMPAIGN_EVENTS.round('event.sivasCongress'), 3)
    assert.equal(CAMPAIGN_EVENTS.value('event.tbmm', 'fallbackAfterAttempts'), 3)
    assert.deepEqual(CAMPAIGN_EVENTS.event('event.istanbulOccupied').retry, retry.window(3))
    assert.ok(!('rounds' in CAMPAIGN_EVENTS), 'the engine must not expose a campaign-shaped rounds bag')
    assert.ok(!('values' in CAMPAIGN_EVENTS), 'the engine must not expose a campaign-shaped values bag')
  })

  test('the complete campaign graph contains every event', () => {
    const source = eventMapToMermaid(CAMPAIGN_EVENT_MAP)
    for (const event of HISTORICAL_EVENTS)
      assert.match(source, new RegExp(event.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })

  test('the admin graph is generated directly from the campaign JSON', () => {
    const source = declarativeCampaignToMermaid(CAMPAIGN_DOCUMENT)
    assert.equal(source, declarativeCampaignToMermaid(loadDeclarativeCampaign(campaignDocument)))
    assert.match(source, /Grand National Assembly<br\/>Round 5 · 23 Apr 1920/)
    assert.match(source, /condition_event_tbmm_when_[^ ]+ -->\|yes\| event_event_tbmm/)
    assert.match(source, /condition_event_tbmm_when_[^ ]+ -->\|no\| effect_event_tbmm_retry_wait/)
    assert.match(source, /effect_event_tbmm_retry_wait -->\|retry\| condition_event_tbmm_when_/)
    assert.match(source, /Still inside 3-round retry window\?/)
    for (const event of campaignDocument.events)
      assert.match(source, new RegExp(event.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  })

  test('the JSON graph includes executable inputs, conditions, writes, effects and reactive rules', () => {
    const assembly = declarativeCampaignToMermaid(CAMPAIGN_DOCUMENT, {
      eventIds: ['event.tbmm'],
      selectedEvent: 'event.tbmm',
    })
    assert.match(assembly, /Parameters<br\/>fallbackAfterAttempts ← 3/)
    assert.match(assembly, /Card bindings<br\/>date ← \$presentation\.currentDate/)
    assert.match(assembly, /Ankara held by Turkey/)
    assert.match(assembly, /Set variables/)
    assert.match(assembly, /variables\.assembly\.active<br\/>← true/)
    assert.match(assembly, /rule\.assembly\.suspend/)
    assert.match(assembly, /variables\.assembly\.active<br\/>← false/)
    assert.match(assembly, /rule\.reinforcements\.turkey-foundation/)
    assert.doesNotMatch(assembly, /rule\.turn\.clear-armenian-remobilization/)
    assert.match(assembly, /Set<br\/>result\.value/)
    assert.match(assembly, /\(\["MAXIMUM OF"\]\)/)
    assert.match(assembly, /\(\["ROUND DOWN"\]\)/)
    assert.match(assembly, /\(\["DIVIDE"\]\)/)
    assert.match(assembly, /\{"variables\.assembly\.active"\}/)
    assert.match(assembly, /-->\|then\|/)
    assert.match(assembly, /-->\|else\|/)
    assert.doesNotMatch(assembly, /IF \/ ELSE/)
    assert.match(assembly, /classDef formula/)
    assert.doesNotMatch(assembly, /result\.value ← \$max/)

    const complete = declarativeCampaignToMermaid(CAMPAIGN_DOCUMENT, { selectedEvent: 'event.tbmm' })
    assert.match(complete, /Update territories/)
    assert.match(complete, /Draw cards/)
  })

  test('Sèvres renders one reinforcement rule with explicit shock and hardening branches', () => {
    const sevres = declarativeCampaignToMermaid(CAMPAIGN_DOCUMENT, {
      eventIds: ['event.sevres'],
      selectedEvent: 'event.sevres',
    })
    assert.equal((sevres.match(/rule\.reinforcements\.sevres<br\/>/g) ?? []).length, 1)
    assert.doesNotMatch(sevres, /sevres-shock|sevres-hardening/)
    assert.match(sevres, /variables\.sevres\.shockUntil/)
    assert.match(sevres, /game\.round &lt; \$variables\.sevres\.shockUntil/)
    assert.match(sevres, /-->\|then\|/)
    assert.match(sevres, /-->\|else\|/)
  })

  test('the JSON graph renders when clauses as an ordered decision flow', () => {
    const ethem = declarativeCampaignToMermaid(CAMPAIGN_DOCUMENT, {
      eventIds: ['event.ethem'],
      selectedEvent: 'event.ethem',
    })
    assert.match(ethem, /\{"variables\.assembly\.active"\}/)
    assert.match(
      ethem,
      /\{"At least one territory satisfies all:<br\/>Is one of westernProvinces<br\/>\(Balikesir, Usak, Eskisehir, Kutahya, Sakarya, Izmir, Aydin\)<br\/>Held by Turkey<br\/>Has more than 1 troop"\}/,
    )
    assert.match(ethem, /condition_event_ethem_when_when_0_[^ ]+ -->\|yes\| condition_event_ethem_when_when_1_/)
    assert.match(ethem, /condition_event_ethem_when_when_1_[^ ]+ -->\|yes\| event_event_ethem/)
    assert.match(ethem, /condition_event_ethem_when_when_0_[^ ]+ -->\|no\| miss_event_ethem_gate_failed/)
    assert.match(ethem, /condition_event_ethem_when_when_1_[^ ]+ -->\|no\| miss_event_ethem_gate_failed/)
    assert.doesNotMatch(ethem, /When:/)
  })

  test('bounded updates render as decisions instead of arithmetic expression trees', () => {
    const greekOffensive = declarativeCampaignToMermaid(CAMPAIGN_DOCUMENT, {
      eventIds: ['event.greekOffensive'],
      selectedEvent: 'event.greekOffensive',
    })
    assert.match(greekOffensive, /\{"\$entrenched &lt; 6\?"\}/)
    assert.match(greekOffensive, /\["Add 1 entrenchment"\]/)
    assert.match(greekOffensive, /\(\["Skip"\]\)/)
    assert.match(
      greekOffensive,
      /condition_event_greekOffensive_then_[^ ]+ -->\|yes\| write_event_greekOffensive_then_/,
    )
    assert.match(greekOffensive, /condition_event_greekOffensive_then_[^ ]+ -->\|no\| miss_event_greekOffensive_then_/)
    assert.doesNotMatch(greekOffensive, /MINIMUM OF/)
  })

  test('ordered gates restart from their first decision on retry', () => {
    const venizelos = declarativeCampaignToMermaid(CAMPAIGN_DOCUMENT, {
      eventIds: ['event.tbmm', 'event.venizelos'],
      selectedEvent: 'event.venizelos',
    })
    const assembly = venizelos.match(/(condition_event_venizelos_when_[^ ]+)\{"variables\.assembly\.active"\}/)
    const ankara = venizelos.match(/(condition_event_venizelos_when_[^ ]+)\{"Ankara not held by Greece"\}/)
    assert.ok(assembly)
    assert.ok(ankara)
    assert.ok(venizelos.includes('event_event_tbmm -. enables .-> ' + assembly[1]))
    assert.ok(venizelos.includes(`${assembly[1]} -->|yes| ${ankara[1]}`))
    assert.ok(venizelos.includes(`${ankara[1]} -->|yes| event_event_venizelos`))
    assert.ok(venizelos.includes(`${assembly[1]} -->|no| effect_event_venizelos_retry_wait`))
    assert.ok(venizelos.includes(`${ankara[1]} -->|no| effect_event_venizelos_retry_wait`))
    assert.ok(venizelos.includes(`effect_event_venizelos_retry_wait -->|retry| ${assembly[1]}`))
    assert.match(venizelos, /effect_event_venizelos_retry_wait\["Wait until next turn"\]/)
    assert.doesNotMatch(venizelos, /\(\["ALL"\]\)/)
  })

  test('focused dependency events stay collapsed instead of donating their gates', () => {
    const kars = declarativeCampaignToMermaid(CAMPAIGN_DOCUMENT, {
      eventIds: ['event.tbmm', 'event.alexandropol', 'event.karsTreaty'],
      expandedEventIds: ['event.karsTreaty'],
      selectedEvent: 'event.karsTreaty',
    })
    assert.match(kars, /Grand National Assembly<br\/>Round 5/)
    assert.match(kars, /Treaty of Alexandropol<br\/>Round 8/)
    assert.match(kars, /Treaty of Kars<br\/>Round 11/)
    assert.match(kars, /\{"variables\.assembly\.active"\}/)
    assert.match(kars, /\{"variables\.treaties\.alexandropol\.signed"\}/)
    assert.match(kars, /\{"Turkey attacks Armenia"\}/)
    assert.doesNotMatch(kars, /fallbackAfterAttempts/)
    assert.doesNotMatch(kars, /factions\.Armenia\.territoryCount/)
    assert.doesNotMatch(kars, /alexandropol\.signed<br\/>Armenia makes peace/)
  })

  test('retrying decisions show their pass and retry paths', () => {
    const lloydGeorge = declarativeCampaignToMermaid(CAMPAIGN_DOCUMENT, {
      eventIds: ['event.lloydGeorge'],
      selectedEvent: 'event.lloydGeorge',
    })
    const decision = lloydGeorge.match(/(condition_event_lloydGeorge_when_[^ ]+)\{"factions\.Britain\.territoryCount/)
    assert.ok(decision)
    assert.ok(lloydGeorge.includes(`${decision[1]} -->|yes| event_event_lloydGeorge`))
    assert.ok(lloydGeorge.includes(`${decision[1]} -->|no| effect_event_lloydGeorge_retry_wait`))
    assert.ok(lloydGeorge.includes(`effect_event_lloydGeorge_retry_wait -->|retry| ${decision[1]}`))
    assert.match(lloydGeorge, /effect_event_lloydGeorge_retry_wait\["Wait until next turn"\]/)
    assert.doesNotMatch(lloydGeorge, /Retries indefinitely/)
    assert.match(lloydGeorge, /trigger input · faction = &quot;Britain&quot;/)
    assert.match(lloydGeorge, /\{"trigger input · peaceBroken"\}/)
    assert.doesNotMatch(lloydGeorge, /trigger input · peaceBroken = false/)
    assert.doesNotMatch(lloydGeorge, /action\.faction =/)
    assert.match(lloydGeorge, /\. affects \.->/)
  })

  test('boolean decisions put their value on yes/no branches, not in their labels', () => {
    const sanRemo = declarativeCampaignToMermaid(CAMPAIGN_DOCUMENT, {
      eventIds: ['event.sanRemo'],
      selectedEvent: 'event.sanRemo',
    })
    const completed = sanRemo.match(
      /(condition_event_sanRemo_rule_rule_attack_san_remo_thrace_[^ ]+)\{"variables\.sanRemo\.completed"\}/,
    )
    assert.ok(completed)
    assert.ok(sanRemo.includes(`${completed[1]} -->|no| rule_event_sanRemo_rule_attack_san_remo_thrace`))
    assert.match(sanRemo, /\{"Bulgaria attacks Greece"\}/)
    assert.doesNotMatch(sanRemo, /trigger input · (?:attacker|defender)/)
    assert.doesNotMatch(sanRemo, /target\.slug exists/)
    assert.doesNotMatch(sanRemo, /sanRemo\.completed (?:=|≠) true/)
    for (const id of [
      'rule.attack.national-pact-restraint',
      'rule.attack.san-remo-thrace',
      'rule.kars-confines-armenia',
    ]) {
      const rule = CAMPAIGN_DOCUMENT.rules?.find((candidate) => candidate.id === id)
      assert.equal(rule?.on, 'attack.target.validate')
      assert.doesNotMatch(JSON.stringify(rule?.when), /\$exists/)
    }
  })
})
