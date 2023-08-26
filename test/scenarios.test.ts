import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game, { NATIONAL_PACT } from '../src/game/game'
import { fresh, give, faction, turkey, drive, entrenchTurkey, Fired } from './helpers'

const roundOfFirst = (fired: Fired[], key: string) => fired.find(f => f.key === key)?.round
const keys = (fired: Fired[]) => fired.map(f => f.key)

describe('the historical line, played end to end', () => {
  test('every event arrives on its own turn, in order, once', () => {
    const g = entrenchTurkey(fresh())
    // the conference sits at 18 and ends the war, so the pre-conference
    // timeline is what a normal campaign ever sees
    const fired = drive(g, 17)
    const expected: [string, number][] = [
      ['event.erzurumCongress', 2],
      ['event.sivasCongress', 3],
      ['event.tbmm', 5],
      ['event.sevres', 6],
      ['event.venizelos', 7],
      ['event.sovietAid1', 7],
      ['event.ethem', 8],
      ['event.alexandropol', 8],
      ['event.inonu', 9],
      ['event.sovietAid2', 9],
      ['event.tekalif', 10],
      ['event.italyWithdraws', 10],
      ['event.sakarya', 11],
      ['event.karsTreaty', 11],
      ['event.ankaraAgreement', 11],
      ['event.exhaustion', 14],
      ['event.greatOffensive', 14],
      ['event.lloydGeorge', 15],
      ['event.sultanate', 15],
      ['event.greekCollapse', 16],
      ['event.mubadele', 16]
    ]
    for (const [key, round] of expected) assert.equal(roundOfFirst(fired, key), round, `${key} fired late or not at all`)
    for (const [key] of expected) assert.equal(keys(fired).filter(k => k === key).length, 1, `${key} fired twice`)
  })

  test('the campaign leaves the expected cumulative state', () => {
    const g = entrenchTurkey(fresh())
    drive(g, 17)
    assert.equal(g.assemblyOpened, true, 'the Assembly sat and stayed')
    assert.equal(g.karsTreatySigned, true)
    assert.ok(g.sakaryaRound > 0, 'Sakarya was fought')
    assert.equal(g.britainStoodDown, true)
    assert.equal(g.greeceCollapsed, true)
    assert.equal(g.fortifyBonus, 1, 'the Sultanate was abolished')
    assert.ok(g.sevresRound > 0)
    assert.equal(g.bySlug['antalya'].faction.name, 'Turkey', 'Italy conceded')
    assert.equal(g.bySlug['adana'].faction.name, 'Turkey', 'France conceded Cilicia')
    assert.equal(g.bySlug['aleppo'].faction.name, 'France', 'but kept Aleppo')
  })

  test('and ends at the conference in the summer of 1923', () => {
    const g = entrenchTurkey(fresh())
    drive(g, 30)
    assert.equal(g.phase, 'gameover')
    assert.equal(g.endedRound, 18, 'terms are signed the round they are offered')
    assert.ok(g.outcome?.titleKey.startsWith('overlay.lausanne'), g.outcome?.titleKey)
  })
})

describe('scenario: Ankara falls early', () => {
  test('the Assembly waits, retreats to Sivas, and everything downstream shifts with it', () => {
    const g = entrenchTurkey(fresh())
    give(g, 'ankara', faction(g, 'Greece'), 1)
    g.bySlug['ankara'].troops = 400
    const fired = drive(g, 14)
    // Ankara is looked at on rounds 5, 6 and 7; the third failure and the Sivas
    // fallback both land in round 7, because every seat re-evaluates the gate.
    assert.equal(roundOfFirst(fired, 'event.tbmm'), 7, 'Sivas takes it once Ankara has had three looks')
    assert.equal(g.assemblyOpened, true)
    // Tekâlif and Sakarya both need Ankara itself, so they never happen
    assert.ok(!keys(fired).includes('event.tekalif'), 'no requisition without the capital')
    assert.ok(!keys(fired).includes('event.sakarya'), 'no battle for a city you do not hold')
    // but events that only need a government still arrive on time
    assert.equal(roundOfFirst(fired, 'event.karsTreaty'), 11)
    assert.equal(roundOfFirst(fired, 'event.greatOffensive'), 14)
  })

  test('İnönü slips but does not drift out of its era', () => {
    const g = entrenchTurkey(fresh())
    give(g, 'ankara', faction(g, 'Greece'), 1)
    g.bySlug['ankara'].troops = 400
    const fired = drive(g, 20)
    // the Assembly convenes at 8, so İnönü's three attempts run 9, 10, 11
    const inonu = roundOfFirst(fired, 'event.inonu')
    if (inonu !== undefined) assert.ok(inonu <= 11, `İnönü fired at ${inonu}`)
  })
})

describe('scenario: the government is driven out mid-war', () => {
  test('the economy collapses, the offensive waits, and both return together', () => {
    const g = entrenchTurkey(fresh())
    const greece = faction(g, 'Greece')
    let levyWithGovernment = 0
    let levySuspended = 0

    const fired = drive(g, 20, {
      onRound: game => {
        if (game.round === 9) levyWithGovernment = game.reinforcementsFor(turkey(game))
        if (game.round === 10) {
          // the seats fall
          give(game, 'ankara', greece, 10)
          give(game, 'sivas', greece, 10)
          game.bySlug['ankara'].troops = 400
          game.bySlug['sivas'].troops = 400
        }
        if (game.round === 12) levySuspended = game.reinforcementsFor(turkey(game))
        if (game.round === 15) {
          give(game, 'sivas', turkey(game), 15)
          game.bySlug['sivas'].troops = 400
        }
      }
    })

    assert.ok(levyWithGovernment > 0 && levySuspended > 0)
    assert.ok(levySuspended < levyWithGovernment, 'losing both seats must cost the economy')
    const taarruz = roundOfFirst(fired, 'event.greatOffensive')
    assert.ok(taarruz !== undefined && taarruz > 14, `the offensive should wait, fired at ${taarruz}`)
    assert.equal(g.assemblyOpened, true, 'and the Assembly is back by the end')
  })

  test('a treaty already signed survives the collapse', () => {
    const g = entrenchTurkey(fresh())
    const greece = faction(g, 'Greece')
    drive(g, 12, {
      onRound: game => {
        if (game.round === 12) {
          give(game, 'ankara', greece, 12)
          give(game, 'sivas', greece, 12)
        }
      }
    })
    assert.equal(g.karsTreatySigned, true, 'Kars was signed at 11 and stays signed')
  })
})

describe('scenario: Greece runs away with it', () => {
  test('an ascendant Greece keeps its army, its prime minister and the occupation alive', () => {
    const g = entrenchTurkey(fresh())
    const greece = faction(g, 'Greece')
    // hand Greece enough land to double its start, leaving the seats alone
    for (const t of [...turkey(g).territories]) {
      if (greece.territories.length >= 14) break
      if (t.slug === 'ankara' || t.slug === 'sivas') continue
      give(g, t.slug, greece, 1)
      t.troops = 400
    }
    const fired = drive(g, 20)
    assert.ok(!keys(fired).includes('event.greekCollapse'), 'a winning army does not collapse')
    assert.ok(!keys(fired).includes('event.exhaustion'), 'and the occupation is not untenable')
    assert.equal(g.greeceCollapsed, false)
  })

  test('pushing them back sets off the whole chain, late', () => {
    const g = entrenchTurkey(fresh())
    const greece = faction(g, 'Greece')
    const taken: string[] = []
    for (const t of [...turkey(g).territories]) {
      if (greece.territories.length >= 14) break
      if (t.slug === 'ankara' || t.slug === 'sivas') continue
      give(g, t.slug, greece, 1)
      t.troops = 400
      taken.push(t.slug)
    }
    const fired = drive(g, 26, {
      onRound: game => {
        if (game.round !== 18) return
        // Greece keeps growing on its own levy, so take back whatever it needs
        // to drop below double its start
        const greeks = game.factions.find(f => f.name === 'Greece') as typeof greece
        for (const t of [...greeks.territories]) {
          if (greeks.territories.length < 14) break
          if (!taken.includes(t.slug)) continue
          give(game, t.slug, turkey(game), 18)
          t.troops = 400
        }
        while (greeks.territories.length >= 14) {
          const spare = greeks.territories.find(t => t.slug !== 'salonica')
          if (!spare) break
          give(game, spare.slug, turkey(game), 18)
          spare.troops = 400
        }
      }
    })
    const collapse = roundOfFirst(fired, 'event.greekCollapse')
    const exhaustion = roundOfFirst(fired, 'event.exhaustion')
    assert.ok(collapse !== undefined && collapse >= 18, `collapse fired at ${collapse}`)
    assert.ok(exhaustion !== undefined && exhaustion >= 18, `exhaustion fired at ${exhaustion}`)
  })
})

describe('scenario: the requisition window', () => {
  test('opens, boosts, costs, and closes on schedule', () => {
    const g = entrenchTurkey(fresh())
    const levies: Record<number, number> = {}
    drive(g, 15, {
      orders: true,
      onRound: game => {
        levies[game.round] = game.reinforcementsFor(turkey(game))
      }
    })
    assert.equal(g.requisitionUntil, 12, 'proclaimed at 10, runs through 12')
    assert.ok(levies[11] < levies[13], 'the levy is depressed while the orders stand')
  })

  test('declining leaves the levy alone', () => {
    const a = entrenchTurkey(fresh())
    const b = entrenchTurkey(fresh())
    const levyA: Record<number, number> = {}
    const levyB: Record<number, number> = {}
    drive(a, 12, { orders: true, onRound: g => (levyA[g.round] = g.reinforcementsFor(turkey(g))) })
    drive(b, 12, { orders: false, onRound: g => (levyB[g.round] = g.reinforcementsFor(turkey(g))) })
    assert.ok(levyA[11] < levyB[11], 'the orders cost reinforcements the decline does not')
    assert.equal(b.requisitionUntil, 0)
  })
})

describe('scenario: İstanbul changes hands twice', () => {
  test('taken early, lost to the occupation, then returned at Mudanya', () => {
    const g = entrenchTurkey(fresh())
    // hold the city and both sides of the Straits from the outset
    for (const slug of ['istanbul', 'izmit', 'gelibolu', 'canakkale']) {
      give(g, slug, turkey(g), 1)
      g.bySlug[slug].troops = 400
    }
    const handBefore = turkey(g).hand.length
    const fired = drive(g, 16)

    // 1920: the Allies take the capital by force, and it costs them a card
    assert.equal(roundOfFirst(fired, 'event.istanbulOccupied'), 5)
    assert.ok(turkey(g).hand.length > handBefore, 'the occupation hands Ankara a card')

    // 1922: with the Straits in Turkish hands, Britain gives the city up
    assert.equal(roundOfFirst(fired, 'event.mudanya'), 15)
    assert.equal(g.bySlug['istanbul'].faction.name, 'Turkey', 'and it comes back without a fight')
  })

  test('retaking İstanbul yourself blocks Mudanya entirely', () => {
    const g = entrenchTurkey(fresh())
    for (const slug of ['izmit', 'gelibolu', 'canakkale']) {
      give(g, slug, turkey(g), 1)
      g.bySlug[slug].troops = 400
    }
    // let the occupation happen, then storm the city rather than wait for terms
    const fired = drive(g, 16, {
      onRound: game => {
        if (game.round === 8 && game.bySlug['istanbul'].faction.name !== 'Turkey') {
          give(game, 'istanbul', turkey(game), 8)
          game.bySlug['istanbul'].troops = 400
        }
      }
    })
    assert.equal(g.bySlug['istanbul'].faction.name, 'Turkey')
    assert.ok(!keys(fired).includes('event.mudanya'), 'there is nothing left for Britain to concede')
  })
})

describe('scenario: the Mosul question decides the ending', () => {
  test('signing at the conference short of Musul lands the near-miss card', () => {
    const g = entrenchTurkey(fresh())
    for (const slug of NATIONAL_PACT) {
      if (slug === 'mosul') continue
      give(g, slug, turkey(g), 1)
      g.bySlug[slug].troops = 400
    }
    drive(g, 30)
    assert.equal(g.phase, 'gameover')
    assert.equal(g.endedRound, 18)
    assert.equal(g.outcome?.titleKey, 'overlay.lausanne.near.title')
    assert.equal(g.outcome?.vars.held, 29)
  })

  test('refusing keeps the war alive long enough for the League to award Musul', () => {
    const g = entrenchTurkey(fresh())
    for (const slug of NATIONAL_PACT) {
      if (slug === 'mosul') continue
      give(g, slug, turkey(g), 1)
      g.bySlug[slug].troops = 400
    }
    const fired = drive(g, 24, { terms: 'reject' })
    assert.ok(g.rejectedAt > 0, 'terms were refused')
    assert.equal(roundOfFirst(fired, 'event.mosulQuestion'), 23)
    assert.equal(g.bySlug['mosul'].faction.name, 'Iraq')
  })

  test('taking Musul before 1924 keeps the road to victory open', () => {
    const g = entrenchTurkey(fresh())
    for (const slug of NATIONAL_PACT) {
      give(g, slug, turkey(g), 1)
      g.bySlug[slug].troops = 400
    }
    drive(g, 30)
    assert.equal(g.bySlug['mosul'].faction.name, 'Turkey')
    assert.equal(g.phase, 'gameover')
    assert.equal(g.outcome?.titleKey, 'overlay.victory.title')
  })
})

describe('scenario: a war interrupted by a save', () => {
  test('resuming mid-campaign produces the same remaining events', () => {
    const a = entrenchTurkey(fresh())
    const firstHalf = drive(a, 12)
    const snapshot = JSON.parse(JSON.stringify(a.serialize()))

    const restored = new Game()
    restored.restore(snapshot)
    const resumed = drive(restored, 20)

    // events already seen before the save must not repeat after it
    for (const { key } of firstHalf) assert.ok(!keys(resumed).includes(key), `${key} replayed after loading`)
    // the campaign genuinely continues rather than stalling
    assert.ok(restored.round > a.round, 'the resumed game advanced')
    // and the events that belong to the second half do arrive
    for (const key of ['event.exhaustion', 'event.greatOffensive'])
      assert.ok(keys(resumed).includes(key), `${key} was lost across the save boundary`)
  })
})

describe('scenario: breaking a peace you were offered', () => {
  test('attacking Italy early does NOT stop the evacuation — there is no peace to break yet', () => {
    const g = entrenchTurkey(fresh())
    const italy = faction(g, 'Italy')
    const fired = drive(g, 12, {
      onRound: game => {
        if (game.round !== 9) return
        assert.equal(game.atPeace(italy), false, 'Italy only settles at round 10')
        const own = turkey(game).territories.find(t => t.adjacent.some(a => a.faction === italy))
        const target = own?.adjacent.find(a => a.faction === italy)
        if (!own || !target) return
        game.phase = 'attack'
        game.currentPlayerIndex = game.players.findIndex(p => p.isHuman)
        target.troops = 1
        game.beginAttack(own.slug, target.slug)
        game.attack(own.slug, target.slug)
        game.phase = 'fortify'
      }
    })
    assert.equal(italy.peaceBroken, false, 'you cannot void a peace that has not been made')
    assert.ok(keys(fired).includes('event.italyWithdraws'))
    assert.equal(g.bySlug['isparta'].faction.name, 'Turkey', 'and the evacuation goes ahead')
  })

  test('the concession is applied before any seat can act on the round it lands', () => {
    // Italy settles and evacuates on the same round, and startTurn runs the
    // concession before the player gets a phase — so applyWithdrawals' guard for
    // a broken peace cannot be reached in ordinary play.
    const g = entrenchTurkey(fresh())
    const italy = faction(g, 'Italy')
    drive(g, 10, {
      onRound: game => {
        if (game.round !== 10) return
        assert.equal(game.atPeace(italy), true, 'now at peace')
        assert.equal(italy.territories.length, 0, 'and already evacuated, before anyone moves')
      }
    })
  })

  test('France cedes Cilicia on schedule and keeps Aleppo', () => {
    const g = entrenchTurkey(fresh())
    drive(g, 13)
    assert.equal(g.bySlug['aleppo'].faction.name, 'France')
    for (const slug of ['adana', 'maras', 'hatay']) assert.equal(g.bySlug[slug].faction.name, 'Turkey', slug)
  })

  test('a provoked Armenia mobilises again but still cannot cross the Kars line', () => {
    const g = entrenchTurkey(fresh())
    const armenia = faction(g, 'Armenia')
    // the treaty protects Turkish soil, so take the border provinces first
    for (const slug of ['kars', 'igdir'])
      if (g.bySlug[slug].faction.name !== 'Turkey') {
        give(g, slug, turkey(g), 1)
        g.bySlug[slug].troops = 400
      }
    drive(g, 12)
    assert.equal(g.karsTreatySigned, true)
    assert.equal(g.reinforcementsFor(armenia), 0, 'Gümrü demobilised them')
    armenia.peaceBroken = true
    assert.ok(g.reinforcementsFor(armenia) > 0, 'breaking the peace puts them back in the field')
    for (const slug of ['kars', 'igdir', 'erzurum', 'van', 'trabzon'])
      assert.equal(g.frontClosed(armenia, g.bySlug[slug]), true, `${slug} stays shut by treaty`)
  })
})

describe('scenario: Sakarya and what follows', () => {
  test('freeze, permanent dice cap, then the collapse', () => {
    const g = entrenchTurkey(fresh())
    const greece = faction(g, 'Greece')
    const frozenOn: number[] = []
    const fired = drive(g, 18, {
      onRound: game => {
        if (game.frozen(greece)) frozenOn.push(game.round)
      }
    })
    assert.equal(roundOfFirst(fired, 'event.sakarya'), 11)
    assert.deepEqual(frozenOn, [11, 12], 'the battle round and the one after it')
    // the cap outlives the freeze
    const greek = g.territories.find(t => t.faction === greece && t.adjacent.some(a => a.faction === turkey(g)))
    const target = greek?.adjacent.find(a => a.faction === turkey(g))
    if (greek && target) {
      g.round = 17
      assert.equal(g.diceCapsFor(greek, target).attacker, 2, 'still capped years later')
    }
    assert.equal(roundOfFirst(fired, 'event.greekCollapse'), 16)
  })
})

describe('scenario: the requisition and the militia clock', () => {
  test('the orders freeze militia growth, and it never comes back', () => {
    const g = entrenchTurkey(fresh())
    const sivas = g.bySlug['sivas']
    const readings: Record<number, number> = {}
    drive(g, 16, {
      orders: true,
      onRound: game => {
        readings[game.round] = sivas.entrenched
      }
    })
    // Congress pulses share this counter, so compare shape rather than absolutes.
    // entrench() runs as the round increments, before startTurn — so a reading
    // taken on round N already includes N's tick.
    assert.ok(readings[9] > 0, 'the militia clock is running before the orders')
    assert.equal(readings[12], readings[11], 'nothing is gained while the countryside is stripped')
    assert.ok(readings[13] > readings[12], 'and it resumes the round the window closes')
  })

  test('declining keeps the third tick on schedule', () => {
    const g = entrenchTurkey(fresh())
    const sivas = g.bySlug['sivas']
    const readings: Record<number, number> = {}
    drive(g, 14, { orders: false, onRound: game => (readings[game.round] = sivas.entrenched) })
    assert.ok(readings[13] > readings[10], 'the clock keeps running when the orders are declined')
  })
})

describe('scenario: Çerkes Ethem sets the west back', () => {
  test('the revolt halves garrisons and resets their dug-in progress', () => {
    const g = entrenchTurkey(fresh())
    const west = ['balikesir', 'usak', 'eskisehir', 'kutahya', 'sakarya']
    let before: Record<string, number> = {}
    drive(g, 9, {
      onRound: game => {
        if (game.round === 7) before = Object.fromEntries(west.map(s => [s, game.bySlug[s].troops]))
      }
    })
    const hit = west.filter(s => g.bySlug[s].troops < (before[s] ?? 0))
    assert.equal(hit.length, 3, 'half the western provinces, rounded up')
    for (const slug of hit) assert.equal(g.bySlug[slug].entrenched, 0, `${slug} lost its works`)
  })
})

describe('scenario: the war is lost', () => {
  test('losing both seats permanently costs the offensive and ends at a graded peace', () => {
    const g = entrenchTurkey(fresh())
    const greece = faction(g, 'Greece')
    give(g, 'ankara', greece, 1)
    give(g, 'sivas', greece, 1)
    g.bySlug['ankara'].troops = 400
    g.bySlug['sivas'].troops = 400
    const fired = drive(g, 30)
    assert.equal(g.assemblyOpened, false, 'no government ever sat')
    assert.ok(!keys(fired).includes('event.greatOffensive'), 'and so no offensive')
    assert.equal(g.phase, 'gameover')
    assert.ok(g.outcome?.titleKey.startsWith('overlay.lausanne'), g.outcome?.titleKey)
    assert.notEqual(g.outcome?.titleKey, 'overlay.victory.title')
  })

  test('being wiped off the map ends it immediately, long before Lausanne', () => {
    const g = entrenchTurkey(fresh())
    const greece = faction(g, 'Greece')
    drive(g, 20, {
      onRound: game => {
        if (game.round !== 8) return
        for (const t of [...turkey(game).territories]) give(game, t.slug, greece, 8)
        game.checkGameEnd()
      }
    })
    assert.equal(g.phase, 'gameover')
    assert.equal(g.humanDefeated, true)
    assert.equal(g.outcome?.titleKey, 'overlay.defeat.title')
    assert.ok((g.endedRound as number) < 27, 'the conference never sat')
  })
})

describe('scenario: the whole map', () => {
  test('taking everything ends the war on the absolute-victory card', () => {
    const g = entrenchTurkey(fresh())
    drive(g, 6)
    for (const t of g.territories) if (t.faction.name !== 'Turkey') give(g, t.slug, turkey(g), g.round)
    g.checkGameEnd()
    assert.equal(g.totalConquest, true)
    assert.equal(g.outcome?.titleKey, 'overlay.total.title')
  })
})

describe('scenario: Venizelos survives a Greek Ankara', () => {
  test('he stays while Greece holds the capital and falls once it is retaken', () => {
    const g = entrenchTurkey(fresh())
    const greece = faction(g, 'Greece')
    give(g, 'ankara', greece, 1)
    g.bySlug['ankara'].troops = 400
    const fired = drive(g, 14, {
      onRound: game => {
        if (game.round === 10) {
          give(game, 'ankara', turkey(game), 10)
          game.bySlug['ankara'].troops = 400
        }
      }
    })
    const venizelos = roundOfFirst(fired, 'event.venizelos')
    assert.ok(venizelos !== undefined && venizelos >= 10, `fell at ${venizelos}, should wait for Ankara`)
  })
})
