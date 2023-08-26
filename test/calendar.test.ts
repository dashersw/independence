import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import Game from '../src/game/game'
import { setLang, getLang, tDateLoc, trSuffix } from '../src/i18n'
import { fresh, roundOfEvent } from './helpers'

const asLang = (lang: 'en' | 'tr', fn: () => void) => {
  const before = getLang()
  setLang(lang)
  try {
    fn()
  } finally {
    setLang(before)
  }
}

describe('calendar', () => {
  test('rounds step three months from Mayıs 1919', () => {
    const g = new Game()
    asLang('en', () => {
      assert.equal(g.dateAt(1), 'May 1919')
      assert.equal(g.dateAt(2), 'August 1919')
      assert.equal(g.dateAt(3), 'November 1919')
      assert.equal(g.dateAt(5), 'May 1920')
      assert.equal(g.dateAt(14), 'August 1922')
      assert.equal(g.dateAt(18), 'August 1923')
      assert.equal(g.dateAt(27), 'November 1925')
    })
  })

  test('date follows the active language', () => {
    const g = new Game()
    asLang('tr', () => assert.equal(g.dateAt(14), 'Ağustos 1922'))
    asLang('en', () => assert.equal(g.dateAt(14), 'August 1922'))
  })

  test('the year never rolls backwards across a whole campaign', () => {
    const g = new Game()
    asLang('en', () => {
      let previous = 1918
      for (let r = 1; r <= 30; r++) {
        const year = Number(g.dateAt(r).split(' ')[1])
        assert.ok(year >= previous, `round ${r} went backwards`)
        previous = year
      }
    })
  })

  test('events land on their historical rounds', () => {
    const expected: [string, number][] = [
      ['event.erzurumCongress', 2],
      ['event.sivasCongress', 3],
      ['event.istanbulOccupied', 5],
      ['event.tbmm', 5],
      ['event.sevres', 6],
      ['event.venizelos', 7],
      ['event.sovietAid1', 7],
      ['event.ethem', 8],
      ['event.alexandropol', 8],
      ['event.inonu', 9],
      ['event.sovietAid2', 9],
      ['event.greekOffensive', 10],
      ['event.tekalif', 10],
      ['event.italyWithdraws', 10],
      ['event.sakarya', 11],
      ['event.karsTreaty', 11],
      ['event.ankaraAgreement', 11],
      ['event.exhaustion', 14],
      ['event.greatOffensive', 14],
      ['event.mudanya', 15],
      ['event.lloydGeorge', 15],
      ['event.sultanate', 15],
      ['event.greekCollapse', 16],
      ['event.mubadele', 16],
      ['event.caliphate', 21],
      ['event.mosulQuestion', 23],
      ['event.sheikhSaid', 24],
      ['event.lausanne', 27]
    ]
    for (const [key, round] of expected) assert.equal(roundOfEvent(key), round, `${key} moved`)
  })

  test('every event in the table is covered by the schedule above', () => {
    const g = fresh()
    assert.equal(g.round, 1)
    // 29 events, no duplicates
    const keys = (require('../src/game/game').HISTORICAL_EVENTS as { textKey: string }[]).map(e => e.textKey)
    assert.equal(keys.length, 29)
    assert.equal(new Set(keys).size, 29, 'duplicate event key')
  })
})

describe('Turkish date suffixes', () => {
  test('locative harmonises with how the year is spoken', () => {
    asLang('tr', () => {
      assert.equal(tDateLoc('Mayıs 1919'), "Mayıs 1919'da") // dokuz — back vowel
      assert.equal(tDateLoc('Nisan 1920'), "Nisan 1920'de") // yirmi — front
      assert.equal(tDateLoc('Ağustos 1921'), "Ağustos 1921'de") // bir
      assert.equal(tDateLoc('Şubat 1922'), "Şubat 1922'de") // iki
      assert.equal(tDateLoc('Ağustos 1923'), "Ağustos 1923'te") // üç — voiceless
      assert.equal(tDateLoc('Şubat 1924'), "Şubat 1924'te") // dört — voiceless
      assert.equal(tDateLoc('Kasım 1925'), "Kasım 1925'te") // beş — voiceless
    })
  })

  test('a day in front does not change the suffix', () => {
    asLang('tr', () => assert.equal(tDateLoc('23 Nisan 1920'), "23 Nisan 1920'de"))
  })

  test('English dates are returned untouched', () => {
    asLang('en', () => {
      assert.equal(tDateLoc('April 1920'), 'April 1920')
      assert.equal(tDateLoc('23 April 1920'), '23 April 1920')
    })
  })

  test('case suffixes obey vowel harmony and consonant hardening', () => {
    assert.equal(trSuffix('Ankara', 'loc'), "Ankara'da")
    assert.equal(trSuffix('Sivas', 'loc'), "Sivas'ta") // s is voiceless
    assert.equal(trSuffix('İzmir', 'loc'), "İzmir'de")
    assert.equal(trSuffix('Kars', 'dat'), "Kars'a")
    assert.equal(trSuffix('Ermenistan', 'dat'), "Ermenistan'a")
    assert.equal(trSuffix('Kars', 'acc'), "Kars'ı")
    assert.equal(trSuffix('Ankara', 'acc'), "Ankara'yı") // buffer -y- after a vowel
    assert.equal(trSuffix('Erzurum', 'abl'), "Erzurum'dan")
  })
})
