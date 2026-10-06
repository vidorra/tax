import { describe, expect, it } from 'vitest'
import { MoneybirdFout, type MbClient } from '../client'
import { bepaalTekens, haalJaarImport, ImportFout, ondernemingsvermogen, plat, rond, urenVan } from '../import'
import { neemOver } from '../overname'
import { NEP_ADM, NEP_TOKEN, nepMoneybird, type NepOpties } from './fixtures/nep'
import balans2024 from './fixtures/balance_sheet_2024.json'
import balans2025 from './fixtures/balance_sheet_2025.json'

const ADM = { id: NEP_ADM, naam: 'Studio Voorbeeld' }
const NA_JAAREINDE = new Date('2026-03-01T10:00:00Z')

async function importeer(jaar = 2025, nu = NA_JAAREINDE, nep: NepOpties = {}, indeling = {}) {
  const n = nepMoneybird(nep)
  const imp = await haalJaarImport(NEP_TOKEN, ADM, jaar, indeling, '7', nu, { fetch: n.fetch, wacht: async () => undefined })
  return { imp, verzoeken: n.verzoeken }
}

describe('haalJaarImport: volledige administratie over 2025', () => {
  it('regels per grootboekrekening met voorstel, reden en genormaliseerd teken', async () => {
    const { imp } = await importeer()
    const per = Object.fromEntries(imp.regels.map((r) => [r.naam, r]))
    expect(per['Omzet']).toMatchObject({ bedrag: 97000, categorie: 'omzet', rgsCode: 'WOmzNodOdh', soort: 'revenue', bijdrage: 97000 })
    expect(per['Wijziging onderhanden werk']).toMatchObject({ bedrag: 1500, categorie: 'omzet', rgsCode: 'WWivWowWow' })
    expect(per['Inkoop software']).toMatchObject({ bedrag: 1200, categorie: 'kosten' })
    expect(per['Kantoorkosten']).toMatchObject({ bedrag: 2350, categorie: 'kosten' })
    expect(per['Representatiekosten']).toMatchObject({ bedrag: 640, categorie: 'beperktAftrekbaar', reden: 'RGS WBedVkkRep: representatiekosten' })
    expect(per['Lunch en diner met klanten']).toMatchObject({ bedrag: 386, categorie: 'beperktAftrekbaar', reden: "naam bevat 'lunch'", rgsCode: null })
    expect(per['Afschrijving inventaris']).toMatchObject({ bedrag: 1500, categorie: 'afschrijving' })
    expect(per['Brandstof']).toMatchObject({ bedrag: 1840, categorie: 'autokosten' })
    expect(per['Automatiseringskosten']).toMatchObject({ categorie: 'kosten' })
    expect(per['Bankkosten']).toMatchObject({ bedrag: -180, categorie: 'financieel', bijdrage: -180 })
    // In de fixture staan overige baten en lasten als kosten positief; de import draait dat om.
    expect(per['Rente bank']).toMatchObject({ bedrag: 45, categorie: 'financieel' })
    expect(per['Rente lening']).toMatchObject({ bedrag: -120, categorie: 'financieel' })
    expect(imp.regels.every((r) => r.aangepast === false)).toBe(true)
  })

  it('totalen sluiten aan op de netto winst van Moneybird', async () => {
    const { imp } = await importeer()
    expect(imp.totalen).toEqual({
      omzet: 105000,
      kosten: 1200 + 2350 + 900 + 1250,
      afschrijvingen: 1500,
      beperktAftrekbaar: 640 + 386,
      autokosten: 1840,
      financieel: -180 + 45 - 120,
      nettoWinstMoneybird: 94679,
      nettoWinstIndeling: 94679,
      verschil: 0,
    })
    expect(imp.waarschuwingen.map((w) => w.id)).not.toContain('mb-verschil-winst')
    expect(imp.waarschuwingen.map((w) => w.id)).not.toContain('mb-tekens')
  })

  it('balans: ondernemingsvermogen begin en eind, FOR en onderhanden werk', async () => {
    const { imp } = await importeer()
    expect(imp.balans).toEqual({
      ondernemingsvermogenBegin: 86140,
      ondernemingsvermogenEinde: 106698,
      forStand: 17460,
      forStandBegin: 17460,
      onderhandenWerkBegin: 2000,
      onderhandenWerkEind: 3500,
    })
  })

  it('oudedagsreserve: de stand op 1 januari komt van de beginbalans, de eindbalans is een controle', async () => {
    // Fixture: 17.460 op beide balansen, dus geen melding.
    const { imp } = await importeer()
    expect(imp.waarschuwingen.some((w) => w.id.startsWith('mb-for-'))).toBe(false)
    // In 2025 is 3.000 afgenomen en geboekt: de eindbalans heeft 14.460. De beginstand blijft 17.460, met een melding.
    const metAfname = (rest: string, periode: string) => {
      if (rest !== '/reports/balance_sheet.json' || periode.endsWith('20241231')) return undefined
      const b = JSON.parse(JSON.stringify(balans2025)) as typeof balans2025
      const forRegel = b.credit.equity.find((r) => r.ledger_account_id === '202')!
      forRegel.value = '14460.0'
      return b
    }
    const { imp: afname } = await importeer(2025, NA_JAAREINDE, { vervang: metAfname })
    expect(afname.balans).toMatchObject({ forStandBegin: 17460, forStand: 14460 })
    const w = afname.waarschuwingen.find((x) => x.id === 'mb-for-mutatie')
    expect(w?.ernst).toBe('info')
    expect(w?.tekst).toContain('van € 17.460 op 1 januari naar € 14.460 op 31-12-2025. We rekenen met de stand op 1 januari.')
    expect(neemOver(undefined, afname).for?.stand).toBe(17460)
  })

  it('oudedagsreserve alleen op de eindbalans: geen beginstand en een melding om die in te vullen', async () => {
    const zonderFor = (rest: string, periode: string) => {
      if (rest !== '/reports/balance_sheet.json' || !periode.endsWith('20241231')) return undefined
      const b = JSON.parse(JSON.stringify(balans2024)) as typeof balans2024
      b.credit.equity = b.credit.equity.filter((r) => r.ledger_account_id !== '202')
      return b
    }
    const { imp } = await importeer(2025, NA_JAAREINDE, { vervang: zonderFor })
    expect(imp.balans).toMatchObject({ forStandBegin: null, forStand: 17460 })
    const w = imp.waarschuwingen.find((x) => x.id === 'mb-for-begin-ontbreekt')
    expect(w?.ernst).toBe('let-op')
    expect(w?.tekst).toContain('vul dan de stand op 1 januari 2025 in: de eindstand uit je aangifte van 2024')
    // Nieuwe onderneming: geen oudedagsreserve uit de eindbalans; een bestaande stand blijft staan.
    expect(neemOver(undefined, imp).for).toBeUndefined()
  })

  it('investeringen, desinvesteringen en activa van het jaar', async () => {
    const { imp } = await importeer()
    expect(imp.investeringen).toEqual([
      { omschrijving: 'Werkstation', datum: '2025-03-14', bedrag: 3200, regeling: 'kia' },
      { omschrijving: 'Elektrische personenauto', datum: '2025-05-01', bedrag: 45000, regeling: 'kia', uitgesloten: true },
      { omschrijving: 'Bestelbus', datum: '2025-11-01', bedrag: 18000, regeling: 'kia' },
    ])
    expect(imp.desinvesteringen).toEqual([{ omschrijving: 'Bureaustoel', verkoopprijs: 150, investeringsjaar: 2022, genotenPct: 0.28 }])
    // Het middel achter de desinvestering, voor de koppeling met het activaregister bij de overname.
    expect(imp.afgestoten).toEqual([{ naam: 'Bureaustoel', aanschafdatum: '2022-06-01', aanschafwaarde: 650, datum: '2025-09-30', verkoopprijs: 150, prijsBekend: true }])
    expect(imp.activa).toEqual([
      { naam: 'Werkstation', aanschafdatum: '2025-03-14', aanschafwaarde: 3200, boekwaarde: 2600, levensduurJaren: 4, restwaarde: 0 },
      { naam: 'Elektrische personenauto', aanschafdatum: '2025-05-01', aanschafwaarde: 45000, boekwaarde: 39000, levensduurJaren: 5, restwaarde: 15000 },
      { naam: 'Monitor', aanschafdatum: '2021-01-10', aanschafwaarde: 400, boekwaarde: 0, levensduurJaren: null, restwaarde: null },
      { naam: 'Bestelbus', aanschafdatum: '2025-11-01', aanschafwaarde: 18000, boekwaarde: 17500, levensduurJaren: 5, restwaarde: 3000 },
    ])
    const ids = imp.waarschuwingen.map((w) => w.id)
    expect(ids).toContain('mb-uitgesloten-1')
    expect(ids).toContain('mb-vervoermiddel-2')
    expect(ids).not.toContain('mb-uitgesloten-2')
    expect(ids).toContain('mb-desinvestering-kia-0')
    expect(ids).toContain('mb-boekwaarde-huidig')
  })

  it('opdrachtgevers met uurtarief uit de urenregistratie, en uren per klant', async () => {
    const { imp, verzoeken } = await importeer()
    expect(imp.opdrachtgevers).toEqual([
      { naam: 'Bakkerij Noord BV', omzet: 70000, uurtarief: 80 },
      { naam: 'Sanne de Vries', omzet: 35000, uurtarief: 108 },
    ])
    expect(imp.uren).toEqual({ totaal: 1225, perContact: { 'Bakkerij Noord BV': 880, 'Sanne de Vries': 325, 'Zonder klant': 20 } })
    // Naam van klant 11 stond al in het rapport; alleen klant 12 is opgevraagd, en maar één keer.
    expect(verzoeken.filter((v) => v.includes('/contacts/'))).toEqual([`/${NEP_ADM}/contacts/12.json`])
    expect(verzoeken.filter((v) => v.includes('time_entries'))).toHaveLength(3)
  })

  it('vraagt de juiste periodes op, ook de balans van het vorige jaar', async () => {
    const { imp, verzoeken } = await importeer()
    expect(verzoeken).toContain(`/${NEP_ADM}/reports/profit_loss.json?period=20250101..20251231`)
    expect(verzoeken).toContain(`/${NEP_ADM}/reports/balance_sheet.json?period=20250101..20251231`)
    expect(verzoeken).toContain(`/${NEP_ADM}/reports/balance_sheet.json?period=20240101..20241231`)
    expect(imp).toMatchObject({ koppelingId: '7', jaar: 2025, administratie: ADM, opgehaaldOp: NA_JAAREINDE.toISOString() })
    expect(imp.waarschuwingen.map((w) => w.id)).not.toContain('mb-gedeeltelijk-jaar')
  })

  it('neemOver zet de import om in een onderneming met dezelfde winst', async () => {
    const { imp } = await importeer()
    const o = neemOver(undefined, imp)
    expect(o.winstberekening).toEqual({ soort: 'uitgesplitst', omzet: 105000, kosten: 5700 + 1840, afschrijvingen: 1500, financieleBatenLasten: -255 })
    expect(o.for).toEqual({ stand: 17460, ondernemingsvermogenEinde: 106698 })
    expect(o.bron).toMatchObject({ soort: 'moneybird', koppelingId: '7', administratieId: NEP_ADM, jaar: 2025 })
  })
})

describe('haalJaarImport: bijzondere gevallen', () => {
  it('lopend jaar: periode tot vandaag en een waarschuwing dat een prognose nodig is', async () => {
    const nu = new Date(2026, 9, 4, 12, 0, 0)
    const { imp, verzoeken } = await importeer(2026, nu)
    expect(verzoeken).toContain(`/${NEP_ADM}/reports/profit_loss.json?period=20260101..20261004`)
    const w = imp.waarschuwingen.find((x) => x.id === 'mb-gedeeltelijk-jaar')
    expect(w?.tekst).toMatch(/04-10-2026/)
    expect(w?.tekst).toMatch(/prognose/)
  })

  it('een jaar in de toekomst geeft een ImportFout zonder verzoeken', async () => {
    const n = nepMoneybird()
    await expect(haalJaarImport(NEP_TOKEN, ADM, 2027, {}, '7', new Date(2026, 9, 4), { fetch: n.fetch })).rejects.toBeInstanceOf(ImportFout)
    expect(n.verzoeken).toHaveLength(0)
  })

  it('scope time_entries ontbreekt: uren null, opdrachtgevers zonder uurtarief, wel een waarschuwing', async () => {
    const { imp } = await importeer(2025, NA_JAAREINDE, { weiger: { time_entries: 403 } })
    expect(imp.uren).toBeNull()
    expect(imp.opdrachtgevers.every((o) => o.uurtarief === undefined)).toBe(true)
    const w = imp.waarschuwingen.find((x) => x.id === 'mb-scope-uren')
    expect(w?.tekst).toMatch(/scope time_entries/)
    expect(imp.totalen.verschil).toBe(0)
  })

  it('scope bank ontbreekt: balans leeg met één waarschuwing', async () => {
    const { imp } = await importeer(2025, NA_JAAREINDE, { weiger: { balance_sheet: 403 } })
    expect(imp.balans).toEqual({ ondernemingsvermogenBegin: null, ondernemingsvermogenEinde: null, forStand: null, forStandBegin: null, onderhandenWerkBegin: null, onderhandenWerkEind: null })
    expect(imp.waarschuwingen.filter((w) => w.id.startsWith('mb-scope-')).map((w) => w.id)).toEqual(['mb-scope-balans'])
  })

  it('andere fouten van Moneybird gaan door', async () => {
    await expect(importeer(2025, NA_JAAREINDE, { weiger: { 'assets.json': 500 } })).rejects.toMatchObject({ status: 500 })
    await expect(importeer(2025, NA_JAAREINDE, { token: 'ander-token-00000000' })).rejects.toBeInstanceOf(MoneybirdFout)
  })

  it('een regel op negeren verklaart het verschil met Moneybird', async () => {
    const { imp } = await importeer(2025, NA_JAAREINDE, {}, { '603': 'negeren', '606': 'beperktAftrekbaar' })
    expect(imp.regels.find((r) => r.ledgerAccountId === '603')).toMatchObject({ categorie: 'negeren', voorstel: 'beperktAftrekbaar', aangepast: true, bedrag: 386 })
    expect(imp.totalen.beperktAftrekbaar).toBe(640 + 900)
    expect(imp.totalen.verschil).toBe(-386)
    const ids = imp.waarschuwingen.map((w) => w.id)
    expect(ids).toContain('mb-verschil-negeren')
    expect(ids).not.toContain('mb-verschil-winst')
  })

  it('waarschuwt als de regels niet optellen tot de netto winst', async () => {
    const leeg = async () => []
    const client: MbClient = {
      afgekapt: [],
      administraties: leeg,
      grootboekrekeningen: leeg,
      activa: leeg,
      omzetPerContact: leeg,
      uren: leeg,
      contactNaam: async () => null,
      balans: async () => ({}),
      winstEnVerlies: async () => ({
        revenue_by_ledger_account: { ledger_accounts: [{ ledger_account_id: '1', value: '1000.0' }] },
        expenses_by_ledger_account: { ledger_accounts: [{ ledger_account_id: '2', value: '300.0' }] },
        net_profit: '900.0',
      }),
    }
    const imp = await haalJaarImport(NEP_TOKEN, ADM, 2025, {}, '7', NA_JAAREINDE, { client })
    const ids = imp.waarschuwingen.map((w) => w.id)
    expect(ids).toContain('mb-tekens')
    expect(ids).toContain('mb-verschil-winst')
    expect(imp.regels.map((r) => r.naam)).toEqual(['Grootboekrekening 1', 'Grootboekrekening 2'])
    expect(imp.uren).toBeNull()
    expect(imp.balans.ondernemingsvermogenEinde).toBeNull()
  })
})

describe('onderdelen', () => {
  it('tekens per sectie volgen uit de netto winst, met de gebruikelijke conventie bij gelijkspel', () => {
    const sommen = { revenue: 100, direct_costs: 10, expenses: 20, other_income_expenses: 5 }
    expect(bepaalTekens(sommen, { net_profit: '75' })).toEqual({ tekens: { revenue: 1, direct_costs: -1, expenses: -1, other_income_expenses: 1 }, zeker: true })
    expect(bepaalTekens(sommen, { net_profit: '65' }).tekens.other_income_expenses).toBe(-1)
    // Kosten als negatieve bedragen: dan tellen ze op.
    expect(bepaalTekens({ revenue: 100, direct_costs: -10, expenses: -20, other_income_expenses: 0 }, { net_profit: '70' })).toEqual({
      tekens: { revenue: 1, direct_costs: 1, expenses: 1, other_income_expenses: 1 },
      zeker: true,
    })
    expect(bepaalTekens(sommen, { net_profit: '1' }).zeker).toBe(false)
  })

  it('een boom wordt gesplitst in kinderen plus restant', () => {
    expect(plat([{ ledger_account_id: '1', value: '100', children: [{ ledger_account_id: '2', value: '60' }, { ledger_account_id: '3', value: '30' }] }])).toEqual([
      { id: '2', waarde: 60 },
      { id: '3', waarde: 30 },
      { id: '1', waarde: 10 },
    ])
  })

  it('ondernemingsvermogen valt terug op activa min schulden als het eigen vermogen niet aansluit', () => {
    expect(ondernemingsvermogen({ debit: { total: '100' }, credit: { equity: [{ ledger_account_id: '1', value: '50' }], current_liabilities: [{ ledger_account_id: '2', value: '20' }] } })).toEqual({ waarde: 80, viaTotaal: true })
    expect(ondernemingsvermogen(null)).toEqual({ waarde: null, viaTotaal: false })
  })

  it('uren: eind min begin min pauze, lopende registraties tellen niet', () => {
    expect(urenVan({ started_at: '2025-01-01T09:00:00Z', ended_at: '2025-01-01T17:00:00Z', paused_duration: 1800 })).toBe(7.5)
    expect(urenVan({ started_at: '2025-01-01T09:00:00Z', ended_at: null })).toBe(0)
  })

  it('afronden: .5 van nul af', () => {
    expect(rond(-385.5)).toBe(-386)
    expect(rond(385.5)).toBe(386)
    expect(Object.is(rond(-0.2), 0)).toBe(true)
  })
})
