import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { gameOutcome } from '../src/game/outcome'
import { t, setLang, getLang } from '../src/i18n'
import { chooseEvent, fresh, give, faction, turkey, PACT, upkeep } from './helpers'

const asLang = (lang: 'en' | 'tr', fn: () => void) => {
  const before = getLang()
  setLang(lang)
  try {
    fn()
  } finally {
    setLang(before)
  }
}

const holdPact = (g: Game, count = PACT.length) => {
  let held = 0
  for (const slug of PACT) {
    if (held >= count) break
    give(g, slug, turkey(g))
    held++
  }
  // push the rest to an occupier so the count is exact
  for (const slug of PACT.slice(count)) if (g.bySlug[slug].faction === turkey(g)) give(g, slug, faction(g, 'Greece'))
  return g
}

describe('outcome', () => {
  test('is null while the war is running', () => {
    assert.equal(gameOutcome(fresh()), null)
  })

  test('completing the Pact does NOT end the war on its own — it must be held', () => {
    const g = fresh()
    g.turn.configure({ round: 12 })
    holdPact(g)
    g.checkGameEnd()
    assert.equal(g.turn.phase, 'reinforce', 'the war goes on until the peace is signed')
    assert.equal(gameOutcome(g), null)
  })

  test('holding it for three turns brings the conference and the win', () => {
    const g = fresh()
    g.turn.configure({ round: 12 })
    holdPact(g)
    upkeep(g)
    assert.equal(g.turn.phase, 'reinforce', 'one turn is not holding it')
    upkeep(g)
    assert.equal(g.turn.phase, 'reinforce')
    upkeep(g)
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.victory.title')
  })

  test('taking the whole map is a different ending', () => {
    const g = fresh()
    g.turn.configure({ round: 16 })
    for (const t2 of g.territories) if (t2.faction !== turkey(g)) give(g, t2.slug, turkey(g))
    g.checkGameEnd()
    assert.equal(g.totalConquest, true)
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.total.title')
  })

  test('meeting the Pact and stopping there is the ordinary victory', () => {
    const g = fresh()
    g.turn.configure({ round: 12 })
    holdPact(g)
    for (const t of [...turkey(g).territories]) if (!PACT.includes(t.slug)) give(g, t.slug, faction(g, 'Greece'))
    for (let i = 0; i < 3; i++) upkeep(g)
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.victory.title')
  })

  test('going past the border without taking the map is its own ending', () => {
    const g = fresh()
    g.turn.configure({ round: 12 })
    holdPact(g)
    give(g, 'aleppo', turkey(g))
    give(g, 'sofia', turkey(g))
    for (let i = 0; i < 3; i++) upkeep(g)
    assert.equal(g.totalConquest, false, 'nowhere near the whole map')
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.beyond.title')
  })

  test('and it names every province that was annexed', () => {
    const g = fresh()
    g.turn.configure({ round: 12 })
    holdPact(g)
    for (const t of [...turkey(g).territories]) if (!PACT.includes(t.slug)) give(g, t.slug, faction(g, 'Greece'))
    for (const slug of ['sofia', 'plovdiv', 'aleppo']) give(g, slug, turkey(g))
    for (let i = 0; i < 3; i++) upkeep(g)
    asLang('tr', () => {
      const named = String(gameOutcome(g)?.vars.named)
      for (const name of ['Sofya', 'Filibe', 'Halep']) assert.ok(named.includes(name), `${name} is in the list`)
      // the last one is joined by a word, the way the language writes a list
      assert.ok(named.endsWith('Filibe ve Halep') || named.includes(' ve '), `written as a list: ${named}`)
      assert.ok(!named.includes(', ve '), 'and not with a comma before it')
    })
    asLang('en', () => assert.ok(String(gameOutcome(g)?.vars.named).includes(' and '), 'and "and" in English'))
  })

  test('the whole map is still Mutlak Zafer, above it', () => {
    const g = fresh()
    g.turn.configure({ round: 12 })
    for (const t of g.territories) if (t.faction !== turkey(g)) give(g, t.slug, turkey(g))
    g.checkGameEnd()
    assert.equal(g.totalConquest, true)
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.total.title')
  })

  test('elimination is defeat', () => {
    const g = fresh()
    g.turn.configure({ round: 9 })
    for (const t2 of [...turkey(g).territories]) give(g, t2.slug, faction(g, 'Greece'))
    g.checkGameEnd()
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.defeat.title')
    assert.equal(g.humanDefeated, true)
  })
})

describe('Lausanne grades what is left', () => {
  const settle = (held: number) => {
    const g = fresh()
    g.turn.configure({ round: 27 })
    holdPact(g, held)
    chooseEvent(g, 'event.conference', 'accept')
    return g
  }

  test('a complete Pact at the conference is a win', () => {
    const g = settle(PACT.length)
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.victory.title')
  })

  test('27 of 30 is the near miss', () => {
    const g = settle(27)
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.lausanne.near.title')
    assert.equal(gameOutcome(g)?.vars.held, 27)
    assert.equal(gameOutcome(g)?.vars.missing, 3)
  })

  test('half is a truncated peace', () => {
    const g = settle(18)
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.lausanne.partial.title')
  })

  test('under half is peace on their terms', () => {
    const g = settle(5)
    assert.equal(gameOutcome(g)?.titleKey, 'overlay.lausanne.poor.title')
  })

  test('the near miss names the provinces left behind', () => {
    const g = settle(27)
    const named = String(gameOutcome(g)?.vars.named)
    assert.ok(named.length > 0)
    assert.equal(named.split(',').length, 3)
  })

  test('the conference ends the game', () => {
    const g = settle(20)
    assert.equal(g.turn.phase, 'gameover')
    assert.equal(g.endedRound, 27)
  })
})

describe('ending copy', () => {
  test('quotes the date the war ended, in both languages', () => {
    const g = fresh()
    g.turn.configure({ round: 12 })
    holdPact(g)
    for (let i = 0; i < 3; i++) upkeep(g)
    asLang('en', () => {
      const out = gameOutcome(g)
      assert.ok(String(out?.vars.date).includes('February 1922'), String(out?.vars.date))
      assert.ok(t(out?.bodyKey as string, out?.vars).includes('February 1922'))
    })
    asLang('tr', () => {
      const out = gameOutcome(g)
      assert.equal(out?.vars.date, "Şubat 1922'de")
      assert.ok(t(out?.bodyKey as string, out?.vars).includes("Şubat 1922'de"))
    })
  })

  test('the date is re-rendered per language, not frozen at game over', () => {
    const g = fresh()
    g.turn.configure({ round: 18 })
    holdPact(g)
    for (let i = 0; i < 3; i++) upkeep(g) // three turns of holding it
    let english = ''
    let turkish = ''
    asLang('en', () => (english = String(gameOutcome(g)?.vars.date)))
    asLang('tr', () => (turkish = String(gameOutcome(g)?.vars.date)))
    assert.ok(english.includes('August'), english)
    assert.ok(turkish.includes('Ağustos'), turkish)
  })

  test('every ending resolves all of its placeholders', () => {
    const cases: [() => Game, string][] = [
      [
        () => {
          const g = fresh()
          g.turn.configure({ round: 12 })
          holdPact(g)
          for (let i = 0; i < 3; i++) upkeep(g)
          return g
        },
        'victory',
      ],
      [
        () => {
          const g = fresh()
          g.turn.configure({ round: 27 })
          holdPact(g, 27)
          chooseEvent(g, 'event.conference', 'accept')
          return g
        },
        'near',
      ],
      [
        () => {
          const g = fresh()
          g.turn.configure({ round: 27 })
          holdPact(g, 18)
          chooseEvent(g, 'event.conference', 'accept')
          return g
        },
        'partial',
      ],
      [
        () => {
          const g = fresh()
          g.turn.configure({ round: 27 })
          holdPact(g, 4)
          chooseEvent(g, 'event.conference', 'accept')
          return g
        },
        'poor',
      ],
      [
        () => {
          const g = fresh()
          g.turn.configure({ round: 12 })
          holdPact(g)
          give(g, 'sofia', turkey(g))
          for (let i = 0; i < 3; i++) upkeep(g)
          return g
        },
        'beyond',
      ],
      [
        () => {
          const g = fresh()
          g.turn.configure({ round: 16 })
          for (const t2 of g.territories) if (t2.faction !== turkey(g)) give(g, t2.slug, turkey(g))
          g.checkGameEnd()
          return g
        },
        'total',
      ],
    ]
    for (const lang of ['en', 'tr'] as const)
      asLang(lang, () => {
        for (const [build, label] of cases) {
          const out = gameOutcome(build())
          const title = t(out?.titleKey as string, out?.vars)
          const body = t(out?.bodyKey as string, out?.vars)
          assert.ok(!title.includes('{'), `${label} title has an unresolved placeholder in ${lang}: ${title}`)
          assert.ok(!body.includes('{'), `${label} body has an unresolved placeholder in ${lang}: ${body}`)
          assert.notEqual(title, out?.titleKey, `${label} title key is missing in ${lang}`)
        }
      })
  })
})
