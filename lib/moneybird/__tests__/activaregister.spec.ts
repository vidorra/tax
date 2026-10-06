/**
 * Activaregister uit Moneybird (G03): de bedrijfsmiddelen uit de activamodule worden het fiscale register,
 * met een fiscale toets op het afschrijvingsplan in de import. Met de nep-Moneybird en losse imports.
 */
import { describe, expect, it } from 'vitest'
import { valideerInvoer } from '../../dossier/valideer'
import { berekenHuishouden } from '../../tax/engine'
import type { ActiefInvoer, HuishoudenInvoer, OndernemingInvoer } from '../../tax/types'
import { haalJaarImport } from '../import'
import { activaNaOvername, neemOver, overnameMeldingen, standaardLevensduur, paramsVoorActiva, type UitkomstVoorOvername } from '../overname'
import type { MbJaarImport } from '../types'
import { NEP_ADM, NEP_TOKEN, nepMoneybird, type NepOpties } from './fixtures/nep'

const ADM = { id: NEP_ADM, naam: 'Studio Voorbeeld' }
const NA_JAAREINDE = new Date('2026-03-01T10:00:00Z')

async function importeer(nep: NepOpties = {}, jaar = 2025, nu = NA_JAAREINDE) {
  const n = nepMoneybird(nep)
  return haalJaarImport(NEP_TOKEN, ADM, jaar, {}, '7', nu, { fetch: n.fetch, wacht: async () => undefined })
}

/** Eigen lijst bedrijfsmiddelen in plaats van de fixture. */
const activaVervang = (activa: unknown[]): NepOpties['vervang'] => (pad) => (pad === '/assets.json' ? activa : undefined)

/** Moneybird-actief met een maandelijks waardeverloop vanaf de maand na aanschaf. */
function mbActief(id: string, naam: string, datum: string, waarde: number, jaren: number, rest = 0, tot = '2025-12-31') {
  const perMaand = Math.round(((waarde - rest) / jaren / 12) * 100) / 100
  const changes: Array<{ date: string; amount: string }> = []
  let [j, m] = datum.split('-').map(Number)
  for (;;) {
    m += 1
    if (m > 12) {
      m = 1
      j += 1
    }
    const d = `${j}-${String(m).padStart(2, '0')}-28`
    if (d > tot) break
    changes.push({ date: d, amount: (-perMaand).toFixed(2) })
  }
  return {
    id,
    name: naam,
    ledger_account_id: '101',
    purchase_date: datum,
    purchase_value: waarde.toFixed(1),
    current_value: '0.0',
    value_change_plan: { lifespan_in_years: jaren, residual_value: rest.toFixed(1) },
    disposal: null,
    value_changes: changes,
  }
}

/** Kale import voor de overname zonder Moneybird-verkeer. */
function kaleImport(jaar: number, activa: MbJaarImport['activa'], extra: Partial<MbJaarImport> = {}): MbJaarImport {
  return {
    koppelingId: '7',
    administratie: { id: '123', naam: 'Meubelmakerij' },
    jaar,
    opgehaaldOp: `${jaar + 1}-02-01T10:00:00.000Z`,
    regels: [],
    totalen: { omzet: 90000, kosten: 20000, afschrijvingen: 2000, beperktAftrekbaar: 0, autokosten: 0, financieel: 0, nettoWinstMoneybird: 68000, nettoWinstIndeling: 68000, verschil: 0 },
    balans: { ondernemingsvermogenBegin: null, ondernemingsvermogenEinde: null, forStand: null, onderhandenWerkBegin: null, onderhandenWerkEind: null },
    investeringen: [],
    desinvesteringen: [],
    activa,
    opdrachtgevers: [],
    uren: null,
    waarschuwingen: [],
    ...extra,
  }
}

const huishouden = (o: OndernemingInvoer, jaar: number): HuishoudenInvoer => ({
  jaar,
  fiscaalPartner: false,
  kinderen: [],
  personen: [{ id: 'A', geboortedatum: '1988-06-15', ondernemingen: [o], loon: [], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 } }],
  box3: { posities: [], schulden: [] },
  verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
})

const winstVan = (o: OndernemingInvoer, jaar: number) => berekenHuishouden(huishouden(o, jaar), { zonderMarginaleDruk: true }).personen[0].ondernemingen[0]

describe('import: fiscale toets op de activa uit Moneybird', () => {
  it('meldt een afschrijving sneller dan 20% per jaar, en een afgestoten middel', async () => {
    const imp = await importeer()
    const termijn = imp.waarschuwingen.filter((w) => w.id.startsWith('mb-afschrijving-termijn-'))
    // Alleen de Werkstation (4 jaar zonder restwaarde = 25%); bestelbus en auto blijven door hun restwaarde onder de 20%.
    expect(termijn).toHaveLength(1)
    expect(termijn[0]).toMatchObject({ id: 'mb-afschrijving-termijn-0', ernst: 'let-op' })
    expect(termijn[0].tekst).toContain('Moneybird schrijft "Werkstation" af in 4 jaar; fiscaal mag maximaal 20% per jaar')
    // De verkochte bureaustoel staat niet in het register; dat meldt de overname (het hangt af van het register).
    expect(imp.waarschuwingen.some((w) => w.id.startsWith('mb-afschrijving-afgestoten'))).toBe(false)
    const afgestoten = overnameMeldingen(undefined, imp).find((w) => w.id === 'mb-afschrijving-afgestoten-0')
    expect(afgestoten?.tekst).toContain('"Bureaustoel" is dit jaar afgestoten en staat niet in het activaregister')
    // Monitor onder de 450 euro zonder plan: geen melding, die mag direct.
    expect(imp.waarschuwingen.some((w) => w.id.startsWith('mb-afschrijving-plan-'))).toBe(false)
  })

  it('zonder afschrijvingsplan: de standaardlevensduur in de melding is die van het register', async () => {
    const imp = await importeer({
      vervang: activaVervang([
        { id: '1', name: 'Server', purchase_date: '2025-02-01', purchase_value: '2000.0', current_value: '1900.0', value_change_plan: null, disposal: null },
        { id: '2', name: 'Goodwill klantenbestand', purchase_date: '2025-01-01', purchase_value: '30000.0', current_value: '30000.0', value_change_plan: null, disposal: null },
      ]),
    })
    const plan = imp.waarschuwingen.filter((w) => w.id.startsWith('mb-afschrijving-plan-'))
    expect(plan.map((w) => w.tekst)).toEqual([
      expect.stringContaining('In het activaregister rekenen we met 5 jaar zonder restwaarde'),
      expect.stringContaining('In het activaregister rekenen we met 10 jaar zonder restwaarde'),
    ])
    const o = neemOver(undefined, imp)
    expect(o.activa?.map((a) => [a.omschrijving, a.levensduurJaren, a.soort])).toEqual([
      ['Server', 5, undefined],
      ['Goodwill klantenbestand', 10, 'goodwill'],
    ])
  })

  it('goodwill: de grens is 10% per jaar en er is geen investeringsaftrek', async () => {
    const imp = await importeer({ vervang: activaVervang([mbActief('1', 'Goodwill praktijk', '2025-01-01', 50000, 5)]) })
    const w = imp.waarschuwingen.find((x) => x.id === 'mb-afschrijving-termijn-0')
    expect(w?.tekst).toContain('fiscaal mag maximaal 10% per jaar voor goodwill')
    expect(imp.investeringen).toEqual([{ omschrijving: 'Goodwill praktijk', datum: '2025-01-01', bedrag: 50000, regeling: 'kia', uitgesloten: true }])
    expect(imp.waarschuwingen.some((x) => x.id === 'mb-goodwill-0')).toBe(true)
    expect(neemOver(undefined, imp).activa?.[0]).toMatchObject({ soort: 'goodwill', levensduurJaren: 5 })
  })

  it('waarschuwt als de geboekte afschrijving niet uit de activamodule komt', async () => {
    // In de winst- en verliesrekening staat 1.500 afschrijving; de module boekt op de laptop in 2025 maar 733 (11 maanden).
    const imp = await importeer({ vervang: activaVervang([mbActief('1', 'Laptop', '2025-01-15', 2400, 3)]) })
    expect(imp.totalen.afschrijvingen).toBe(1500)
    const w = imp.waarschuwingen.find((x) => x.id === 'mb-afschrijving-buiten-module')
    expect(w?.ernst).toBe('let-op')
    expect(w?.tekst).toContain('€ 1.500 aan afschrijving, en in de activamodule € 733')
  })

  it('geen waarschuwing als de activamodule de geboekte afschrijving verklaart, ook met een middel van een eerder jaar', async () => {
    // Camera: 3.600 in 3 jaar, 100 per maand vanaf februari 2024, dus 1.200 in 2025. Monitor uit juli 2025: 5 x 60 = 300.
    const activa = [mbActief('1', 'Camera', '2024-01-10', 3600, 3), mbActief('2', 'Monitor', '2025-07-01', 2160, 3)]
    const imp = await importeer({ vervang: activaVervang(activa) })
    expect(imp.waarschuwingen.some((w) => w.id === 'mb-afschrijving-buiten-module')).toBe(false)
  })

  it('zonder waardeverloop is de vergelijking niet te maken en blijft de melding weg', async () => {
    const imp = await importeer()
    expect(imp.waarschuwingen.some((w) => w.id === 'mb-afschrijving-buiten-module')).toBe(false)
  })
})

describe('overname: het activaregister uit Moneybird', () => {
  it('nep-Moneybird: elk middel uit de activamodule met bron moneybird, geldig voor het dossier', async () => {
    const imp = await importeer()
    const o = neemOver(undefined, imp)
    expect(o.activa).toEqual([
      { omschrijving: 'Werkstation', aanschafdatum: '2025-03-14', aanschafwaarde: 3200, restwaarde: 0, levensduurJaren: 4, methode: 'lineair', bron: 'moneybird' },
      { omschrijving: 'Elektrische personenauto', aanschafdatum: '2025-05-01', aanschafwaarde: 45000, restwaarde: 15000, levensduurJaren: 5, methode: 'lineair', bron: 'moneybird' },
      { omschrijving: 'Monitor', aanschafdatum: '2021-01-10', aanschafwaarde: 400, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', bron: 'moneybird' },
      { omschrijving: 'Bestelbus', aanschafdatum: '2025-11-01', aanschafwaarde: 18000, restwaarde: 3000, levensduurJaren: 5, methode: 'lineair', bron: 'moneybird' },
    ])
    // De geboekte afschrijving blijft als handmatige afschrijving staan; het register uit Moneybird geldt als volledig.
    expect(o.winstberekening).toMatchObject({ soort: 'uitgesplitst', afschrijvingen: 1500 })
    expect(o.activaVolledig).toBe(true)
    expect(o.desinvesteringen).toEqual([{ omschrijving: 'Bureaustoel', verkoopprijs: 150, investeringsjaar: 2022, genotenPct: 0.28 }])
    expect(valideerInvoer(huishouden(o, 2025))).toEqual([])
  })

  it('engine: de fiscale afschrijving vervangt de geboekte, het verschil komt in de winst', () => {
    // Laptop van 6.000 in 3 jaar: Moneybird boekt 2.000, fiscaal mag 1.200 (20%). De winst wordt 800 hoger.
    const imp = kaleImport(2026, [{ naam: 'Laptop', aanschafdatum: '2025-01-01', aanschafwaarde: 6000, boekwaarde: 2000, levensduurJaren: 3, restwaarde: 0 }])
    const met = neemOver(undefined, imp)
    expect(met.activa).toHaveLength(1)
    const { activa: _a, ...zonder } = met
    const r = winstVan(met, 2026)
    expect(r.afschrijvingen?.[0]).toMatchObject({ omschrijving: 'Laptop', afschrijving: 1200, boekwaardeBegin: 4800, boekwaardeEind: 3600 })
    expect(r.winst - winstVan(zonder, 2026).winst).toBe(2000 - 1200)
  })

  it('met de hand toegevoegd blijft staan; hetzelfde middel uit Moneybird komt er niet nog een keer bij', () => {
    const eigen: ActiefInvoer = { omschrijving: 'Laptop (eigen)', aanschafdatum: '2025-01-01', aanschafwaarde: 6000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', bron: 'handmatig' }
    const ander: ActiefInvoer = { omschrijving: 'Kast', aanschafdatum: '2023-04-01', aanschafwaarde: 900, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' }
    const imp = kaleImport(2026, [
      { naam: 'Laptop', aanschafdatum: '2025-01-01', aanschafwaarde: 6000, boekwaarde: 2000, levensduurJaren: 3, restwaarde: 0 },
      { naam: 'Printer', aanschafdatum: '2026-03-01', aanschafwaarde: 800, boekwaarde: 700, levensduurJaren: 5, restwaarde: 0 },
    ])
    const activa = activaNaOvername([eigen, ander], imp)
    expect(activa?.map((a) => [a.omschrijving, a.bron])).toEqual([
      ['Printer', 'moneybird'],
      ['Laptop (eigen)', 'handmatig'],
      ['Kast', undefined],
    ])
    expect(activa?.[1]).toBe(eigen)
  })

  it('een eigen regel voor een investering van dit jaar krijgt de investeringsaftrek erbij, verder blijft hij gelijk', () => {
    const eigen: ActiefInvoer = { omschrijving: 'Laptop', aanschafdatum: '2026-03-01', aanschafwaarde: 3200, restwaarde: 200, levensduurJaren: 5, methode: 'lineair', bron: 'handmatig' }
    const imp = kaleImport(2026, [{ naam: 'Werkstation', aanschafdatum: '2026-03-01', aanschafwaarde: 3200, boekwaarde: 2600, levensduurJaren: 3, restwaarde: 0 }], {
      investeringen: [{ omschrijving: 'Werkstation', datum: '2026-03-01', bedrag: 3200, regeling: 'kia' }],
    })
    const uitkomst: UitkomstVoorOvername = {
      investeringsaftrekPerMiddel: [{ omschrijving: 'Werkstation', datum: '2026-03-01', regeling: 'kia', bedrag: 3200, betaald: 3200, aftrek: 896, genotenPct: 0.28 }],
    }
    expect(activaNaOvername([eigen], imp, uitkomst)).toEqual([{ ...eigen, investeringsaftrek: { regeling: 'kia', jaar: 2026, genotenPct: 0.28 } }])
  })

  it('opnieuw importeren: keuzes die niet uit Moneybird komen blijven, de rest wordt bijgewerkt', () => {
    const vorig: ActiefInvoer = {
      omschrijving: 'Zonnepanelen',
      aanschafdatum: '2025-06-01',
      aanschafwaarde: 12000,
      restwaarde: 0,
      levensduurJaren: 10,
      methode: 'vamil',
      willekeurigBedrag: 5000,
      boekwaardeBegin: 6000,
      investeringsaftrek: { regeling: 'mia-2', jaar: 2025, genotenPct: 0.27 },
      bron: 'moneybird',
    }
    const weg: ActiefInvoer = { omschrijving: 'Oude telefoon', aanschafdatum: '2022-01-01', aanschafwaarde: 900, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', bron: 'moneybird' }
    const imp = kaleImport(2026, [{ naam: 'Zonnepanelen dak', aanschafdatum: '2025-06-01', aanschafwaarde: 12000, boekwaarde: 10000, levensduurJaren: 15, restwaarde: 500 }])
    expect(activaNaOvername([vorig, weg], imp)).toEqual([
      {
        omschrijving: 'Zonnepanelen dak',
        aanschafdatum: '2025-06-01',
        aanschafwaarde: 12000,
        restwaarde: 500,
        levensduurJaren: 15,
        methode: 'vamil',
        willekeurigBedrag: 5000,
        boekwaardeBegin: 6000,
        investeringsaftrek: { regeling: 'mia-2', jaar: 2025, genotenPct: 0.27 },
        bron: 'moneybird',
      },
    ])
  })

  it('een middel uit een investering van vorig jaar wordt het middel uit Moneybird, met de investeringsaftrek', () => {
    const uitInvestering: ActiefInvoer = {
      omschrijving: 'Camera',
      aanschafdatum: '2025-09-01',
      aanschafwaarde: 4000,
      restwaarde: 0,
      levensduurJaren: 5,
      methode: 'lineair',
      investeringsaftrek: { regeling: 'kia', jaar: 2025, genotenPct: 0.28 },
      bron: 'investering',
    }
    const imp = kaleImport(2026, [{ naam: 'Fotocamera', aanschafdatum: '2025-09-01', aanschafwaarde: 4000, boekwaarde: 3500, levensduurJaren: 4, restwaarde: 0 }])
    expect(activaNaOvername([uitInvestering], imp)).toEqual([
      {
        omschrijving: 'Fotocamera',
        aanschafdatum: '2025-09-01',
        aanschafwaarde: 4000,
        restwaarde: 0,
        levensduurJaren: 4,
        methode: 'lineair',
        investeringsaftrek: { regeling: 'kia', jaar: 2025, genotenPct: 0.28 },
        bron: 'moneybird',
      },
    ])
  })

  it('investeringen uit het jaar krijgen het genoten percentage uit de uitkomst; zonder uitkomst blijft het leeg', () => {
    const imp = kaleImport(
      2026,
      [
        { naam: 'Laptop', aanschafdatum: '2026-03-01', aanschafwaarde: 3200, boekwaarde: 2600, levensduurJaren: 5, restwaarde: 0 },
        { naam: 'Auto', aanschafdatum: '2026-04-01', aanschafwaarde: 40000, boekwaarde: 38000, levensduurJaren: 5, restwaarde: 10000 },
        { naam: 'Bureau', aanschafdatum: '2024-02-01', aanschafwaarde: 1500, boekwaarde: 900, levensduurJaren: 5, restwaarde: 0 },
      ],
      {
        investeringen: [
          { omschrijving: 'Laptop', datum: '2026-03-01', bedrag: 3200, regeling: 'kia' },
          { omschrijving: 'Auto', datum: '2026-04-01', bedrag: 40000, regeling: 'kia', uitgesloten: true },
        ],
      },
    )
    const uitkomst: UitkomstVoorOvername = {
      investeringsaftrekPerMiddel: [{ omschrijving: 'Laptop', datum: '2026-03-01', regeling: 'kia', bedrag: 3200, betaald: 3200, aftrek: 896 }],
    }
    const met = activaNaOvername(undefined, imp, uitkomst)!
    expect(met.map((a) => a.investeringsaftrek)).toEqual([{ regeling: 'kia', jaar: 2026, genotenPct: 0.28 }, undefined, undefined])
    expect(activaNaOvername(undefined, imp)!.every((a) => a.investeringsaftrek === undefined)).toBe(true)
  })

  it('genoten investeringsaftrek uit de engine zelf: eerst overnemen, dan met de uitkomst opnieuw', () => {
    const imp = kaleImport(2026, [{ naam: 'Laptop', aanschafdatum: '2026-03-01', aanschafwaarde: 3200, boekwaarde: 2600, levensduurJaren: 5, restwaarde: 0 }], {
      investeringen: [{ omschrijving: 'Laptop', datum: '2026-03-01', bedrag: 3200, regeling: 'kia' }],
    })
    const eerst = neemOver(undefined, imp)
    expect(eerst.activa?.[0].investeringsaftrek).toBeUndefined()
    const uitkomst = winstVan(eerst, 2026)
    const tweede = neemOver(eerst, imp, {}, uitkomst)
    const kia = uitkomst.investeringsaftrekPerMiddel?.[0]
    expect(kia?.aftrek).toBeGreaterThan(0)
    expect(tweede.activa?.[0].investeringsaftrek).toEqual({ regeling: 'kia', jaar: 2026, genotenPct: Math.round((kia!.aftrek / kia!.betaald) * 10000) / 10000 })
  })

  it('een latere verkoop geeft de desinvesteringsbijtelling met het vastgelegde percentage', () => {
    // 2026: laptop van 5.000 uit Moneybird met KIA; na de tweede overname staat het genoten percentage in het register.
    const imp = kaleImport(2026, [{ naam: 'Laptop', aanschafdatum: '2026-02-01', aanschafwaarde: 5000, boekwaarde: 4000, levensduurJaren: 5, restwaarde: 0 }], {
      investeringen: [{ omschrijving: 'Laptop', datum: '2026-02-01', bedrag: 5000, regeling: 'kia' }],
    })
    const eerst = neemOver(undefined, imp)
    const o2026 = neemOver(eerst, imp, {}, winstVan(eerst, 2026))
    const aftrek = o2026.activa![0].investeringsaftrek!
    expect(aftrek).toMatchObject({ regeling: 'kia', jaar: 2026 })
    // 2027: hetzelfde register, verkocht voor 3.000 (boven de drempel): bijtelling = genoten percentage × verkoopprijs.
    const o2027: OndernemingInvoer = {
      ...o2026,
      investeringen: undefined,
      desinvesteringen: undefined,
      activa: [{ ...o2026.activa![0], verkocht: { datum: '2027-06-30', verkoopprijs: 3000 } }],
    }
    const r = winstVan(o2027, 2027)
    expect(r.desinvesteringsbijtelling).toBe(Math.round(aftrek.genotenPct * 3000))
  })

  it('onder de KIA-drempel: 0% wordt vastgelegd, en dat percentage gaat voor bij een latere desinvestering uit Moneybird', () => {
    const imp = kaleImport(2026, [{ naam: 'Monitor', aanschafdatum: '2026-05-01', aanschafwaarde: 1500, boekwaarde: 1300, levensduurJaren: 5, restwaarde: 0 }], {
      investeringen: [{ omschrijving: 'Monitor', datum: '2026-05-01', bedrag: 1500, regeling: 'kia' }],
    })
    const eerst = neemOver(undefined, imp)
    const uitkomst = winstVan(eerst, 2026)
    expect(uitkomst.kia).toBe(0)
    const o2026 = neemOver(eerst, imp, {}, uitkomst)
    expect(o2026.activa?.[0].investeringsaftrek).toEqual({ regeling: 'kia', jaar: 2026, genotenPct: 0 })
    // 2027: Moneybird meldt de verkoop; de import neemt 28% aan, het register weet dat het 0% was.
    const imp2027 = kaleImport(2027, [], { desinvesteringen: [{ omschrijving: 'Monitor', verkoopprijs: 3000, investeringsjaar: 2026, genotenPct: 0.28 }] })
    const o2027 = neemOver(o2026, imp2027)
    expect(o2027.desinvesteringen).toEqual([{ omschrijving: 'Monitor', verkoopprijs: 3000, investeringsjaar: 2026, genotenPct: 0 }])
    expect(o2027.activa).toBeUndefined()
    // Zonder register blijft de aanname van de import staan.
    expect(neemOver(undefined, imp2027).desinvesteringen?.[0].genotenPct).toBe(0.28)
  })

  it('zonder activa uit Moneybird (scope ontbreekt) blijft het register zoals het was', () => {
    const bestaand: ActiefInvoer[] = [{ omschrijving: 'Laptop', aanschafdatum: '2025-01-01', aanschafwaarde: 6000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', bron: 'moneybird' }]
    const imp = kaleImport(2026, [], { waarschuwingen: [{ id: 'mb-scope-activa', ernst: 'let-op', tekst: 'De vaste activa is overgeslagen' }] })
    expect(activaNaOvername(bestaand, imp)).toBe(bestaand)
    // Met een gewone lege activamodule verdwijnen de middelen uit Moneybird wel.
    expect(activaNaOvername(bestaand, kaleImport(2026, []))).toBeUndefined()
  })

  it('standaardlevensduur volgt de parameters: 1 / maximaal percentage per jaar', () => {
    const p = paramsVoorActiva(2026)
    expect(standaardLevensduur(p, false)).toBe(Math.ceil(1 / p!.ondernemer.waarde.afschrijving.maxPctPerJaar))
    expect(standaardLevensduur(p, true)).toBe(Math.ceil(1 / p!.ondernemer.waarde.afschrijving.goodwillPct))
    // Een jaar zonder parameters valt terug op het laatste jaar.
    expect(paramsVoorActiva(1990)).not.toBeNull()
  })
})

describe('overname: een in Moneybird afgestoten middel en het register', () => {
  const camera: ActiefInvoer = {
    omschrijving: 'Camera met objectief',
    aanschafdatum: '2025-03-01',
    aanschafwaarde: 4000,
    restwaarde: 0,
    levensduurJaren: 5,
    methode: 'lineair',
    investeringsaftrek: { regeling: 'kia', jaar: 2025, genotenPct: 0.28 },
    bron: 'investering',
    herkomst: 'inv:2025:0',
  }
  const cameraVerkocht = { naam: 'Camera met objectief', aanschafdatum: '2025-03-01', aanschafwaarde: 4000, datum: '2026-06-30', verkoopprijs: 3500, prijsBekend: true }
  const metVerkoop = (afgestoten: NonNullable<MbJaarImport['afgestoten']>, activa: MbJaarImport['activa'] = [], extra: Partial<MbJaarImport> = {}) =>
    kaleImport(2026, activa, {
      desinvesteringen: afgestoten.map((d) => ({ omschrijving: d.naam, verkoopprijs: d.verkoopprijs, investeringsjaar: Number(d.aanschafdatum.slice(0, 4)), genotenPct: 0.28 })),
      afgestoten,
      ...extra,
    })
  const onderneming = (activa: ActiefInvoer[]): OndernemingInvoer => ({ naam: 'Meubelmakerij', winstberekening: { soort: 'uitgesplitst', omzet: 80000, kosten: 15000, afschrijvingen: 0 }, uren: { onderneming: 0, urencriteriumGehaald: true }, startjaar: 2015, activa })

  it('een doorgerolde investering krijgt de verkoop en gaat uit de lijst: afschrijving tot de verkoop, bijtelling één keer', () => {
    const imp = metVerkoop([cameraVerkocht])
    const o = neemOver(onderneming([camera]), imp)
    expect(o.activa).toEqual([{ ...camera, bron: 'moneybird', verkocht: { datum: '2026-06-30', verkoopprijs: 3500 } }])
    expect(o.desinvesteringen).toEqual([])
    expect(o.activaVolledig).toBe(true)
    const r = winstVan(o, 2026)
    // 4.000 in 5 jaar, een half jaar tot de verkoop: 400, zoals Moneybird boekte. Bijtelling 28% van 3.500, één keer.
    expect(r.afschrijvingen?.[0]).toMatchObject({ afschrijving: 400, boekwaardeEind: 0, verkochtDitJaar: true })
    expect(r.desinvesteringsbijtelling).toBe(Math.round(0.28 * 3500))
    const w = overnameMeldingen(onderneming([camera]), imp)
    expect(w.map((x) => x.id)).toEqual(['mb-verkoop-register-0'])
    expect(w[0].tekst).toContain("zet die rekening dan op 'niet meenemen', anders telt het dubbel")
  })

  it('een middel uit een eerdere Moneybird-import blijft in het register, met de verkoop', () => {
    const laptop: ActiefInvoer = { omschrijving: 'Laptop', aanschafdatum: '2024-05-01', aanschafwaarde: 2500, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', boekwaardeBegin: 1750, bron: 'moneybird' }
    const imp = metVerkoop([{ naam: 'Laptop werk', aanschafdatum: '2024-05-01', aanschafwaarde: 2500, datum: '2026-02-15', verkoopprijs: 900, prijsBekend: true }])
    const o = neemOver(onderneming([laptop]), imp)
    expect(o.activa).toEqual([{ ...laptop, verkocht: { datum: '2026-02-15', verkoopprijs: 900 }, investeringsaftrek: { regeling: 'kia', jaar: 2024, genotenPct: 0.28 } }])
    expect(o.desinvesteringen).toEqual([])
  })

  it('koppelen op naam en aanschafjaar als datum of bedrag in Moneybird anders is', () => {
    const imp = metVerkoop([{ ...cameraVerkocht, aanschafdatum: '2025-03-04', aanschafwaarde: 4040 }])
    expect(activaNaOvername([camera], imp)?.[0].verkocht).toEqual({ datum: '2026-06-30', verkoopprijs: 3500 })
    // Een andere naam en een ander bedrag: niet gekoppeld.
    const anders = metVerkoop([{ ...cameraVerkocht, naam: 'Statief', aanschafwaarde: 300 }])
    expect(activaNaOvername([camera], anders)).toEqual([camera])
  })

  it('zonder prijs in Moneybird blijft een verkoop die al in het register stond staan', () => {
    const metEigenVerkoop = { ...camera, verkocht: { datum: '2026-06-28', verkoopprijs: 3400 } }
    const imp = metVerkoop([{ ...cameraVerkocht, verkoopprijs: 0, prijsBekend: false }])
    expect(activaNaOvername([metEigenVerkoop], imp)?.[0].verkocht).toEqual({ datum: '2026-06-28', verkoopprijs: 3400 })
    // Met een prijs in Moneybird gaat Moneybird voor.
    expect(activaNaOvername([metEigenVerkoop], metVerkoop([cameraVerkocht]))?.[0].verkocht).toEqual({ datum: '2026-06-30', verkoopprijs: 3500 })
  })

  it('al in een eerder jaar verkocht: niet opnieuw gekoppeld', () => {
    const oud = { ...camera, verkocht: { datum: '2025-12-01', verkoopprijs: 3800 } }
    const imp = metVerkoop([cameraVerkocht])
    const o = neemOver(onderneming([oud]), imp)
    expect(o.activa).toEqual([oud])
    expect(o.desinvesteringen).toHaveLength(1)
  })

  it('niet in het register: blijft bij de verkochte bedrijfsmiddelen, met een melding', () => {
    const bureau: ActiefInvoer = { omschrijving: 'Bureau', aanschafdatum: '2023-02-01', aanschafwaarde: 900, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', bron: 'handmatig' }
    const imp = metVerkoop([cameraVerkocht])
    const o = neemOver(onderneming([bureau]), imp)
    expect(o.activa).toEqual([bureau])
    expect(o.desinvesteringen).toEqual([{ omschrijving: 'Camera met objectief', verkoopprijs: 3500, investeringsjaar: 2025, genotenPct: 0.28 }])
    // Het register telt niet mee (geen middelen uit Moneybird, niet volledig): de geboekte afschrijving blijft, geen melding.
    expect(overnameMeldingen(onderneming([bureau]), imp)).toEqual([])
    // Vervangt het register de geboekte afschrijving wel, dan valt de afschrijving tot de verkoop weg: een melding.
    const w = overnameMeldingen({ ...onderneming([bureau]), activaVolledig: true }, imp)
    expect(w.map((x) => [x.id, x.ernst])).toEqual([['mb-afschrijving-afgestoten-0', 'info']])
    const metModule = metVerkoop([cameraVerkocht], [{ naam: 'Laptop', aanschafdatum: '2026-01-10', aanschafwaarde: 2000, boekwaarde: 1700, levensduurJaren: 5, restwaarde: 0 }])
    expect(overnameMeldingen(onderneming([bureau]), metModule).map((x) => x.id)).toEqual(['mb-afschrijving-afgestoten-0'])
    // Zonder register valt er niets te koppelen en is er ook geen afschrijving die wegvalt.
    expect(overnameMeldingen(undefined, imp)).toEqual([])
  })

  it('als eigen regel in het register zonder verkoop: een melding om de verkoop daar te zetten', () => {
    const eigen: ActiefInvoer = { ...camera, omschrijving: 'Camera (eigen)', bron: 'handmatig' }
    const imp = metVerkoop([cameraVerkocht])
    const o = neemOver(onderneming([eigen]), imp)
    expect(o.activa).toEqual([eigen])
    expect(o.desinvesteringen).toHaveLength(1)
    const w = overnameMeldingen(onderneming([eigen]), imp)
    expect(w.map((x) => x.id)).toEqual(['mb-verkoop-eigen-0'])
    expect(w[0].tekst).toContain('als je eigen regel "Camera (eigen)" zonder verkoop')
  })

  it('zonder genoten investeringsaftrek in het register komt de aanname van de import erbij', () => {
    const { investeringsaftrek: _ia, ...zonder } = camera
    const a = activaNaOvername([zonder], metVerkoop([cameraVerkocht]))
    expect(a?.[0].investeringsaftrek).toEqual({ regeling: 'kia', jaar: 2025, genotenPct: 0.28 })
  })

  it('investeringen niet overnemen: de lijst blijft, het register krijgt wel de verkoop', () => {
    const eigenLijst = [{ omschrijving: 'Camera', verkoopprijs: 3500, investeringsjaar: 2025, genotenPct: 0.28 }]
    const o = neemOver({ ...onderneming([camera]), desinvesteringen: eigenLijst }, metVerkoop([cameraVerkocht]), { investeringen: false })
    expect(o.desinvesteringen).toEqual(eigenLijst)
    expect(o.activa?.[0].verkocht).toEqual({ datum: '2026-06-30', verkoopprijs: 3500 })
    const w = overnameMeldingen(onderneming([camera]), metVerkoop([cameraVerkocht]), { investeringen: false })
    expect(w[0].tekst).toContain('Staat het ook in je eigen lijst met verkochte bedrijfsmiddelen, haal het daar dan weg.')
  })

  it('een investering die niet in de activamodule staat: melding dat die mogelijk dubbel in het register staat', () => {
    const imp = kaleImport(2026, [{ naam: 'Fotocamera', aanschafdatum: '2025-03-15', aanschafwaarde: 4000, boekwaarde: 3300, levensduurJaren: 5, restwaarde: 0 }])
    const w = overnameMeldingen(onderneming([camera]), imp)
    expect(w.map((x) => [x.id, x.ernst])).toEqual([['mb-register-los-0', 'let-op']])
    expect(w[0].tekst).toContain('"Camera met objectief" (gekocht op 01-03-2025 voor € 4.000)')
    // Herkend op datum en bedrag: geen melding.
    expect(overnameMeldingen(onderneming([camera]), kaleImport(2026, [{ naam: 'Fotocamera', aanschafdatum: '2025-03-01', aanschafwaarde: 4000, boekwaarde: 3300, levensduurJaren: 5, restwaarde: 0 }]))).toEqual([])
  })

  it('de herkomst van een doorgerold middel blijft bij het middel uit Moneybird', () => {
    const imp = kaleImport(2026, [{ naam: 'Fotocamera', aanschafdatum: '2025-03-01', aanschafwaarde: 4000, boekwaarde: 3300, levensduurJaren: 4, restwaarde: 0 }])
    expect(activaNaOvername([camera], imp)?.[0]).toMatchObject({ omschrijving: 'Fotocamera', herkomst: 'inv:2025:0', bron: 'moneybird' })
  })

  it('activaVolledig: alleen met middelen uit Moneybird in het register; zonder activa of scope blijft de keuze staan', () => {
    const bureau: ActiefInvoer = { omschrijving: 'Bureau', aanschafdatum: '2023-02-01', aanschafwaarde: 900, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', bron: 'handmatig' }
    // Lege activamodule: het register is alleen de eigen regel, dus geen register uit Moneybird.
    expect(neemOver(onderneming([bureau]), kaleImport(2026, [])).activaVolledig).toBeUndefined()
    expect(neemOver({ ...onderneming([bureau]), activaVolledig: false }, kaleImport(2026, [])).activaVolledig).toBe(false)
    // Scope ontbreekt: het register is niet bijgewerkt.
    const zonderScope = kaleImport(2026, [], { waarschuwingen: [{ id: 'mb-scope-activa', ernst: 'let-op', tekst: 'overgeslagen' }] })
    expect(neemOver(onderneming([{ ...camera, bron: 'moneybird' }]), zonderScope).activaVolledig).toBeUndefined()
    // Met een middel uit de activamodule wel.
    expect(neemOver(onderneming([bureau]), kaleImport(2026, [{ naam: 'Laptop', aanschafdatum: '2026-01-10', aanschafwaarde: 2000, boekwaarde: 1700, levensduurJaren: 5, restwaarde: 0 }])).activaVolledig).toBe(true)
  })
})

