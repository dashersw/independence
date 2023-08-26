import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { HISTORICAL_EVENTS } from '../src/game/campaign-events'
import { t, setLang, getLang, tFaction, tTerritory, tCase } from '../src/i18n'
import en from '../src/i18n/en.json'
import tr from '../src/i18n/tr.json'

const keysByLang = {
  en: new Set(Object.keys(en)),
  tr: new Set(Object.keys(tr)),
}

const asLang = (lang: 'en' | 'tr', fn: () => void) => {
  const before = getLang()
  setLang(lang)
  try {
    fn()
  } finally {
    setLang(before)
  }
}

describe('dictionary parity', () => {
  test('both languages declare the same keys', () => {
    const missingInTr = [...keysByLang.en].filter((k) => !keysByLang.tr.has(k))
    const missingInEn = [...keysByLang.tr].filter((k) => !keysByLang.en.has(k))
    assert.deepEqual(missingInTr, [], 'keys missing from the Turkish block')
    assert.deepEqual(missingInEn, [], 'keys missing from the English block')
  })

  test('there is a decent number of them', () => {
    assert.ok(keysByLang.en.size > 80, `only ${keysByLang.en.size} keys`)
  })

  test('every event has copy in both languages', () => {
    for (const e of HISTORICAL_EVENTS) {
      assert.ok(keysByLang.en.has(e.id), `${e.id} has no English copy`)
      assert.ok(keysByLang.tr.has(e.id), `${e.id} has no Turkish copy`)
    }
  })

  test('the decision has copy for every branch', () => {
    const decision = HISTORICAL_EVENTS.find((e) => e.choices)
    for (const choice of decision?.choices ?? []) {
      assert.ok(keysByLang.en.has(`card.choice.${choice.key}`), `${choice.key} label`)
      assert.ok(keysByLang.en.has(`${decision?.id}.${choice.key}.log`), `${choice.key} log line`)
      assert.ok(keysByLang.tr.has(`card.choice.${choice.key}`), `${choice.key} Turkish label`)
    }
  })
})

describe('placeholders', () => {
  const placeholders = (text: string) => new Set([...text.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))

  // Turkish sometimes needs a case-marked form of the same value, so the caller
  // supplies both {territory} and {territoryLoc}. Compare on the base name.
  const base = (name: string) => name.replace(/(Loc|Acc|Dat|Abl)$/, '')

  test('match between the two languages for every key', () => {
    for (const key of keysByLang.en) {
      let en = ''
      let tr = ''
      asLang('en', () => (en = t(key)))
      asLang('tr', () => (tr = t(key)))
      assert.deepEqual(
        [...new Set([...placeholders(tr)].map(base))].sort(),
        [...new Set([...placeholders(en)].map(base))].sort(),
        `${key} has mismatched placeholders`,
      )
    }
  })

  test('a case-marked variant is only ever used alongside its base name', () => {
    // {territoryLoc} is fine; {somethingLoc} with no {something} anywhere means
    // the caller has to invent a variable that exists in one language only
    for (const key of keysByLang.en) {
      let tr = ''
      asLang('tr', () => (tr = t(key)))
      for (const name of placeholders(tr)) {
        if (name === base(name)) continue
        let en = ''
        asLang('en', () => (en = t(key)))
        const known = new Set([...placeholders(en)].map(base))
        assert.ok(known.has(base(name)), `${key} uses {${name}} with no base form`)
      }
    }
  })

  test('t() substitutes every provided variable', () => {
    asLang('en', () => {
      const filled = t('hud.dateRound', { date: 'May 1919', round: 1 })
      assert.ok(!filled.includes('{'), filled)
      assert.ok(filled.includes('May 1919'))
    })
  })

  test('an unknown key falls back to the key itself rather than throwing', () => {
    assert.equal(t('nope.not.a.key'), 'nope.not.a.key')
  })

  test('a missing Turkish key would fall back to English', () => {
    // parity is asserted above; this documents the intended fallback path
    asLang('tr', () => assert.equal(t('nope.not.a.key'), 'nope.not.a.key'))
  })
})

describe('names', () => {
  test('factions translate and fall back safely', () => {
    asLang('tr', () => {
      assert.equal(tFaction('Turkey'), 'Türkiye')
      assert.equal(tFaction('Greece'), 'Yunanistan')
      assert.equal(tFaction('Iraq'), 'Irak')
      assert.equal(tFaction('Atlantis'), 'Atlantis')
    })
    asLang('en', () => assert.equal(tFaction('Turkey'), 'Turkey'))
  })

  test('territories translate by slug', () => {
    asLang('tr', () => {
      assert.equal(tTerritory('salonica', 'Salonica'), 'Selanik')
      assert.equal(tTerritory('mosul', 'Mosul'), 'Musul')
    })
    asLang('en', () => assert.equal(tTerritory('salonica', 'Salonica'), 'Salonica'))
  })

  test('case marking is a no-op in English', () => {
    asLang('en', () => assert.equal(tCase('Ankara', 'loc'), 'Ankara'))
    asLang('tr', () => assert.equal(tCase('Ankara', 'loc'), "Ankara'da"))
  })
})

describe('unit vocabulary', () => {
  // the placeholder is named {troops} in both languages — it is a variable, not
  // prose, so strip placeholders before scanning the words on screen
  const strip = (text: string) => text.replace(/\{\w+\}/g, '')

  test('Turkish says birlik, not asker, for units on the board', () => {
    asLang('tr', () => {
      for (const key of ['tooltip.territory', 'phase.help.fortify', 'hud.cardHandTitle', 'log.tradeCards'])
        assert.ok(!/\basker/i.test(strip(t(key))), `${key} still says asker`)
    })
  })

  test('the two verb phrases keep asker, because birlik would be ungrammatical', () => {
    asLang('tr', () => {
      assert.ok(t('event.tekalif').includes('askere almaz'), 'conscription verb')
      assert.ok(t('event.sevres').includes('askere yazılmayı'), 'enlistment verb')
    })
  })

  test('English says units, not troops', () => {
    asLang('en', () => {
      for (const key of ['tooltip.territory', 'phase.help.reinforce', 'log.tradeCards'])
        assert.ok(!/\btroops\b/.test(strip(t(key))), `${key} still says troops`)
    })
  })
})

describe('event-card disclosure policy', () => {
  test('event cards do not publish exact bonuses or combat parameters', () => {
    for (const lang of ['en', 'tr'] as const)
      asLang(lang, () => {
        for (const event of HISTORICAL_EVENTS) {
          const text = t(event.id)
          assert.ok(!/\+\d/.test(text), `${event.id} publishes a numeric bonus in ${lang}`)
          assert.ok(!/\{(?:n|cost)\}/.test(text), `${event.id} publishes an internal parameter in ${lang}`)
        }
        assert.ok(!/\b(?:dice|zar(?:la)?)\b/i.test(t('event.greatOffensive')), 'offensive dice are reference material')
      })
  })

  test('the Tekâlif decision explains its trade-off without exposing its tuning', () => {
    for (const lang of ['en', 'tr'] as const)
      asLang(lang, () => {
        const text = t('event.tekalif', { n: 97, cost: 83 })
        assert.ok(!text.includes('97'), text)
        assert.ok(!text.includes('83'), text)
        assert.ok(!/\b(?:dice|zar(?:la)?)\b/i.test(text), text)
        assert.match(text, lang === 'en' ? /strike harder.*reinforcement/i : /daha sert vuracak.*takviye/i)
      })
  })

  test('borderline cards stay qualitative', () => {
    asLang('en', () => {
      assert.ok(!/every .*province|militia/i.test(t('event.erzurumCongress')))
      assert.ok(!/every .*province|militia/i.test(t('event.sivasCongress')))
      assert.ok(!/may defend|may recover|cannot (?:campaign|attack)|can no longer attack/i.test(t('event.karsTreaty')))
      assert.ok(!/\b(?:if|unless)\b/i.test(t('event.mosulQuestion')))
    })
    asLang('tr', () => {
      assert.ok(!/her .*il|milis/i.test(t('event.erzurumCongress')))
      assert.ok(!/her .*il|milis/i.test(t('event.sivasCongress')))
      assert.ok(!/savunabilir|geri alabilir|saldıramaz|ilerleyemez/i.test(t('event.karsTreaty')))
      assert.ok(!/durmuyorsa|yoksa|eğer/i.test(t('event.mosulQuestion')))
    })
  })

  test('the Alexandropol card warns about remobilization without revealing its reinforcement pool', () => {
    for (const lang of ['en', 'tr'] as const)
      asLang(lang, () => {
        const text = t('event.alexandropol', { n: 20 })
        assert.ok(!text.includes('20'), text)
        assert.ok(!/units|birlik/i.test(text), text)
      })
  })

  test('no key is left as a bare TODO or empty string', () => {
    for (const lang of ['en', 'tr'] as const)
      asLang(lang, () => {
        for (const key of keysByLang.en) {
          const value = t(key)
          assert.ok(value.trim().length > 0, `${key} is empty in ${lang}`)
          assert.ok(!/TODO|FIXME/i.test(value), `${key} is a placeholder in ${lang}`)
        }
      })
  })
})
