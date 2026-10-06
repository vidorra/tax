import { describe, expect, it } from 'vitest'
import { berekenBox3, type Box3Context } from '../../modules/box3'
import { getJaar, kloon } from '../../years'
import type { Box3Invoer, TaxYearParams, VermogensPositie } from '../../types'

/** Box 3-vermogen van het verzonnen voorbeeldhuishouden 2024 (lib/voorbeeld). */
function voorbeeld2024(brutoInkomstenVS: number): Box3Invoer {
  return {
    posities: [
      { id: 'bank-nl', omschrijving: 'Bank Nederland', categorie: 'bankNL', eigenaar: 'A', waardeBegin: 50900, waardeEind: 50200 },
      { id: 'spaar-b', omschrijving: 'Spaarrekening in Duitsland', categorie: 'bankBuitenland', eigenaar: 'B', waardeBegin: 9800, waardeEind: 5900 },
      {
        id: 'beleggingen',
        omschrijving: 'Beleggingen',
        categorie: 'beleggingen',
        eigenaar: 'A',
        waardeBegin: 74800,
        waardeEind: 83900,
        bronbelasting: { land: 'US', bedrag: 63, brutoInkomsten: brutoInkomstenVS },
        dividendbelasting: 38,
      },
      { id: 'crypto', omschrijving: 'Crypto', categorie: 'crypto', eigenaar: 'B', waardeBegin: 2150, waardeEind: 3480 },
    ],
    schulden: [{ id: 'lening-auto', omschrijving: 'Lening auto', eigenaar: 'A', waardeBegin: 24000, waardeEind: 16250 }],
  }
}

const partners = (params: TaxYearParams, jaar: number, aandeelA = 1): Box3Context => ({ params, jaar, fiscaalPartner: true, aandeelA, personen: ['A', 'B'] })
const alleen = (params: TaxYearParams, jaar: number): Box3Context => ({ params, jaar, fiscaalPartner: false, aandeelA: 1, personen: ['A'] })
const pos = (x: Partial<VermogensPositie> & Pick<VermogensPositie, 'categorie' | 'waardeBegin'>): VermogensPositie => ({
  id: x.id ?? x.categorie,
  omschrijving: x.omschrijving ?? x.categorie,
  eigenaar: x.eigenaar ?? 'A',
  ...x,
})

describe('box 3 forfaitair (aangiftemethode)', () => {
  it('rekent rendement, grondslag en voordeel van het voorbeeld 2024', () => {
    const r = berekenBox3(voorbeeld2024(420), partners(getJaar(2024), 2024))
    // Bank in Nederland en in het buitenland, beleggingen, crypto, schulden en de schuldendrempel (7.400 x 2,61%),
    // elk apart afgerond.
    expect(r.rendementRegels.map((x) => x.bedrag)).toEqual([732, 141, 4517, 129, -627, Math.floor(7400 * 0.0261)])
    expect(r.forfaitairRendement).toBe(5085)
    expect(r.bezittingen).toBe(137650)
    expect(r.aftrekbareSchulden).toBe(16600)
    expect(r.rendementsgrondslag).toBe(121050)
    expect(r.grondslag).toBe(7050)
    expect(r.effectiefPct).toBeCloseTo(0.042, 10)
    expect(r.voordeel).toEqual({ A: 296, B: 0 })
    expect(r.gekozen).toBe('forfaitair')
    expect(r.dividendbelasting).toBe(38)
    expect(r.vermogenToeslagen).toBe(121050)
  })

  it('verrekent de bronbelasting volledig als die binnen het verdragstarief blijft', () => {
    // 63 is precies 15% van 420: volledig verrekenbaar, 106 − 63 = 43
    const r = berekenBox3(voorbeeld2024(420), partners(getJaar(2024), 2024))
    expect(r.bronbelasting).toEqual({ A: 63, B: 0 })
    expect(r.belasting).toEqual({ A: 43, B: 0 })
    expect(r.waarschuwingen.map((w) => w.id)).not.toContain('box3-bronbelasting-max')
  })

  it('begrenst de bronbelasting op 15% van de bruto-inkomsten', () => {
    // 15% × 300 = 45: verrekenbaar 45, dus 106 − 45 = 61; de rest moet in het bronland worden teruggevraagd
    const r = berekenBox3(voorbeeld2024(300), partners(getJaar(2024), 2024))
    expect(r.bronbelasting.A).toBe(45)
    expect(r.belasting.A).toBe(61)
    expect(r.waarschuwingen.map((w) => w.id)).toContain('box3-bronbelasting-max')
  })

  it('toont de webmethode van de Belastingdienst ter controle als die afwijkt (456 tegenover 455)', () => {
    const invoer: Box3Invoer = { posities: [pos({ categorie: 'bankNL', waardeBegin: 40000 }), pos({ categorie: 'beleggingen', waardeBegin: 84000 })], schulden: [] }
    const r = berekenBox3(invoer, partners(getJaar(2024), 2024))
    expect(r.voordeel.A).toBe(455)
    expect(r.uitleg.find((u) => u.id === 'box3-webmethode')?.bedrag).toBe(456)
    expect(berekenBox3(voorbeeld2024(420), partners(getJaar(2024), 2024)).uitleg.some((u) => u.id === 'box3-webmethode')).toBe(false)
  })

  it('verdeelt de grondslag volgens het aandeel van A, in hele euro\'s (A afgerond, B de rest)', () => {
    const r = berekenBox3(voorbeeld2024(420), partners(getJaar(2024), 2024, 0.5))
    // 7.050 / 2 = 3.525 elk; 3.525 × 4,20% = 148,05 wordt 148.
    expect(r.potten?.[0].grondslagDeel).toEqual({ A: 3525, B: 3525 })
    expect(r.potten?.[0].grondslagPerPersoon).toEqual({ A: 3525, B: 3525 })
    expect(r.voordeel).toEqual({ A: 148, B: 148 })
    expect(r.potten?.[0].effectiefPct).toBeCloseTo(0.042, 10)
    expect(r.potten?.[0].gekozen).toBe('forfaitair')
    // Een oneven grondslag: A afgerond, B de rest.
    const oneven = berekenBox3({ posities: [pos({ categorie: 'bankNL', waardeBegin: 125001 })], schulden: [] }, partners(getJaar(2024), 2024, 0.5))
    expect(oneven.potten?.[0].grondslagDeel).toEqual({ A: 5501, B: 5500 })
  })

  it('rekent een alleenstaande met banktegoeden in 2026', () => {
    const r = berekenBox3({ posities: [pos({ categorie: 'bankNL', waardeBegin: 100000 })], schulden: [] }, alleen(getJaar(2026), 2026))
    expect(r.forfaitairRendement).toBe(1280)
    expect(r.grondslag).toBe(40643)
    expect(r.voordeel.A).toBe(520) // 40.643 × 1,28% = 520,2
    expect(r.belasting.A).toBe(187) // 36% × 520 = 187,2
  })

  it('maakt geen schuldregels als de schulden onder de drempel blijven', () => {
    const r = berekenBox3({ posities: [pos({ categorie: 'beleggingen', waardeBegin: 100000 })], schulden: [{ id: 's', omschrijving: 'Lening', eigenaar: 'A', waardeBegin: 3000 }] }, alleen(getJaar(2026), 2026))
    expect(r.rendementRegels.map((x) => x.categorie)).toEqual(['beleggingen'])
    expect(r.aftrekbareSchulden).toBe(0)
  })

  it('telt vermogen op naam van een kind mee bij de ouders en in de vermogenstoets', () => {
    const r = berekenBox3(
      { posities: [pos({ categorie: 'bankNL', waardeBegin: 100000 }), pos({ id: 'kind', categorie: 'bankNL', waardeBegin: 10000, eigenaar: 'kind:k1' })], schulden: [] },
      alleen(getJaar(2026), 2026),
    )
    expect(r.bezittingen).toBe(110000)
    expect(r.vermogenToeslagen).toBe(110000)
  })

  it('past de vrijstellingen voor groene beleggingen, contant geld en nettolijfrente toe', () => {
    const r = berekenBox3(
      {
        posities: [
          pos({ categorie: 'groen', waardeBegin: 30000 }),
          pos({ categorie: 'contant', waardeBegin: 1000 }),
          pos({ categorie: 'nettolijfrente', waardeBegin: 50000 }),
        ],
        schulden: [],
      },
      alleen(getJaar(2026), 2026),
    )
    expect(r.bezittingen).toBe(3285 + 328)
    expect(r.groenVrijgesteld.A).toBe(26715)
  })

  it('waarschuwt voor peildatumarbitrage binnen drie maanden rond 1 januari', () => {
    const met = berekenBox3({ posities: [pos({ categorie: 'bankNL', waardeBegin: 100000, categoriewisselDatum: '2025-12-15' })], schulden: [] }, alleen(getJaar(2026), 2026))
    expect(met.waarschuwingen.some((w) => w.id.startsWith('box3-arbitrage'))).toBe(true)
    const zonder = berekenBox3({ posities: [pos({ categorie: 'bankNL', waardeBegin: 100000, categoriewisselDatum: '2026-06-01' })], schulden: [] }, alleen(getJaar(2026), 2026))
    expect(zonder.waarschuwingen.some((w) => w.id.startsWith('box3-arbitrage'))).toBe(false)
  })

  it('meldt DAC8 bij crypto vanaf 2026', () => {
    const r = berekenBox3({ posities: [pos({ categorie: 'crypto', waardeBegin: 30000 })], schulden: [] }, alleen(getJaar(2026), 2026))
    expect(r.waarschuwingen.map((w) => w.id)).toContain('box3-dac8')
  })

  it('rekent zonder fiscaal partner elke persoon apart', () => {
    const r = berekenBox3(
      { posities: [pos({ categorie: 'bankNL', waardeBegin: 100000, eigenaar: 'A' }), pos({ id: 'b', categorie: 'bankNL', waardeBegin: 30000, eigenaar: 'B' })], schulden: [] },
      { params: getJaar(2026), jaar: 2026, fiscaalPartner: false, aandeelA: 1, personen: ['A', 'B'] },
    )
    expect(r.voordeel).toEqual({ A: 520, B: 0 })
  })
})

describe('box 3 tegenbewijs (werkelijk rendement)', () => {
  const verlies: Box3Invoer = { posities: [pos({ categorie: 'beleggingen', waardeBegin: 200000, waardeEind: 190000 })], schulden: [] }

  it('kiest het werkelijk rendement als dat lager is en tegenbewijs is gekozen', () => {
    const forfait = berekenBox3(verlies, alleen(getJaar(2026), 2026))
    expect(forfait.voordeel.A).toBe(8439) // 140.643 × 6%
    const r = berekenBox3({ ...verlies, tegenbewijs: true }, alleen(getJaar(2026), 2026))
    expect(r.werkelijkRendement).toBe(0)
    expect(r.gekozen).toBe('werkelijk')
    expect(r.voordeel.A).toBe(0)
    expect(r.belasting.A).toBe(0)
    expect(r.voordeelForfaitair.A).toBe(8439)
  })

  it('wijst op tegenbewijs als het werkelijk rendement lager is maar niet is gekozen', () => {
    const echtVerlies: Box3Invoer = { ...verlies, posities: verlies.posities.map((x) => ({ ...x, onttrekkingen: 0 })) }
    const r = berekenBox3(echtVerlies, alleen(getJaar(2026), 2026))
    expect(r.gekozen).toBe('forfaitair')
    expect(r.werkelijkRendement).toBe(0)
    expect(r.waarschuwingen.find((w) => w.id === 'box3-tegenbewijs-loont')?.ernst).toBe('actie')
  })

  it('meldt onvolledig in plaats van loont als een daling geen ingevulde opname heeft (leeg is iets anders dan 0)', () => {
    const r = berekenBox3(verlies, alleen(getJaar(2026), 2026))
    const ids = r.waarschuwingen.map((w) => w.id)
    expect(ids).not.toContain('box3-tegenbewijs-loont')
    expect(r.waarschuwingen.find((w) => w.id === 'box3-tegenbewijs-onvolledig')?.ernst).toBe('let-op')
    // Met tegenbewijs aan rekent de engine gewoon door: de gebruiker heeft dan zelf gekozen.
    expect(berekenBox3({ ...verlies, tegenbewijs: true }, alleen(getJaar(2026), 2026)).gekozen).toBe('werkelijk')
  })

  it('houdt het forfait aan als het werkelijk rendement hoger is', () => {
    const r = berekenBox3({ posities: [pos({ categorie: 'beleggingen', waardeBegin: 100000, waardeEind: 130000 })], schulden: [], tegenbewijs: true }, alleen(getJaar(2026), 2026))
    expect(r.werkelijkRendement).toBe(30000)
    expect(r.gekozen).toBe('forfaitair')
  })

  it('telt rente, dividend, stortingen, onttrekkingen en betaalde rente mee', () => {
    const r = berekenBox3(
      {
        posities: [
          pos({ id: 'b', categorie: 'bankNL', waardeBegin: 100000, waardeEind: 102000, directeOpbrengsten: 2000, onttrekkingen: 0, stortingen: 0 }),
          pos({ id: 'f', categorie: 'beleggingen', waardeBegin: 100000, waardeEind: 110000, stortingen: 5000, onttrekkingen: 1000, directeOpbrengsten: 1600 }),
        ],
        schulden: [{ id: 's', omschrijving: 'Lening', eigenaar: 'A', waardeBegin: 20000, betaaldeRente: 800 }],
        tegenbewijs: true,
      },
      alleen(getJaar(2026), 2026),
    )
    // bank: 2.000 + 2.000; fondsen: 1.600 + 10.000 − 5.000 + 1.000 = 7.600; minus rente 800
    expect(r.werkelijkRendement).toBe(4000 + 7600 - 800)
  })

  it('rekent voor vastgoed met eigen gebruik 5,06% van de WOZ vanaf 2026', () => {
    const r = berekenBox3(
      { posities: [pos({ categorie: 'onroerend', waardeBegin: 300000, woz: { begin: 300000, eind: 300000, dagenEigenGebruik: 365 } })], schulden: [], tegenbewijs: true },
      alleen(getJaar(2026), 2026),
    )
    expect(r.werkelijkRendement).toBe(15180)
  })

  it('meldt dat tegenbewijs niet kan als het jaar dat niet toestaat', () => {
    const params = getJaar(2026)
    params.box3.waarde.tegenbewijs.beschikbaar = false
    const r = berekenBox3({ ...verlies, tegenbewijs: true }, alleen(params, 2026))
    expect(r.gekozen).toBe('forfaitair')
    expect(r.waarschuwingen.map((w) => w.id)).toContain('box3-tegenbewijs-niet')
  })

  it('noemt het kanaal in de uitleg (formulier tot en met 2024, aangifte daarna)', () => {
    const r2024 = berekenBox3({ ...verlies, tegenbewijs: true }, alleen(getJaar(2024), 2024))
    expect(r2024.uitleg.find((u) => u.id === 'box3-werkelijk')?.formule ?? '').toBe('-10.000, niet lager dan 0')
    const winst: Box3Invoer = { posities: [pos({ categorie: 'beleggingen', waardeBegin: 200000, waardeEind: 201000 })], schulden: [], tegenbewijs: true }
    expect(berekenBox3(winst, alleen(getJaar(2024), 2024)).uitleg.find((u) => u.id === 'box3-werkelijk')?.formule).toContain('Opgaaf werkelijk rendement')
    expect(berekenBox3(winst, alleen(getJaar(2026), 2026)).uitleg.find((u) => u.id === 'box3-werkelijk')?.formule).toContain('in de aangifte zelf')
  })
})

describe('box 3 schijvenstelsel (2017 t/m 2022)', () => {
  function params2021(): TaxYearParams {
    const p = kloon(getJaar(2024))
    p.jaar = 2021
    p.box3.waarde = {
      ...p.box3.waarde,
      regime: 'schijven2017',
      tarief: 0.31,
      heffingsvrijVermogen: 50000,
      schuldendrempel: 3200,
      schijven2017: [
        { tot: 50000, pct: 0.01898 },
        { tot: 950000, pct: 0.04501 },
        { tot: null, pct: 0.0569 },
      ],
      vrijstellingen: { groen: 61215, contant: 551, uitvaart: 7290, nettolijfrente: true },
      tegenbewijs: { beschikbaar: false, kanaal: 'geen', eigenGebruikPct: 0 },
    }
    return p
  }

  it('vermogen onder het heffingsvrij vermogen (voorbeeld 2021)', () => {
    const invoer: Box3Invoer = {
      posities: [
        pos({ id: '1', categorie: 'bankNL', waardeBegin: 22400 }),
        pos({ id: '2', categorie: 'bankNL', eigenaar: 'B', waardeBegin: 8100 }),
        pos({ id: '3', categorie: 'beleggingen', waardeBegin: 36900 }),
        pos({ id: '4', categorie: 'crypto', eigenaar: 'B', waardeBegin: 900 }),
      ],
      schulden: [{ id: 'lening-auto', omschrijving: 'Lening auto', eigenaar: 'A', waardeBegin: 17900 }],
    }
    const r = berekenBox3(invoer, partners(params2021(), 2021))
    expect(r.bezittingen).toBe(68300)
    expect(r.aftrekbareSchulden).toBe(17900 - 2 * 3200)
    expect(r.rendementsgrondslag).toBe(56800)
    expect(r.grondslag).toBe(0)
    expect(r.belasting).toEqual({ A: 0, B: 0 })
  })

  it('rekent het voordeel per schijf', () => {
    // grondslag 120.000: 1,898% × 50.000 + 4,501% × 70.000 = 949 + 3.150,7
    const r = berekenBox3({ posities: [pos({ categorie: 'bankNL', waardeBegin: 170000 })], schulden: [] }, alleen(params2021(), 2021))
    expect(r.grondslag).toBe(120000)
    expect(r.voordeel.A).toBe(4100)
    expect(r.belasting.A).toBe(1271)
  })

  it('geeft het voordeel per schijf als uitkomst; de schijven tellen op tot het voordeel', () => {
    const r = berekenBox3({ posities: [pos({ categorie: 'bankNL', waardeBegin: 170000 })], schulden: [] }, alleen(params2021(), 2021))
    // 949 + 3.150,7: cumulatief afgerond 949 en 4.100, dus 949 en 3.151
    expect(r.potten?.[0].voordeelPerSchijf?.A).toEqual([
      { van: 0, tot: 50000, grondslag: 50000, pct: 0.01898, bedrag: 949 },
      { van: 50000, tot: 950000, grondslag: 70000, pct: 0.04501, bedrag: 3151 },
    ])
    expect(r.potten?.[0].gekozen).toBe('forfaitair')
  })

  it('partners: elk een eigen schijvenberekening over het eigen deel van de grondslag', () => {
    const r = berekenBox3({ posities: [pos({ categorie: 'bankNL', waardeBegin: 300001 })], schulden: [] }, partners(params2021(), 2021, 0.5))
    const pot = r.potten?.[0]
    expect(r.grondslag).toBe(200001)
    expect(pot?.grondslagDeel).toEqual({ A: 100001, B: 100000 })
    for (const id of ['A', 'B'] as const) {
      const regels = pot?.voordeelPerSchijf?.[id] ?? []
      expect(regels.map((x) => x.grondslag)).toEqual([50000, id === 'A' ? 50001 : 50000])
      expect(regels.reduce((s, x) => s + x.bedrag, 0)).toBe(r.voordeel[id])
    }
  })

  it('zegt dat tegenbewijs in dit stelsel niet wordt doorgerekend, in plaats van de schakelaar stil te negeren', () => {
    const invoer: Box3Invoer = { posities: [pos({ categorie: 'bankNL', waardeBegin: 170000, waardeEind: 160000 })], schulden: [], tegenbewijs: true }
    const r = berekenBox3(invoer, alleen(params2021(), 2021))
    expect(r.gekozen).toBe('forfaitair')
    expect(r.waarschuwingen.find((w) => w.id === 'box3-tegenbewijs-niet')?.ernst).toBe('info')
    expect(berekenBox3({ ...invoer, tegenbewijs: undefined }, alleen(params2021(), 2021)).waarschuwingen.map((w) => w.id)).not.toContain('box3-tegenbewijs-niet')
  })
})

describe('box 3 stelsel vanaf 2028 (voorstel)', () => {
  function params2028(): TaxYearParams {
    const p = getJaar(2026)
    p.box3.waarde.regime = 'werkelijkRendement'
    p.box3.waarde.regime2028 = {
      perCategorie: { bank: 'werkelijkRendement', financieelInstrument: 'vermogenswinst', crypto: 'vermogensaanwas', onroerend: 'vermogenswinst' },
      heffingsvrijResultaat: 1000,
      verliesdrempel: 500,
    }
    return p
  }

  it('rekent per categorie en labelt de uitkomst als voorstel', () => {
    const r = berekenBox3(
      {
        posities: [
          pos({ id: 'bank', categorie: 'bankNL', waardeBegin: 50000, waardeEind: 51000, directeOpbrengsten: 1000 }),
          pos({ id: 'etf', categorie: 'beleggingen', waardeBegin: 100000, waardeEind: 120000, directeOpbrengsten: 2000 }),
          pos({ id: 'verkocht', categorie: 'beleggingen', waardeBegin: 10000, waardeEind: 0, onttrekkingen: 15000, aanschafwaarde: 8000 }),
          pos({ id: 'btc', categorie: 'crypto', waardeBegin: 10000, waardeEind: 14000 }),
        ],
        schulden: [{ id: 's', omschrijving: 'Lening', eigenaar: 'A', waardeBegin: 10000, betaaldeRente: 500 }],
      },
      alleen(params2028(), 2028),
    )
    // 1.000 + 2.000 + (15.000 − 8.000) + 4.000 − 500 = 13.500; belastbaar 12.500
    expect(r.werkelijkRendement).toBe(13500)
    expect(r.grondslag).toBe(12500)
    expect(r.voordeel.A).toBe(12500)
    expect(r.belasting.A).toBe(4500)
    expect(r.waarschuwingen.map((w) => w.id)).toContain('box3-2028-voorstel')
    expect(r.uitleg.find((u) => u.id === 'box3-2028-resultaat')?.status).toBe('voorstel')
  })

  it('meldt een verrekenbaar verlies boven de verliesdrempel', () => {
    const r = berekenBox3({ posities: [pos({ categorie: 'crypto', waardeBegin: 10000, waardeEind: 7000 })], schulden: [] }, alleen(params2028(), 2028))
    expect(r.belasting.A).toBe(0)
    expect(r.waarschuwingen.map((w) => w.id)).toContain('box3-2028-verlies')
  })

  it('verdeelt het belastbare resultaat bij partners volgens het aandeel van A', () => {
    const r = berekenBox3({ posities: [pos({ categorie: 'crypto', waardeBegin: 10000, waardeEind: 20000 })], schulden: [] }, partners(params2028(), 2028, 0.5))
    expect(r.grondslag).toBe(8000)
    expect(r.voordeel).toEqual({ A: 4000, B: 4000 })
  })
})

describe('box 3 tegenbewijs: art. 5.26 lid 3 (herstel ronde 1, punt 4)', () => {
  // 2025, alleenstaande: groenfonds 26.000 met 2.000 dividend (binnen de groene vrijstelling), beleggingen 100.000 zonder rendement.
  const invoer = (tegenbewijs: boolean): Box3Invoer => ({
    posities: [
      pos({ id: 'g', categorie: 'groen', waardeBegin: 26000, waardeEind: 26000, directeOpbrengsten: 2000, stortingen: 0, onttrekkingen: 0 }),
      pos({ id: 'b', categorie: 'beleggingen', waardeBegin: 100000, waardeEind: 100000, stortingen: 0, onttrekkingen: 0 }),
    ],
    schulden: [],
    tegenbewijs,
  })

  it('groene beleggingen tellen volledig mee in het werkelijk rendement, ook binnen de vrijstelling', () => {
    const r = berekenBox3(invoer(true), alleen(getJaar(2025), 2025))
    expect(r.werkelijkRendement).toBe(2000)
    expect(r.gekozen).toBe('werkelijk')
    expect(r.voordeel.A).toBe(2000)
    expect(r.belasting.A).toBe(720)
    expect(r.uitleg.find((u) => u.id === 'box3-werkelijk-g')?.formule).toContain('groene vrijstelling geldt niet')
  })

  it('contant geld telt volledig mee (art. 5.10 onder d geldt niet); een vrijgestelde nettolijfrente niet', () => {
    const r = berekenBox3(
      {
        posities: [
          pos({ id: 'c', categorie: 'contant', waardeBegin: 400, waardeEind: 900, stortingen: 0 }),
          pos({ id: 'n', categorie: 'nettolijfrente', waardeBegin: 50000, waardeEind: 55000, stortingen: 0 }),
          pos({ id: 'b', categorie: 'beleggingen', waardeBegin: 100000, waardeEind: 100000, stortingen: 0, onttrekkingen: 0 }),
        ],
        schulden: [],
        tegenbewijs: true,
      },
      alleen(getJaar(2025), 2025),
    )
    expect(r.werkelijkRendement).toBe(500)
  })
})

describe('box 3 tegenbewijs: stijging zonder ingevulde storting (herstel ronde 1, punt 19)', () => {
  const etf = (extra: Partial<VermogensPositie> = {}): Box3Invoer => ({
    posities: [pos({ id: 'etf', omschrijving: 'ETF', categorie: 'beleggingen', waardeBegin: 200000, waardeEind: 220000, ...extra })],
    schulden: [],
  })
  const ids = (r: { waarschuwingen: Array<{ id: string }> }) => r.waarschuwingen.map((w) => w.id)

  it("stijging zonder storting en werkelijk rendement niet lager: info-melding 'box3-tegenbewijs-storting'", () => {
    const r = berekenBox3(etf(), partners(getJaar(2025), 2025))
    const w = r.waarschuwingen.find((x) => x.id === 'box3-tegenbewijs-storting')
    expect(w?.ernst).toBe('info')
    expect(w?.tekst).toContain('ETF')
    expect(ids(r)).not.toContain('box3-tegenbewijs-loont')
  })

  it('met een ingevulde storting (ook 0) geen melding; met 20.000 storting loont tegenbewijs', () => {
    expect(ids(berekenBox3(etf({ stortingen: 0 }), partners(getJaar(2025), 2025)))).not.toContain('box3-tegenbewijs-storting')
    const r = berekenBox3(etf({ stortingen: 20000 }), partners(getJaar(2025), 2025))
    expect(ids(r)).not.toContain('box3-tegenbewijs-storting')
    expect(ids(r)).toContain('box3-tegenbewijs-loont')
  })

  it('ook een bezitting die op 0 begon; zonder forfaitair voordeel geen melding', () => {
    const nieuw = berekenBox3(
      { posities: [pos({ id: 'b', categorie: 'bankNL', waardeBegin: 150000, waardeEind: 150000, stortingen: 0 }), pos({ id: 'n', omschrijving: 'Nieuwe rekening', categorie: 'beleggingen', waardeBegin: 0, waardeEind: 30000 })], schulden: [] },
      alleen(getJaar(2025), 2025),
    )
    expect(nieuw.waarschuwingen.find((x) => x.id === 'box3-tegenbewijs-storting')?.tekst).toContain('Nieuwe rekening')
    const klein = berekenBox3({ posities: [pos({ categorie: 'beleggingen', waardeBegin: 10000, waardeEind: 15000 })], schulden: [] }, alleen(getJaar(2025), 2025))
    expect(ids(klein)).not.toContain('box3-tegenbewijs-storting')
  })

  it('zonder fiscaal partner krijgt de melding het voorvoegsel van de persoon (de UI herkent -box3-tegenbewijs-storting)', () => {
    const r = berekenBox3(
      { posities: [pos({ id: 'etf', omschrijving: 'ETF', categorie: 'beleggingen', eigenaar: 'B', waardeBegin: 200000, waardeEind: 220000 })], schulden: [] },
      { params: getJaar(2025), jaar: 2025, fiscaalPartner: false, aandeelA: 1, personen: ['A', 'B'] },
    )
    expect(r.waarschuwingen.some((w) => w.id.endsWith('-box3-tegenbewijs-storting'))).toBe(true)
  })
})
