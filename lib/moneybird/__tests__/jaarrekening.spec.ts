import { describe, expect, it } from 'vitest'
import { importMetKeuzes } from '../../../components/dossier/koppelingen/indeling'
import { balansTotalen, JAARREKENING_GRENZEN, kapitaalsvergelijking, specificatieVerschillen, wvTotalen } from '../../dossier/jaarrekening'
import { valideerInvoer } from '../../dossier/valideer'
import { berekenHuishouden } from '../../tax/engine'
import type { HuishoudenInvoer, OndernemingInvoer } from '../../tax/types'
import type { MbRuwBalans } from '../client'
import { haalJaarImport } from '../import'
import { beperkLijst, berekenTotalen, herindeel, MB_MAX_OMSCHRIJVING, MB_MAX_PRIVEREGELS, rubriekVoor, wvRubrieken } from '../indeling'
import { balansMoment, bouwJaarrekening, deelBalansrekeningIn, MB_MAX_SPECIFICATIES, rondAfOpSom, type BalansRekening } from '../jaarrekening'
import { neemOver } from '../overname'
import type { MbGrootboekRegel, MbIndeling, MbJaarImport } from '../types'
import balans2024 from './fixtures/balance_sheet_2024.json'
import balans2025 from './fixtures/balance_sheet_2025.json'
import grootboek from './fixtures/ledger_accounts.json'
import { NEP_ADM, NEP_TOKEN, nepMoneybird, type NepOpties } from './fixtures/nep'

const ADM = { id: NEP_ADM, naam: 'Studio Voorbeeld' }
const NA_JAAREINDE = new Date('2026-03-01T10:00:00Z')

async function importeer(nep: NepOpties = {}, indeling: MbIndeling = {}) {
  const n = nepMoneybird(nep)
  return haalJaarImport(NEP_TOKEN, ADM, 2025, indeling, '7', NA_JAAREINDE, { fetch: n.fetch, wacht: async () => undefined })
}

/** Kopie van een balansfixture met andere waarden per grootboekrekening (ook kinderen). */
function balansMet(basis: unknown, waarden: Record<string, string | null>): MbRuwBalans {
  const b = structuredClone(basis) as MbRuwBalans
  const pas = (lijst: Array<{ ledger_account_id: string; value: string | number; children?: unknown[] }> | undefined): typeof lijst =>
    lijst
      ?.filter((r) => waarden[r.ledger_account_id] !== null)
      .map((r) => ({ ...r, value: waarden[r.ledger_account_id] ?? r.value, children: r.children ? pas(r.children as never) : undefined }))
  for (const kant of [b.debit, b.credit] as Array<Record<string, unknown> | undefined>) {
    for (const k of Object.keys(kant ?? {})) if (Array.isArray(kant?.[k]) && k !== 'open_years') kant[k] = pas(kant[k] as never)
  }
  return b
}

const balansVervang = (begin: unknown, eind: unknown): NepOpties['vervang'] => (pad, periode) =>
  pad === '/reports/balance_sheet.json' ? (periode.endsWith('20241231') ? begin : eind) : undefined

const huishouden = (o: OndernemingInvoer): HuishoudenInvoer => ({
  jaar: 2025,
  fiscaalPartner: false,
  kinderen: [],
  personen: [{ id: 'A', geboortedatum: '1988-06-15', ondernemingen: [o], loon: [], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 } }],
  box3: { posities: [], schulden: [] },
  verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
})

/**
 * De onderneming zonder activaregister: de commerciële keten zoals geboekt. Met het register uit Moneybird
 * rekent de engine met de fiscale afschrijving; dat verschil staat in overname.spec.ts.
 */
const zonderRegister = (o: OndernemingInvoer): OndernemingInvoer => {
  const { activa: _activa, ...rest } = o
  return rest
}

const jaarrekeningWaarschuwingen = (imp: MbJaarImport) => imp.waarschuwingen.filter((w) => w.id.startsWith('mb-jaarrekening')).map((w) => w.id)

describe('jaarrekening uit Moneybird: de hele keten over 2025', () => {
  it('balans per post op beide peildatums, specificaties en aanschafwaarde van de activa', async () => {
    const imp = await importeer()
    const j = imp.jaarrekening!
    expect(j.bron).toBe('moneybird')
    expect(j.begin).toEqual({
      materieleVasteActiva: 314,
      voorraden: 2000,
      handelsdebiteuren: 9680,
      overigeVorderingen: 650,
      liquideMiddelen: 85536,
      oudedagsreserve: 17460,
      langlopendeSchulden: 5000,
      crediteuren: 2000,
      omzetbelasting: 4040,
      overigeKortlopendeSchulden: 1000,
    })
    expect(j.eind).toEqual({
      materieleVasteActiva: 59100,
      voorraden: 3500,
      handelsdebiteuren: 14520,
      overigeVorderingen: 300,
      liquideMiddelen: 48238,
      oudedagsreserve: 17460,
      langlopendeSchulden: 15000,
      crediteuren: 1200,
      omzetbelasting: 1760,
      overigeKortlopendeSchulden: 1000,
    })
    // Overige vorderingen en omzetbelasting altijd; andere posten alleen met meer dan één rekening.
    expect(j.specificaties).toEqual([
      { post: 'materieleVasteActiva', omschrijving: 'Inventaris', begin: 314, eind: 2600 },
      { post: 'materieleVasteActiva', omschrijving: 'Vervoermiddelen', begin: 0, eind: 56500 },
      { post: 'overigeVorderingen', omschrijving: 'Vooruitbetaalde kosten', begin: 350, eind: 0 },
      { post: 'overigeVorderingen', omschrijving: 'Waarborgsom kantoor', begin: 300, eind: 300 },
      { post: 'liquideMiddelen', omschrijving: 'Bank', begin: 70451, eind: 28198 },
      { post: 'liquideMiddelen', omschrijving: 'Spaarrekening', begin: 15000, eind: 20000 },
      { post: 'liquideMiddelen', omschrijving: 'Kas', begin: 85, eind: 40 },
      { post: 'langlopendeSchulden', omschrijving: 'Lening familie', begin: 5000, eind: 3000 },
      { post: 'langlopendeSchulden', omschrijving: 'Financiering bestelbus', begin: 0, eind: 12000 },
      { post: 'omzetbelasting', omschrijving: 'Te vorderen btw', begin: -1210, eind: -2340 },
      { post: 'omzetbelasting', omschrijving: 'Te betalen btw', begin: 5250, eind: 4100 },
    ])
    expect(specificatieVerschillen(j)).toEqual([])
    // Werkstation 3.200, personenauto 45.000 (rest 15.000), monitor 400, bestelbus 18.000 (rest 3.000); de verkochte stoel niet.
    expect(j.mva).toEqual({ aanschafwaarde: 66600, restwaarde: 18000 })
    expect(jaarrekeningWaarschuwingen(imp)).toEqual([])
  })

  it('het ondernemingsvermogen uit de posten is dat van de balans in Moneybird', async () => {
    const imp = await importeer()
    expect(balansTotalen(imp.jaarrekening!.begin).ondernemingsvermogen).toBe(imp.balans.ondernemingsvermogenBegin)
    expect(balansTotalen(imp.jaarrekening!.eind).ondernemingsvermogen).toBe(imp.balans.ondernemingsvermogenEinde)
    expect(balansTotalen(imp.jaarrekening!.eind)).toMatchObject({ activa: 125658, vreemdVermogen: 18960, ondernemingsvermogen: 106698, exclusiefOudedagsreserve: 89238 })
  })

  it('winst- en verliesrekening in rubrieken; de som is de netto winst volgens de indeling', async () => {
    const imp = await importeer()
    expect(imp.jaarrekening!.winstEnVerlies).toEqual([
      { rubriek: 'omzet', bedrag: 103500 },
      { rubriek: 'onderhandenWerk', bedrag: 1500 },
      { rubriek: 'inkoop', bedrag: 1200 },
      { rubriek: 'afschrijvingen', bedrag: 1500 },
      // Brandstof (autokosten) en kilometervergoeding (RGS WBedVkkKmz).
      { rubriek: 'auto', bedrag: 1840 + 1250 },
      // Kantoorkosten (RGS WBedKan) en automatiseringskosten (geen RGS, naam).
      { rubriek: 'kantoor', bedrag: 2350 + 900 },
      { rubriek: 'beperktAftrekbaar', bedrag: 640 + 386 },
      { rubriek: 'financieleBaten', bedrag: 45 },
      // Bankkosten en rente lening.
      { rubriek: 'financieleLasten', bedrag: 180 + 120 },
    ])
    expect(wvTotalen(imp.jaarrekening!.winstEnVerlies).saldo).toBe(imp.totalen.nettoWinstIndeling)
    expect(imp.totalen.nettoWinstIndeling).toBe(94679)
  })

  it('privé per rekening; de kapitaalsvergelijking sluit op de winst, afgerond op hele euro’s', async () => {
    const imp = await importeer()
    // Onafgerond 45.000,60 en 25.620,80: de euro van de afronding gaat naar de grootste rest.
    expect(imp.priveMutaties).toEqual({
      onttrekkingen: [
        { omschrijving: 'Privé-opnamen', bedrag: 45000 },
        { omschrijving: 'Inkomstenbelasting en Zvw', bedrag: 25621 },
        { omschrijving: 'Lijfrentepremie', bedrag: 6000 },
      ],
      stortingen: [{ omschrijving: 'Privé-stortingen', bedrag: 2500 }],
    })
    expect(imp.jaarrekening!.onttrekkingen).toEqual(imp.priveMutaties!.onttrekkingen)
    expect(imp.jaarrekening!.stortingen).toEqual(imp.priveMutaties!.stortingen)
    expect(kapitaalsvergelijking(imp.jaarrekening)).toEqual({ eindvermogen: 106698, beginvermogen: 86140, onttrekkingen: 76621, stortingen: 2500, winst: 94679 })
  })

  it('neemOver: jaarrekening in de onderneming, geldig voor het dossier en gelijk aan de engine', async () => {
    const imp = await importeer()
    const o = neemOver(undefined, imp)
    expect(o.jaarrekening).toEqual(imp.jaarrekening)
    expect(valideerInvoer(huishouden(o))).toEqual([])
    expect(o.activa?.every((a) => a.bron === 'moneybird')).toBe(true)
    const r = berekenHuishouden(huishouden(zonderRegister(o)), { zonderMarginaleDruk: true })
    const saldo = r.personen[0].ondernemingen[0].saldo
    expect(saldo).toBe(imp.totalen.nettoWinstIndeling)
    expect(wvTotalen(o.jaarrekening!.winstEnVerlies).saldo).toBe(saldo)
    expect(kapitaalsvergelijking(o.jaarrekening)!.winst).toBe(saldo)
    expect(balansTotalen(o.jaarrekening!.eind).ondernemingsvermogen).toBe(o.for!.ondernemingsvermogenEinde)
    expect(balansTotalen(o.jaarrekening!.eind).oudedagsreserve).toBe(o.for!.stand)
  })

  it.each([
    ['op de server (herindeel)', (imp: MbJaarImport, k: MbIndeling) => herindeel(imp, k)],
    ['in de browser (alleen de categorie)', (imp: MbJaarImport, k: MbIndeling) => importMetKeuzes(imp, k)],
  ])('een andere indeling %s: rubrieken en privé volgen, alles blijft sluiten', async (_, pasToe) => {
    const imp = await importeer()
    // Lunch niet meenemen (privé), automatisering beperkt aftrekbaar, rente bank als omzet, omzet hosting als kosten.
    const keuzes: MbIndeling = { '603': 'negeren', '606': 'beperktAftrekbaar', '701': 'omzet', '402': 'kosten' }
    const o = neemOver(undefined, pasToe(imp, keuzes))
    const j = o.jaarrekening!
    const saldo = berekenHuishouden(huishouden(zonderRegister(o)), { zonderMarginaleDruk: true }).personen[0].ondernemingen[0].saldo
    expect(saldo).toBe(94679 + 386)
    expect(wvTotalen(j.winstEnVerlies).saldo).toBe(saldo)
    expect(j.winstEnVerlies).toContainEqual({ rubriek: 'omzet', bedrag: 97000 + 45 })
    // Omzet als kosten: een negatieve kostenpost in de rubriek van de RGS-code (geen kostencode: overig).
    expect(j.winstEnVerlies).toContainEqual({ rubriek: 'overig', bedrag: -6500 })
    expect(j.winstEnVerlies).toContainEqual({ rubriek: 'beperktAftrekbaar', bedrag: 640 + 900 })
    expect(j.onttrekkingen).toContainEqual({ omschrijving: 'Lunch en diner met klanten (niet in de winst)', bedrag: 386 })
    expect(kapitaalsvergelijking(j)!.winst).toBe(saldo)
    expect(valideerInvoer(huishouden(o))).toEqual([])
  })

  it('een privéboeking als omzet op niet meenemen wordt een storting', async () => {
    const imp = herindeel(await importeer(), { '402': 'negeren' })
    expect(imp.jaarrekening!.stortingen).toContainEqual({ omschrijving: 'Omzet hosting (niet in de winst)', bedrag: 6500 })
    expect(kapitaalsvergelijking(imp.jaarrekening)!.winst).toBe(imp.totalen.nettoWinstIndeling)
  })
})

describe('jaarrekening overnemen: opties', () => {
  const bestaand: OndernemingInvoer = {
    naam: 'Studio',
    winstberekening: { soort: 'saldo', saldo: 1 },
    uren: { onderneming: 0 },
    startjaar: 2012,
    jaarrekening: {
      begin: { liquideMiddelen: 10 },
      eind: { liquideMiddelen: 20 },
      onttrekkingen: [{ omschrijving: 'Privé', bedrag: 5 }],
      winstEnVerlies: [{ rubriek: 'omzet', bedrag: 1 }],
      omschrijvingActiviteiten: 'Grafisch ontwerp',
      bron: 'handmatig',
    },
  }

  it('standaard: alles uit Moneybird, de omschrijving van de activiteiten blijft', async () => {
    const imp = await importeer()
    const j = neemOver(bestaand, imp).jaarrekening!
    expect(j).toEqual({ ...imp.jaarrekening, omschrijvingActiviteiten: 'Grafisch ontwerp' })
  })

  it('niets uit Moneybird (geen regels, geen balans): de bestaande blijft staan', async () => {
    const imp = await importeer({ weiger: { balance_sheet: 403, profit_loss: 403, 'assets.json': 403 } })
    expect(imp.jaarrekening).toBeUndefined()
    expect(neemOver(bestaand, imp).jaarrekening).toBe(bestaand.jaarrekening)
  })

  it('balans uit: balansdelen van de onderneming, winst- en verliesrekening uit Moneybird', async () => {
    const imp = await importeer()
    const j = neemOver(bestaand, imp, { balans: false }).jaarrekening!
    expect(j.begin).toEqual({ liquideMiddelen: 10 })
    expect(j.onttrekkingen).toEqual([{ omschrijving: 'Privé', bedrag: 5 }])
    expect(j.mva).toBeUndefined()
    expect(j.winstEnVerlies).toEqual(imp.jaarrekening!.winstEnVerlies)
    expect(j.bron).toBe('moneybird')
  })

  it('een oudere import zonder jaarrekening geeft nog wel de rubrieken', async () => {
    const imp = await importeer()
    const oud: MbJaarImport = { ...imp, jaarrekening: undefined, priveMutaties: undefined, regels: imp.regels.map(({ bijdrage: _, ...r }) => r) }
    const j = neemOver(undefined, oud).jaarrekening!
    expect(j).toEqual({ winstEnVerlies: imp.jaarrekening!.winstEnVerlies, bron: 'moneybird' })
  })
})

describe('controles op de jaarrekening', () => {
  it('scope bank ontbreekt: alleen de rubrieken en de aanschafwaarde van de activa', async () => {
    const imp = await importeer({ weiger: { balance_sheet: 403 } })
    expect(imp.jaarrekening).toEqual({ mva: { aanschafwaarde: 66600, restwaarde: 18000 }, winstEnVerlies: expect.any(Array), bron: 'moneybird' })
    expect(imp.priveMutaties).toBeUndefined()
    expect(jaarrekeningWaarschuwingen(imp)).toEqual([])
  })

  it('een vlottende rekening zonder RGS-code en zonder duidelijke naam: weggelaten, de balans sluit niet', async () => {
    const imp = await importeer({
      vervang: (pad) => {
        if (pad !== '/ledger_accounts.json') return undefined
        return grootboek.map((r) => (r.id === '110' ? { ...r, name: 'Tussenrekening' } : r))
      },
    })
    const ids = jaarrekeningWaarschuwingen(imp)
    expect(ids).toEqual(['mb-jaarrekening-onbekend', 'mb-jaarrekening-balans-begin', 'mb-jaarrekening-balans-eind'])
    expect(imp.waarschuwingen.find((w) => w.id === 'mb-jaarrekening-onbekend')!.tekst).toMatch(/Tussenrekening \(vlottende activa zonder RGS-code\)/)
    expect(imp.waarschuwingen.find((w) => w.id === 'mb-jaarrekening-balans-eind')!.tekst).toMatch(/31-12-2025 sluit niet.*verschil € 40/)
    expect(imp.jaarrekening!.eind!.liquideMiddelen).toBe(48198)
    // Het eigen vermogen sluit wel op de winst: geen melding over de kapitaalsvergelijking.
    expect(ids).not.toContain('mb-jaarrekening-kapitaal')
  })

  it('privérekeningen leeggeboekt naar het kapitaal: de kapitaalsvergelijking sluit niet', async () => {
    // Op 31-12-2025 staan de privérekeningen op 0 en is alles naar het ondernemingsvermogen geboekt.
    const eind = balansMet(balans2025, { '201': String(61180 - 138621.4), '203': '0.0', '204': '0.0', '205': '0.0', '206': '0.0' })
    const imp = await importeer({ vervang: balansVervang(balans2024, eind) })
    expect(imp.balans.ondernemingsvermogenEinde).toBe(106698)
    const w = imp.waarschuwingen.find((x) => x.id === 'mb-jaarrekening-kapitaal')
    expect(w?.tekst).toMatch(/sluit niet.*winst- en verliesrekening € 94\.679 \(verschil € 138\.621\).*privérekeningen/)
    expect(jaarrekeningWaarschuwingen(imp)).toEqual(['mb-jaarrekening-kapitaal'])
    // De mutaties staan er zoals ze zijn: de oude saldi komen terug als storting.
    expect(imp.priveMutaties!.stortingen.map((s) => s.bedrag)).toEqual([38000, 21000, 5500])
  })

  it('geen privérekeningen: één saldoregel uit de kapitaalsvergelijking, met een melding', async () => {
    const begin = balansMet(balans2024, { '201': String(61180 - 64500), '203': null, '204': null, '205': null })
    const eind = balansMet(balans2025, { '201': String(61180 - 138621.4), '203': null, '204': null, '205': null, '206': null })
    const imp = await importeer({ vervang: balansVervang(begin, eind) })
    expect(imp.priveMutaties).toEqual({ onttrekkingen: [{ omschrijving: 'Privé (saldo uit Moneybird)', bedrag: 74121 }], stortingen: [] })
    expect(jaarrekeningWaarschuwingen(imp)).toEqual(['mb-jaarrekening-prive-saldo'])
    expect(kapitaalsvergelijking(imp.jaarrekening)!.winst).toBe(imp.totalen.nettoWinstIndeling)
  })

  it('goodwill en een lening u/g: bij de dichtstbijzijnde post, met een melding', async () => {
    const grootboekExtra = [
      ...grootboek,
      { ...grootboek[0], id: '111', name: 'Goodwill', account_type: 'non_current_assets', taxonomy_item: { taxonomy_version: '3.6', code: 'BIvaGooVvp', name: 'Goodwill', name_english: null, reference: null } },
      { ...grootboek[0], id: '112', name: 'Lening aan derden', account_type: 'non_current_assets', taxonomy_item: { taxonomy_version: '3.6', code: 'BFvaLenLen', name: 'Leningen u/g', name_english: null, reference: null } },
    ]
    const extra = (b: unknown, waarde: string) => {
      const k = structuredClone(b) as { debit: { total: string; non_current_assets: unknown[] }; credit: { total: string; non_current_liabilities: unknown[] } }
      k.debit.non_current_assets.push({ ledger_account_id: '111', value: waarde }, { ledger_account_id: '112', value: waarde })
      k.debit.total = String(Number(k.debit.total) + 2 * Number(waarde))
      k.credit.non_current_liabilities.push({ ledger_account_id: '207', value: String(2 * Number(waarde)) })
      k.credit.total = String(Number(k.credit.total) + 2 * Number(waarde))
      return k
    }
    const imp = await importeer({
      vervang: (pad, periode) =>
        pad === '/ledger_accounts.json' ? grootboekExtra : pad === '/reports/balance_sheet.json' ? extra(periode.endsWith('20241231') ? balans2024 : balans2025, '1000') : undefined,
    })
    expect(jaarrekeningWaarschuwingen(imp)).toEqual(['mb-jaarrekening-benadering'])
    expect(imp.waarschuwingen.find((w) => w.id === 'mb-jaarrekening-benadering')!.tekst).toBe(
      'Het rapport heeft geen aparte post voor Goodwill (immateriële vaste activa, nu bij materiële vaste activa), Lening aan derden (financiële vaste activa, nu bij overige vorderingen). Die staan bij de post die er het dichtst bij ligt.',
    )
    expect(imp.jaarrekening!.eind).toMatchObject({ materieleVasteActiva: 60100, overigeVorderingen: 1300 })
    expect(kapitaalsvergelijking(imp.jaarrekening)!.winst).toBe(imp.totalen.nettoWinstIndeling)
  })

  it('eerste jaar in Moneybird: lege beginbalans', async () => {
    const leeg = { debit: { total: '0.0', non_current_assets: [], current_assets: [] }, credit: { total: '0.0', equity: [], provisions: [], non_current_liabilities: [], current_liabilities: [], open_years: [] } }
    const imp = await importeer({ vervang: balansVervang(leeg, balans2025) })
    expect(imp.jaarrekening!.begin).toEqual({
      materieleVasteActiva: 0,
      voorraden: 0,
      handelsdebiteuren: 0,
      overigeVorderingen: 0,
      liquideMiddelen: 0,
      oudedagsreserve: 0,
      langlopendeSchulden: 0,
      crediteuren: 0,
      omzetbelasting: 0,
      overigeKortlopendeSchulden: 0,
    })
    // Het vermogen van daarvoor staat nergens: de vergelijking kan niet sluiten, en dat wordt gemeld.
    expect(jaarrekeningWaarschuwingen(imp)).toEqual(['mb-jaarrekening-begin-leeg', 'mb-jaarrekening-kapitaal'])
  })
})

describe('onderdelen van de jaarrekening', () => {
  const d = (naam: string, soort: string, rgsCode: string | null = null) => deelBalansrekeningIn({ naam, soort, rgsCode })

  it('balansrekeningen op RGS-code', () => {
    expect(d('X', 'equity', 'BEivFirFor')).toMatchObject({ soort: 'post', post: 'oudedagsreserve' })
    expect(d('X', 'equity', 'BEivKapPro')).toMatchObject({ soort: 'vermogen', prive: true })
    expect(d('X', 'equity', 'BEivKapPrs')).toMatchObject({ soort: 'vermogen', prive: true })
    expect(d('X', 'equity', 'BEivKa2Pbe')).toMatchObject({ soort: 'vermogen', prive: true })
    expect(d('Privé', 'equity', 'BEivKapOnd')).toMatchObject({ soort: 'vermogen', prive: false })
    expect(d('Privé algemeen', 'equity', 'BEivKap')).toMatchObject({ soort: 'vermogen', prive: true })
    expect(d('X', 'non_current_assets', 'BMvaTevVvp')).toMatchObject({ post: 'materieleVasteActiva', benadering: false })
    expect(d('X', 'non_current_assets', 'BIvaGooVvp')).toMatchObject({ post: 'materieleVasteActiva', benadering: true })
    expect(d('X', 'non_current_assets', 'BFvaOvrWaa')).toMatchObject({ post: 'overigeVorderingen', benadering: false })
    expect(d('X', 'non_current_assets', 'BFvaLenLen')).toMatchObject({ post: 'overigeVorderingen', benadering: true })
    expect(d('X', 'current_assets', 'BVrdOweVoo')).toMatchObject({ post: 'voorraden' })
    expect(d('X', 'current_assets', 'BProOnpGkn')).toMatchObject({ post: 'voorraden' })
    expect(d('X', 'current_assets', 'BVorDebHad')).toMatchObject({ post: 'handelsdebiteuren' })
    expect(d('X', 'current_assets', 'BVorVbkTvo')).toMatchObject({ post: 'omzetbelasting' })
    expect(d('X', 'current_assets', 'BVorVbkTvl')).toMatchObject({ post: 'overigeVorderingen' })
    expect(d('X', 'current_assets', 'BVorOvaVof')).toMatchObject({ post: 'overigeVorderingen' })
    expect(d('X', 'current_assets', 'BLimKruSto')).toMatchObject({ post: 'liquideMiddelen' })
    expect(d('X', 'provisions', 'BVrzOvzVvg')).toMatchObject({ post: 'voorzieningen' })
    expect(d('X', 'non_current_liabilities', 'BLasSakFvl')).toMatchObject({ post: 'langlopendeSchulden' })
    expect(d('X', 'current_liabilities', 'BSchCreHac')).toMatchObject({ post: 'crediteuren' })
    for (const c of ['BSchBepBla', 'BSchBepBlv', 'BSchBepBtw', 'BSchBepBaf', 'BSchBepEob']) expect(d('X', 'current_liabilities', c), c).toMatchObject({ post: 'omzetbelasting' })
    expect(d('X', 'current_liabilities', 'BSchBepLhe')).toMatchObject({ post: 'overigeKortlopendeSchulden' })
    expect(d('X', 'current_liabilities', 'BSchSakRba')).toMatchObject({ post: 'overigeKortlopendeSchulden' })
    // Codes van een eerdere versie van de import.
    expect(d('X', 'equity', 'BEivOdrOdr')).toMatchObject({ post: 'oudedagsreserve' })
    expect(d('X', 'equity', 'BEivPrv')).toMatchObject({ soort: 'vermogen', prive: true })
    expect(d('X', 'current_assets', 'BVorOnwOnw')).toMatchObject({ post: 'voorraden' })
  })

  it('zonder RGS-code: de soort, verfijnd op de naam; vlottende activa alleen met een duidelijke naam', () => {
    expect(d('Oudedagsreserve', 'equity')).toMatchObject({ post: 'oudedagsreserve' })
    expect(d('Privé opnamen', 'equity')).toMatchObject({ soort: 'vermogen', prive: true })
    expect(d('Kapitaal', 'equity')).toMatchObject({ soort: 'vermogen', prive: false })
    expect(d('Laptop', 'non_current_assets')).toMatchObject({ post: 'materieleVasteActiva' })
    expect(d('Borg bedrijfsruimte', 'non_current_assets')).toMatchObject({ post: 'overigeVorderingen' })
    expect(d('Debiteuren', 'current_assets')).toMatchObject({ post: 'handelsdebiteuren' })
    expect(d('Voorbelasting', 'current_assets')).toMatchObject({ post: 'omzetbelasting' })
    expect(d('Zakelijke bankrekening', 'current_assets')).toMatchObject({ post: 'liquideMiddelen' })
    expect(d('Kas', 'current_assets')).toMatchObject({ post: 'liquideMiddelen' })
    expect(d('Onderhanden projecten', 'current_assets')).toMatchObject({ post: 'voorraden' })
    expect(d('Nog te ontvangen bedragen', 'current_assets')).toMatchObject({ post: 'overigeVorderingen' })
    expect(d('Tussenrekening', 'current_assets')).toMatchObject({ soort: 'onbekend' })
    expect(d('Garantie', 'provisions')).toMatchObject({ post: 'voorzieningen' })
    expect(d('Lening', 'non_current_liabilities')).toMatchObject({ post: 'langlopendeSchulden' })
    expect(d('Crediteuren', 'current_liabilities')).toMatchObject({ post: 'crediteuren' })
    expect(d('Af te dragen btw', 'current_liabilities')).toMatchObject({ post: 'omzetbelasting' })
    expect(d('Loonheffing', 'current_liabilities')).toMatchObject({ post: 'overigeKortlopendeSchulden' })
    expect(d('Omzet', 'revenue')).toMatchObject({ soort: 'onbekend' })
    // Een W-code op de balans: terug naar de soort.
    expect(d('Debiteuren', 'current_assets', 'WOmzNodOdh')).toMatchObject({ post: 'handelsdebiteuren' })
  })

  it('afronden op een vaste som', () => {
    expect(rondAfOpSom([-45000.6, -25620.8, -6000, 2500], -74121)).toEqual([-45000, -25621, -6000, 2500])
    expect(rondAfOpSom([0.4, 0.4, 0.2], 1)).toEqual([1, 0, 0])
    expect(rondAfOpSom([100.2, 50.2], 150)).toEqual([100, 50])
    // Te groot verschil: gewoon afronden, het restant bij het grootste bedrag.
    expect(rondAfOpSom([100, 50], 160)).toEqual([110, 50])
    expect(rondAfOpSom([], 0)).toEqual([])
  })

  it('onderliggende rekeningen: meegeteld in de bovenliggende, of los als het totaal dat zegt', () => {
    const inclusief = balansMoment({ debit: { total: '100', current_assets: [{ ledger_account_id: '1', value: '100', children: [{ ledger_account_id: '2', value: '30' }] }] } })
    expect(inclusief!.bladen.map((b) => [b.id, b.waarde])).toEqual([
      ['1', 70],
      ['2', 30],
    ])
    const los = balansMoment({ debit: { total: '130', current_assets: [{ ledger_account_id: '1', value: '100', children: [{ ledger_account_id: '2', value: '30' }] }] } })
    expect(los!.bladen.map((b) => [b.id, b.waarde])).toEqual([
      ['1', 100],
      ['2', 30],
    ])
    expect(balansMoment(null)).toBeNull()
    expect(balansMoment({ credit: { open_years: [{ year: 2025, value: '12.5' }] } })!.openJaren).toBe(12.5)
  })

  it('specificaties en privéregels blijven binnen de grenzen van het dossier, met hetzelfde totaal', () => {
    expect(MB_MAX_SPECIFICATIES).toBe(JAARREKENING_GRENZEN.specificaties)
    expect(MB_MAX_PRIVEREGELS).toBe(JAARREKENING_GRENZEN.onttrekkingen)
    expect(MB_MAX_PRIVEREGELS).toBe(JAARREKENING_GRENZEN.stortingen)
    expect(MB_MAX_OMSCHRIJVING).toBe(JAARREKENING_GRENZEN.omschrijving)

    const rekeningen = new Map<string, BalansRekening>()
    const debet: Array<{ ledger_account_id: string; value: string }> = []
    const prive: Array<{ ledger_account_id: string; value: string }> = []
    for (let i = 1; i <= 60; i++) {
      rekeningen.set(`${i}`, { naam: `Bank ${i}`, rgsCode: 'BLimBanRba', soort: 'current_assets' })
      rekeningen.set(`${100 + i}`, { naam: `Privé ${i}`, rgsCode: 'BEivKapPro', soort: 'equity' })
      debet.push({ ledger_account_id: `${i}`, value: `${i * 10}` })
      prive.push({ ledger_account_id: `${100 + i}`, value: `${-i}` })
    }
    const totaal = 10 * (60 * 61) / 2
    const opnamen = (60 * 61) / 2
    const eind = balansMoment({ debit: { total: String(totaal), current_assets: debet }, credit: { total: String(totaal), equity: [{ ledger_account_id: '999', value: String(totaal + opnamen) }, ...prive] } })
    rekeningen.set('999', { naam: 'Kapitaal', rgsCode: 'BEivKapOnd', soort: 'equity' })
    const begin = balansMoment({ debit: { total: '0' }, credit: { total: '0' } })
    const uit = bouwJaarrekening({ begin, eind, rekeningen, activa: [], nettoWinst: totaal + opnamen, winstRegels: totaal + opnamen, peildatumBegin: '2024-12-31', peildatumEind: '2025-12-31' })
    const spec = uit.jaarrekening.specificaties!
    expect(spec.length).toBeLessThanOrEqual(MB_MAX_SPECIFICATIES)
    expect(spec.filter((s) => s.post === 'liquideMiddelen').map((s) => s.omschrijving)).toEqual(['Bank 58', 'Bank 59', 'Bank 60', 'Overige rekeningen'])
    expect(specificatieVerschillen({ ...uit.jaarrekening })).toEqual([])
    expect(uit.priveMutaties!.onttrekkingen).toHaveLength(MB_MAX_PRIVEREGELS)
    expect(uit.priveMutaties!.onttrekkingen.at(-1)!.omschrijving).toBe('Overige privé-onttrekkingen')
    expect(uit.priveMutaties!.onttrekkingen.reduce((s, r) => s + r.bedrag, 0)).toBe(opnamen)
    expect(beperkLijst([{ omschrijving: 'a', bedrag: 1 }], 'rest')).toEqual([{ omschrijving: 'a', bedrag: 1 }])
  })

  it('rubrieken volgen de categorie, binnen kosten de RGS-code en anders de naam', () => {
    const r = (categorie: MbGrootboekRegel['categorie'], naam: string, rgsCode: string | null = null, soort = 'expenses') => rubriekVoor({ categorie, naam, rgsCode, soort }, -1)
    expect(r('kosten', 'Huur', 'WBedHuiBeh')).toBe('huisvesting')
    expect(r('kosten', 'X', 'WBedTraOtr')).toBe('auto')
    expect(r('kosten', 'X', 'WBedVkkKmz')).toBe('auto')
    expect(r('kosten', 'X', 'WBedVkkRea')).toBe('verkoop')
    expect(r('kosten', 'X', 'WBedKanTef')).toBe('kantoor')
    expect(r('kosten', 'X', 'WPerLesSld')).toBe('personeel')
    expect(r('kosten', 'X', 'WKprKuwKuw')).toBe('inkoop')
    expect(r('kosten', 'Accountant', 'WBedAeaAea')).toBe('overig')
    // Een afschrijvingscode die de gebruiker als kosten indeelde, blijft bij de kosten.
    expect(r('kosten', 'X', 'WAfsAmvBei')).toBe('overig')
    expect(r('kosten', 'Kantoorhuur')).toBe('huisvesting')
    expect(r('kosten', 'Parkeren')).toBe('auto')
    expect(r('kosten', 'Leasekosten auto')).toBe('auto')
    expect(r('kosten', 'Advertenties')).toBe('verkoop')
    expect(r('kosten', 'Telefoon en internet')).toBe('kantoor')
    expect(r('kosten', 'Diversen')).toBe('overig')
    expect(r('kosten', 'Uitbesteed werk', null, 'direct_costs')).toBe('inkoop')
    expect(r('omzet', 'Mutatie onderhanden werk', null, 'revenue')).toBe('onderhandenWerk')
    expect(r('omzet', 'X', 'WWivGpvGpv', 'revenue')).toBe('omzet')
    expect(r('autokosten', 'X')).toBe('auto')
    expect(r('afschrijving', 'X')).toBe('afschrijvingen')
    expect(r('beperktAftrekbaar', 'X')).toBe('beperktAftrekbaar')
    expect(r('negeren', 'X')).toBeNull()
    expect(rubriekVoor({ categorie: 'financieel', naam: 'Rente', rgsCode: null, soort: 'other_income_expenses' }, 10)).toBe('financieleBaten')
    expect(rubriekVoor({ categorie: 'financieel', naam: 'Rente', rgsCode: null, soort: 'other_income_expenses' }, -10)).toBe('financieleLasten')
  })

  it('de som van de rubrieken is de netto winst volgens de indeling, voor elke indeling', () => {
    const regel = (id: string, soort: string, bijdrage: number, categorie: MbGrootboekRegel['categorie'], rgsCode: string | null = null): MbGrootboekRegel => ({
      ledgerAccountId: id, naam: `Rekening ${id}`, rgsCode, soort, bedrag: 0, categorie, voorstel: categorie, reden: '', aangepast: false, bijdrage,
    })
    const basis = [
      regel('1', 'revenue', 5000, 'omzet'),
      regel('2', 'revenue', -300, 'omzet', 'WWivWowWow'),
      regel('3', 'expenses', -700, 'kosten', 'WBedHuiBeh'),
      regel('4', 'expenses', 50, 'kosten'),
      regel('5', 'other_income_expenses', 20, 'financieel'),
      regel('6', 'other_income_expenses', -35, 'financieel'),
      regel('7', 'expenses', -90, 'beperktAftrekbaar'),
    ]
    const categorieen = ['omzet', 'kosten', 'afschrijving', 'beperktAftrekbaar', 'autokosten', 'financieel', 'negeren'] as const
    for (let i = 0; i < 49; i++) {
      const regels = basis.map((r, j) => ({ ...r, categorie: categorieen[(i + j * 3) % categorieen.length] }))
      const imp = herindeel({ regels, totalen: { nettoWinstMoneybird: 3945 } } as unknown as MbJaarImport, Object.fromEntries(regels.map((r) => [r.ledgerAccountId, r.categorie])))
      expect(wvTotalen(wvRubrieken(imp.regels)).saldo, `indeling ${i}`).toBe(berekenTotalen(imp.regels, 3945).nettoWinstIndeling)
    }
  })
})
