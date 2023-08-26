import { test, describe } from 'node:test'
import assert from 'node:assert/strict'
import { fresh, give, faction, turkey, PACT, fireAt } from './helpers'

describe('the congresses', () => {
  test('Erzurum pulses only the eastern provinces', () => {
    const g = fresh()
    const east = ['erzurum', 'van', 'elazig', 'diyarbakir', 'sivas', 'trabzon']
    const before = Object.fromEntries(g.territories.map(t => [t.slug, t.troops]))
    g.congressPulse(east)
    for (const t of g.territories) {
      const expected = east.includes(t.slug) && t.faction === turkey(g) ? before[t.slug] + 1 : before[t.slug]
      assert.equal(t.troops, expected, `${t.slug}`)
    }
  })

  test('Sivas pulses every Turkish province', () => {
    const g = fresh()
    const before = Object.fromEntries(turkey(g).territories.map(t => [t.slug, t.troops]))
    g.congressPulse(null)
    for (const t of turkey(g).territories) assert.equal(t.troops, before[t.slug] + 1, t.slug)
  })

  test('a pulse never touches an occupier', () => {
    const g = fresh()
    const izmir = g.bySlug['izmir']
    const before = izmir.troops
    g.congressPulse(null)
    assert.equal(izmir.troops, before)
  })

  test('a congress is skipped for good if its city is occupied', () => {
    const g = fresh()
    give(g, 'sivas', faction(g, 'Greece'))
    assert.ok(!fireAt(g, 3).includes('event.sivasCongress'))
    give(g, 'sivas', turkey(g))
    assert.ok(!fireAt(g, 4).includes('event.sivasCongress'), 'it never happened')
  })
})

describe('revolts', () => {
  test('Çerkes Ethem halves a random half of the western provinces', () => {
    const g = fresh()
    const west = ['balikesir', 'usak', 'eskisehir', 'kutahya', 'sakarya']
    for (const slug of west) g.bySlug[slug].troops = 8
    g.round = 8
    g.ethemRevolt()
    const hit = west.filter(s => g.bySlug[s].troops < 8)
    assert.equal(hit.length, 3, 'ceil(5/2) provinces revolt')
    for (const s of hit) {
      assert.equal(g.bySlug[s].troops, 4)
      assert.equal(g.bySlug[s].entrenched, 0)
    }
  })

  test('İzmir and Aydın are eligible once liberated', () => {
    const g = fresh()
    give(g, 'izmir', turkey(g))
    give(g, 'aydin', turkey(g))
    for (const t of g.westernProvincesHeld()) assert.equal(t.faction.name, 'Turkey')
    const slugs = g.westernProvincesHeld().map(t => t.slug)
    assert.ok(slugs.includes('izmir'))
    assert.ok(slugs.includes('aydin'))
  })

  test('a province with a single unit cannot revolt', () => {
    const g = fresh()
    for (const slug of ['balikesir', 'usak', 'eskisehir', 'kutahya', 'sakarya']) g.bySlug[slug].troops = 1
    assert.equal(g.westernProvincesHeld().length, 0)
  })

  test('Şeyh Said hits all four eastern provinces at once', () => {
    const g = fresh()
    const east = ['diyarbakir', 'elazig', 'erzurum', 'van']
    for (const slug of east) {
      g.bySlug[slug].troops = 10
      g.bySlug[slug].entrenched = 2
    }
    g.round = 24
    g.sheikhSaidRevolt()
    for (const slug of east) {
      assert.equal(g.bySlug[slug].troops, 5, slug)
      assert.equal(g.bySlug[slug].entrenched, 0, slug)
    }
  })

  test('Şeyh Said spares provinces Turkey does not hold', () => {
    const g = fresh()
    give(g, 'van', faction(g, 'Armenia'))
    g.bySlug['van'].troops = 10
    g.bySlug['diyarbakir'].troops = 10
    g.round = 24
    g.sheikhSaidRevolt()
    assert.equal(g.bySlug['van'].troops, 10, 'not ours, not our revolt')
    assert.equal(g.bySlug['diyarbakir'].troops, 5)
  })
})

describe('İstanbul and the Straits', () => {
  test('the occupation takes İstanbul back and pays a card', () => {
    const g = fresh()
    give(g, 'istanbul', turkey(g))
    const hand = turkey(g).hand.length
    fireAt(g, 5)
    assert.equal(g.bySlug['istanbul'].faction.name, 'Britain')
    assert.equal(turkey(g).hand.length, hand + 1)
  })

  test('Mudanya needs all three Straits provinces and a British İstanbul', () => {
    const g = fresh()
    fireAt(g, 5)
    assert.ok(!fireAt(g, 15).includes('event.mudanya'), 'not without the Straits')
  })

  test('Mudanya returns İstanbul and redistributes the garrison', () => {
    const g = fresh()
    fireAt(g, 5)
    for (const slug of ['izmit', 'gelibolu', 'canakkale']) give(g, slug, turkey(g))
    const britain = faction(g, 'Britain')
    g.bySlug['istanbul'].troops = 13
    const rest = britain.territories.filter(t => t.slug !== 'istanbul')
    const before = rest.reduce((sum, t) => sum + t.troops, 0)
    assert.ok(fireAt(g, 15).includes('event.mudanya'))
    assert.equal(g.bySlug['istanbul'].faction.name, 'Turkey')
    assert.equal(g.bySlug['istanbul'].troops, 1)
    const after = britain.territories.reduce((sum, t) => sum + t.troops, 0)
    assert.equal(after, before + 13, 'the garrison redeploys rather than evaporating')
  })
})

describe('İnönü', () => {
  test('bleeds the strongest Greek force beside Eskişehir and pays a card', () => {
    const g = fresh()
    fireAt(g, 5)
    const greece = faction(g, 'Greece')
    give(g, 'kutahya', greece)
    g.bySlug['kutahya'].troops = 9
    const hand = turkey(g).hand.length
    assert.ok(fireAt(g, 9).includes('event.inonu'))
    assert.equal(g.bySlug['kutahya'].troops, 6)
    assert.equal(turkey(g).hand.length, hand + 1)
  })

  test('is suppressed if Eskişehir is lost', () => {
    const g = fresh()
    fireAt(g, 5)
    give(g, 'eskisehir', faction(g, 'Greece'))
    assert.ok(!fireAt(g, 9).includes('event.inonu'))
  })

  test('is suppressed if Greece is no longer fighting in Anatolia', () => {
    const g = fresh()
    fireAt(g, 5)
    const greece = faction(g, 'Greece')
    for (const t of [...greece.territories]) if (PACT.includes(t.slug)) give(g, t.slug, turkey(g))
    assert.ok(!fireAt(g, 9).includes('event.inonu'))
    assert.ok(!greece.eliminated, 'still on the map, just not in the war')
  })

  test('Sakarya is suppressed once Greece has collapsed', () => {
    const g = fresh()
    fireAt(g, 5)
    g.greeceCollapsed = true
    assert.ok(!fireAt(g, 11).includes('event.sakarya'))
  })
})

describe('the population exchange', () => {
  test('adds to the Turkish Aegean and takes from the Greek mainland', () => {
    const g = fresh()
    give(g, 'izmir', turkey(g))
    give(g, 'aydin', turkey(g))
    const before = {
      izmir: g.bySlug['izmir'].troops,
      aydin: g.bySlug['aydin'].troops,
      salonica: g.bySlug['salonica'].troops,
      kozani: g.bySlug['kozani'].troops
    }
    g.populationExchange()
    assert.equal(g.bySlug['izmir'].troops, before.izmir + 1)
    assert.equal(g.bySlug['aydin'].troops, before.aydin + 1)
    assert.equal(g.bySlug['salonica'].troops, before.salonica - 1)
    assert.equal(g.bySlug['kozani'].troops, before.kozani - 1)
  })

  test('never empties a Greek province', () => {
    const g = fresh()
    g.bySlug['salonica'].troops = 1
    g.populationExchange()
    assert.equal(g.bySlug['salonica'].troops, 1)
  })

  test('does nothing for an Aegean province Turkey does not hold', () => {
    const g = fresh()
    const before = g.bySlug['izmir'].troops
    g.populationExchange()
    assert.equal(g.bySlug['izmir'].troops, before)
  })
})

describe('the Mosul question', () => {
  test('hands Britain’s Mesopotamian provinces to Iraq', () => {
    const g = fresh()
    g.round = 23
    g.settleMosulQuestion()
    assert.equal(g.bySlug['mosul'].faction.name, 'Iraq')
    assert.equal(g.bySlug['baghdad'].faction.name, 'Iraq')
  })

  test('Musul stays Turkish if Turkey took it first', () => {
    const g = fresh()
    give(g, 'mosul', turkey(g))
    g.round = 23
    g.settleMosulQuestion()
    assert.equal(g.bySlug['mosul'].faction.name, 'Turkey')
    assert.equal(g.bySlug['baghdad'].faction.name, 'Iraq')
  })

  test('the event is skipped when Britain holds neither', () => {
    const g = fresh()
    give(g, 'mosul', turkey(g))
    give(g, 'baghdad', turkey(g))
    assert.ok(!fireAt(g, 23).includes('event.mosulQuestion'))
  })

  test('losing Musul caps the Pact at 29', () => {
    const g = fresh()
    for (const slug of PACT) if (slug !== 'mosul') give(g, slug, turkey(g))
    g.round = 23
    g.settleMosulQuestion()
    assert.equal(g.pactProgress, 29)
    assert.equal(g.totalConquest, false)
  })
})

describe('withdrawals', () => {
  // Concessions are applied by startTurn, not by the event pass — and the order
  // inside startTurn matters (withdrawals land before events), so these play the
  // rounds through rather than cold-starting on a backlog.
  const openTurn = (g: ReturnType<typeof fresh>, round: number) => {
    g.currentPlayerIndex = g.players.findIndex(p => p.isHuman)
    for (let r = 1; r <= round; r++) {
      g.round = r
      g.startTurn()
      if (g.pendingDecision) g.resolveDecision('decline')
      g.clearEventCards()
    }
  }

  test('Italy concedes its provinces with a token garrison', () => {
    const g = fresh()
    openTurn(g, 10)
    for (const slug of ['antalya', 'isparta']) {
      assert.equal(g.bySlug[slug].faction.name, 'Turkey', slug)
      assert.equal(g.bySlug[slug].troops, 1, 'the land changes hands, not the army')
    }
  })

  test('France keeps Aleppo', () => {
    const g = fresh()
    openTurn(g, 11)
    assert.equal(g.bySlug['aleppo'].faction.name, 'France')
    for (const slug of ['adana', 'maras', 'hatay']) assert.equal(g.bySlug[slug].faction.name, 'Turkey', slug)
  })

  test('a broken peace cancels the concession', () => {
    const g = fresh()
    faction(g, 'Italy').peaceBroken = true
    openTurn(g, 10)
    assert.equal(g.bySlug['antalya'].faction.name, 'Italy', 'attack them and they fight on')
  })

  test('a concession happens only once', () => {
    const g = fresh()
    openTurn(g, 10)
    g.bySlug['antalya'].troops = 9
    openTurn(g, 11)
    assert.equal(g.bySlug['antalya'].troops, 9, 'not re-granted and not reset')
  })
})
