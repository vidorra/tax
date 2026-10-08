/**
 * Verplichte afname van de oudedagsreserve volgens art. 3.70 lid 1 onder b Wet IB 2001 (tekst 2022, via art. 10a.29):
 * het deel van de FOR boven het ondernemingsvermogen aan het einde van het jaar, alleen bij staking, de AOW-leeftijd
 * op 1 januari of twee jaar achter elkaar geen urencriterium.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '../../engine'
import { berekenOnderneming } from '../../modules/onderneming'
import { berekenFor, ondernemingsvermogenUitBalans } from '../../modules/onderneming/for'
import type { HuishoudenInvoer, OndernemingInvoer } from '../../types'
import { JAREN, getJaar } from '../../years'

const p = getJaar(2026)
const basisCtx = { params: p, staking: false, aowBereikt: false, urencriteriumGehaald: true, winstVoorFor: 60000 }

function onderneming(extra: Partial<OndernemingInvoer> = {}): OndernemingInvoer {
  return { naam: 'zaak', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 0, urencriteriumGehaald: true }, startjaar: 2015, ...extra }
}

function huishouden(o: OndernemingInvoer, geboortedatum = '1988-03-01'): HuishoudenInvoer {
  return {
    jaar: 2026,
    personen: [{ id: 'A', geboortedatum, ondernemingen: [o], loon: [], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 } }],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  }
}

const TEKST = (r: { uitleg: Array<{ label: string; formule?: string }>; waarschuwingen: Array<{ tekst: string }> }) =>
  [...r.uitleg.flatMap((u) => [u.label, u.formule ?? '']), ...r.waarschuwingen.map((w) => w.tekst)].join('\n')

describe('FOR: voorbeeld uit de gap-analyse (G01)', () => {
  it('2026, saldo 60.000, FOR 20.000, ondernemingsvermogen 15.000, urencriterium gehaald: geen afname', () => {
    const met = berekenHuishouden(huishouden(onderneming({ for: { stand: 20000, ondernemingsvermogenEinde: 15000 } })), { zonderMarginaleDruk: true })
    const zonder = berekenHuishouden(huishouden(onderneming({ for: { stand: 20000 } })), { zonderMarginaleDruk: true })
    const o = met.personen[0].ondernemingen[0]
    expect(o.verplichteForAfname).toBe(0)
    expect(o.winst).toBe(60000)
    expect(o.forStandEind).toBe(20000)
    expect(met.personen[0].verschuldigdIB).toBe(zonder.personen[0].verschuldigdIB)
    expect(met.personen[0].verschuldigdIB).toBe(12093) // kortingen per deel naar boven afgerond (KG:202:2022:14)
    expect(o.waarschuwingen.find((w) => w.id.endsWith('for.bovenOndernemingsvermogen'))?.ernst).toBe('info')
  })
})

describe('FOR: gronden voor de verplichte afname', () => {
  it('AOW-leeftijd met een ondernemingsvermogen boven de FOR: geen afname', () => {
    const r = berekenFor({ stand: 20000, ondernemingsvermogenEinde: 30000 }, { ...basisCtx, aowBereikt: true })
    expect(r.reden).toBe('aow')
    expect(r.verplichteAfname).toBe(0)
    expect(r.standEind).toBe(20000)
    expect(r.uitleg.find((u) => u.id.endsWith('for.stand'))?.formule).toContain('niet hoger dan het ondernemingsvermogen')
  })

  it('AOW-leeftijd via de engine: geboren in 1955, ondernemingsvermogen 30.000 geeft geen afname, 12.000 geeft 8.000', () => {
    const geen = berekenHuishouden(huishouden(onderneming({ for: { stand: 20000, ondernemingsvermogenEinde: 30000 } }), '1955-01-01'), { zonderMarginaleDruk: true })
    expect(geen.personen[0].ondernemingen[0].verplichteForAfname).toBe(0)
    const wel = berekenHuishouden(huishouden(onderneming({ for: { stand: 20000, ondernemingsvermogenEinde: 12000 } }), '1955-01-01'), { zonderMarginaleDruk: true })
    expect(wel.personen[0].ondernemingen[0].verplichteForAfname).toBe(8000)
    expect(wel.personen[0].ondernemingen[0].winst).toBe(68000)
  })

  it('twee jaar geen urencriterium: het meerdere boven het ondernemingsvermogen, ook via uren.urencriteriumVorigJaar', () => {
    const o = onderneming({ uren: { onderneming: 0, urencriteriumGehaald: false, urencriteriumVorigJaar: false }, for: { stand: 20000, ondernemingsvermogenEinde: 15000 } })
    const r = berekenOnderneming(o, { params: p, jaar: 2026, aowBereikt: false, urenLoondienst: 0 })
    expect(r.verplichteForAfname).toBe(5000)
    expect(r.forStandEind).toBe(15000)
    const vorigJaarWel = berekenOnderneming({ ...o, uren: { ...o.uren, urencriteriumVorigJaar: true } }, { params: p, jaar: 2026, aowBereikt: false, urenLoondienst: 0 })
    expect(vorigJaarWel.verplichteForAfname).toBe(0)
  })

  it('urencriterium dit jaar niet gehaald en vorig jaar onbekend: melding om het in te vullen', () => {
    const r = berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, { ...basisCtx, urencriteriumGehaald: false })
    expect(r.verplichteAfname).toBe(0)
    expect(r.waarschuwingen.find((w) => w.id === 'onderneming.for.urencriteriumVorigJaar')?.ernst).toBe('let-op')
  })

  it('staking van de hele onderneming: alles valt vrij, ook met een hoog ondernemingsvermogen', () => {
    const r = berekenFor({ stand: 20000, ondernemingsvermogenEinde: 50000 }, { ...basisCtx, staking: true })
    expect(r.verplichteAfname).toBe(20000)
    expect(r.standEind).toBe(0)
    expect(r.uitleg.find((u) => u.id.endsWith('for.verplicht'))?.formule).toContain('nihil')
  })

  it('gedeeltelijke staking: alleen het meerdere boven het ondernemingsvermogen', () => {
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, { ...basisCtx, staking: true, gedeeltelijkeStaking: true }).verplichteAfname).toBe(5000)
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 50000 }, { ...basisCtx, staking: true, gedeeltelijkeStaking: true }).verplichteAfname).toBe(0)
    const r = berekenOnderneming(onderneming({ staking: { stakingswinst: 0, gedeeltelijk: true }, for: { stand: 20000, ondernemingsvermogenEinde: 15000 } }), {
      params: p,
      jaar: 2026,
      aowBereikt: false,
      urenLoondienst: 0,
    })
    expect(r.verplichteForAfname).toBe(5000)
  })

  it('negatief ondernemingsvermogen bij een grond: de hele FOR valt vrij, niet meer', () => {
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: -4000 }, { ...basisCtx, aowBereikt: true }).verplichteAfname).toBe(20000)
  })
})

describe('FOR: ondernemingsvermogen onbekend', () => {
  it('grond zonder ondernemingsvermogen en zonder balans: actiemelding en geen afname', () => {
    const r = berekenFor({ stand: 20000 }, { ...basisCtx, aowBereikt: true })
    expect(r.verplichteAfname).toBe(0)
    expect(r.reden).toBe('aow')
    const w = r.waarschuwingen.find((x) => x.id === 'onderneming.for.ondernemingsvermogenOnbekend')
    expect(w?.ernst).toBe('actie')
    expect(w?.tekst).toContain('Je had op 1 januari de AOW-leeftijd')
  })

  it('volledige staking zonder ondernemingsvermogen: alles, zonder actiemelding', () => {
    const r = berekenFor({ stand: 20000 }, { ...basisCtx, staking: true })
    expect(r.verplichteAfname).toBe(20000)
    expect(r.waarschuwingen.some((x) => x.id.endsWith('ondernemingsvermogenOnbekend'))).toBe(false)
  })

  it('gebruikt de eindbalans uit de jaarrekening als het ondernemingsvermogen ontbreekt', () => {
    const o = onderneming({
      for: { stand: 20000 },
      jaarrekening: { eind: { materieleVasteActiva: 5000, liquideMiddelen: 12000, handelsdebiteuren: 3000, oudedagsreserve: 20000, crediteuren: 2000, omzetbelasting: 6000 } },
    })
    const r = berekenOnderneming(o, { params: p, jaar: 2026, aowBereikt: true, urenLoondienst: 0 })
    // ondernemingsvermogen = 5.000 + 12.000 + 3.000 − 2.000 − 6.000 = 12.000; afname 20.000 − 12.000
    expect(r.verplichteForAfname).toBe(8000)
    expect(r.uitleg.find((u) => u.id.endsWith('for.verplicht'))?.formule).toContain('uit de eindbalans')
    // Een ingevuld ondernemingsvermogen wint van de balans.
    const ingevuld = berekenOnderneming({ ...o, for: { stand: 20000, ondernemingsvermogenEinde: 18000 } }, { params: p, jaar: 2026, aowBereikt: true, urenLoondienst: 0 })
    expect(ingevuld.verplichteForAfname).toBe(2000)
    // Zonder grond doet de balans niets.
    expect(berekenOnderneming(o, { params: p, jaar: 2026, aowBereikt: false, urenLoondienst: 0 }).verplichteForAfname).toBe(0)
  })

  it('ondernemingsvermogenUitBalans: activa min voorzieningen en schulden; alleen een FOR-post is geen balans', () => {
    expect(ondernemingsvermogenUitBalans(undefined)).toBeUndefined()
    expect(ondernemingsvermogenUitBalans({ oudedagsreserve: 20000 })).toBeUndefined()
    expect(ondernemingsvermogenUitBalans({ liquideMiddelen: 1000, voorzieningen: 100, langlopendeSchulden: 200, crediteuren: 50, overigeKortlopendeSchulden: 25 })).toBe(625)
    expect(ondernemingsvermogenUitBalans({ liquideMiddelen: 0 })).toBe(0)
  })
})

describe('FOR: parameters', () => {
  it("geen jaar heeft nog 'bovenOndernemingsvermogen' als grond, met een changelogregel", () => {
    for (const [jaar, params] of Object.entries(JAREN)) {
      expect(params.ondernemer.waarde.for.verplichteAfnameBij, String(jaar)).toEqual(['staking', 'aow', 'urencriterium2jaar'])
      expect(params.changelog.some((c) => c.wat.includes('verplichteAfnameBij') && c.bron?.titel.includes('art. 3.70')), String(jaar)).toBe(true)
    }
  })

  it("oude params met 'bovenOndernemingsvermogen' geven geen losse afname", () => {
    const oud = getJaar(2026)
    oud.ondernemer.waarde.for.verplichteAfnameBij = ['staking', 'aow', 'urencriterium2jaar', 'bovenOndernemingsvermogen']
    expect(berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, { ...basisCtx, params: oud }).verplichteAfname).toBe(0)
  })

  it('schrijft Nederlands zonder em-dashes of pijlen', () => {
    const teksten = [
      berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, basisCtx),
      berekenFor({ stand: 20000 }, { ...basisCtx, aowBereikt: true }),
      berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, { ...basisCtx, urencriteriumGehaald: false }),
      berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000 }, { ...basisCtx, staking: true, gedeeltelijkeStaking: true }),
    ]
      .map(TEKST)
      .join('\n')
    expect(teksten).not.toMatch(/[—→]/)
  })
})

describe('FOR: urencriterium per persoon, niet per onderneming (herstel ronde 1, punt 1)', () => {
  const twee = (vorig: boolean | undefined): HuishoudenInvoer => ({
    jaar: 2026,
    personen: [
      {
        id: 'A',
        geboortedatum: '1988-03-01',
        loon: [],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
        ondernemingen: [
          onderneming({ naam: 'zaak1', winstberekening: { soort: 'saldo', saldo: 40000 }, uren: { onderneming: 800, urencriteriumVorigJaar: vorig }, for: { stand: 20000, ondernemingsvermogenEinde: 5000 } }),
          onderneming({ naam: 'zaak2', winstberekening: { soort: 'saldo', saldo: 20000 }, uren: { onderneming: 800, urencriteriumVorigJaar: vorig } }),
        ],
      },
    ],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  })

  it('twee ondernemingen van elk 800 uur en vorig jaar nee: de persoon haalt het criterium, dus geen afname', () => {
    const r = berekenHuishouden(twee(false), { zonderMarginaleDruk: true })
    const a = r.personen[0]
    expect(a.ondernemersaftrek.zelfstandigenaftrek).toBe(1200)
    expect(a.urencriteriumGehaald).toBe(true)
    expect(a.ondernemingen.map((o) => o.urencriteriumGehaald)).toEqual([true, true])
    expect(a.ondernemingen[0].verplichteForAfname).toBe(0)
    expect(a.ondernemingen[0].forStandEind).toBe(20000)
    // Zelfde IB als zonder opgave over vorig jaar.
    expect(a.verschuldigdIB).toBe(berekenHuishouden(twee(undefined), { zonderMarginaleDruk: true }).personen[0].verschuldigdIB)
  })

  it('persoon haalt het samen niet (2 × 400 uur) en vorig jaar nee: wel de verplichte afname', () => {
    const h = twee(false)
    for (const o of h.personen[0].ondernemingen) o.uren.onderneming = 400
    const a = berekenHuishouden(h, { zonderMarginaleDruk: true }).personen[0]
    expect(a.urencriteriumGehaald).toBe(false)
    expect(a.ondernemingen[0].verplichteForAfname).toBe(15000)
  })

  it('vorig jaar per persoon: ja bij één onderneming telt voor de persoon', () => {
    const h = twee(false)
    for (const o of h.personen[0].ondernemingen) o.uren.onderneming = 400
    h.personen[0].ondernemingen[1].uren.urencriteriumVorigJaar = true
    const a = berekenHuishouden(h, { zonderMarginaleDruk: true }).personen[0]
    expect(a.ondernemingen[0].verplichteForAfname).toBe(0)
  })

  it('één onderneming: het urencriterium van de persoon is dat van de onderneming; zonder onderneming ontbreekt het', () => {
    const r = berekenHuishouden(huishouden(onderneming({ uren: { onderneming: 600 } })), { zonderMarginaleDruk: true })
    expect(r.personen[0].urencriteriumGehaald).toBe(false)
    const leeg = huishouden(onderneming())
    leeg.personen[0].ondernemingen = []
    expect(berekenHuishouden(leeg, { zonderMarginaleDruk: true }).personen[0].urencriteriumGehaald).toBeUndefined()
  })
})

describe('FOR: vrijwillige afname en omzetting hangen aan elkaar (herstel ronde 1, punt 2)', () => {
  const met = (o: Partial<OndernemingInvoer>, iv: Partial<HuishoudenInvoer['personen'][number]['inkomensvoorziening']>, geboortedatum = '1988-03-01') => {
    const h = huishouden(onderneming(o), geboortedatum)
    h.personen[0].inkomensvoorziening = { lijfrentePremies: 0, aovPremies: 0, premiegrondslagInkomenVorigJaar: 60000, ...iv }
    return berekenHuishouden(h, { zonderMarginaleDruk: true }).personen[0]
  }

  it('omzettingspremie zonder vrijwillige afname: niet aftrekbaar, met een let-op', () => {
    const a = met({ for: { stand: 20000 } }, { forOmzetting: 10000 })
    expect(a.inkomensvoorziening.forOmzettingAftrek).toBe(0)
    expect(a.inkomensvoorziening.nietAftrekbaar).toBe(10000)
    expect(a.verschuldigdIB).toBe(12093)
    expect(a.inkomensvoorziening.waarschuwingen.find((w) => w.id === 'lijfrente.forOmzettingBovenAfname')?.ernst).toBe('let-op')
  })

  it('geen FOR: een omzettingspremie is niet aftrekbaar', () => {
    const a = met({}, { forOmzetting: 10000 })
    expect(a.inkomensvoorziening.forOmzettingAftrek).toBe(0)
  })

  it('vrijwillige afname zonder lijfrentepremie: geen afname, met een let-op', () => {
    const a = met({ for: { stand: 20000, vrijwilligeAfname: 5000 } }, {})
    const o = a.ondernemingen[0]
    expect(o.forVrijwilligeAfname).toBe(0)
    expect(o.winst).toBe(60000)
    expect(o.forStandEind).toBe(20000)
    expect(o.waarschuwingen.find((w) => w.id.endsWith('for.vrijwilligBegrensd'))?.ernst).toBe('let-op')
  })

  it('omzetting van 10.000 bij een vrijwillige afname van 5.000: 5.000 aftrekbaar bovenop de ruimte', () => {
    const a = met({ for: { stand: 20000, vrijwilligeAfname: 5000 } }, { forOmzetting: 10000 })
    expect(a.ondernemingen[0].forVrijwilligeAfname).toBe(5000)
    expect(a.ondernemingen[0].winst).toBe(65000)
    expect(a.inkomensvoorziening.forOmzettingAftrek).toBe(5000)
    expect(a.inkomensvoorziening.nietAftrekbaar).toBe(5000)
  })

  it('vrijwillige afname tegenover een gewone lijfrentepremie in de jaarruimte telt ook', () => {
    const a = met({ for: { stand: 20000, vrijwilligeAfname: 5000 } }, { lijfrentePremies: 3000 })
    expect(a.inkomensvoorziening.lijfrenteAftrek).toBe(3000)
    expect(a.ondernemingen[0].forVrijwilligeAfname).toBe(3000)
    expect(a.ondernemingen[0].waarschuwingen.find((w) => w.id.endsWith('for.vrijwilligBegrensd'))?.tekst).toContain('€ 3.000')
  })

  it('twee ondernemingen delen de ruimte: eerst de eerste onderneming', () => {
    const h = huishouden(onderneming({ naam: 'een', for: { stand: 4000, vrijwilligeAfname: 4000 } }))
    h.personen[0].ondernemingen.push(onderneming({ naam: 'twee', for: { stand: 6000, vrijwilligeAfname: 6000 } }))
    h.personen[0].inkomensvoorziening = { lijfrentePremies: 0, aovPremies: 0, forOmzetting: 7000 }
    const a = berekenHuishouden(h, { zonderMarginaleDruk: true }).personen[0]
    expect(a.inkomensvoorziening.forOmzettingAftrek).toBe(7000)
    expect(a.ondernemingen.map((o) => o.forVrijwilligeAfname)).toEqual([4000, 3000])
  })

  it('de melding over omzetting noemt alleen de vrijwillige afname; bij staking de stakingslijfrente', () => {
    const a = met({ for: { stand: 20000, vrijwilligeAfname: 5000 } }, { forOmzetting: 5000 })
    const omzetting = a.ondernemingen[0].waarschuwingen.find((w) => w.id.endsWith('for.omzetting'))
    expect(omzetting?.tekst).toContain('vrijwillige afname van de oudedagsreserve (€ 5.000)')
    const staking = met({ for: { stand: 20000 }, staking: { stakingswinst: 20000 } }, {})
    expect(staking.ondernemingen[0].verplichteForAfname).toBe(20000)
    expect(staking.ondernemingen[0].waarschuwingen.some((w) => w.id.endsWith('for.omzetting'))).toBe(false)
    expect(staking.ondernemingen[0].waarschuwingen.find((w) => w.id.endsWith('for.stakingslijfrente'))?.tekst).toContain('stakingslijfrente')
  })
})

describe('FOR: verplichte afname over de FOR na de vrijwillige afname (herstel ronde 1, punt 3)', () => {
  it('berekenFor: AOW, FOR 20.000, ondernemingsvermogen 15.000, vrijwillig 5.000: verplicht 0 en FOR eind 15.000', () => {
    const r = berekenFor({ stand: 20000, ondernemingsvermogenEinde: 15000, vrijwilligeAfname: 5000 }, { ...basisCtx, aowBereikt: true, vrijwilligeAfnameMax: 5000 })
    expect(r.vrijwilligeAfname).toBe(5000)
    expect(r.verplichteAfname).toBe(0)
    expect(r.standEind).toBe(15000)
  })

  it('via de engine (geboren 1955): winst 65.000 en IB 6.669 in plaats van 70.000 en 9.265', () => {
    const h = huishouden(onderneming({ for: { stand: 20000, ondernemingsvermogenEinde: 15000, vrijwilligeAfname: 5000 } }), '1955-03-01')
    h.personen[0].inkomensvoorziening = { lijfrentePremies: 0, aovPremies: 0, premiegrondslagInkomenVorigJaar: 60000, forOmzetting: 5000 }
    const a = berekenHuishouden(h, { zonderMarginaleDruk: true }).personen[0]
    expect(a.ondernemingen[0].verplichteForAfname).toBe(0)
    expect(a.ondernemingen[0].forVrijwilligeAfname).toBe(5000)
    expect(a.ondernemingen[0].winst).toBe(65000)
    expect(a.ondernemingen[0].forStandEind).toBe(15000)
    expect(a.verschuldigdIB).toBe(6669)
  })

  it('vrijwillig minder dan het meerdere: de rest boven het ondernemingsvermogen neemt verplicht af', () => {
    const r = berekenFor({ stand: 20000, ondernemingsvermogenEinde: 12000, vrijwilligeAfname: 3000 }, { ...basisCtx, aowBereikt: true, vrijwilligeAfnameMax: 3000 })
    expect(r.vrijwilligeAfname).toBe(3000)
    expect(r.verplichteAfname).toBe(5000)
    expect(r.standEind).toBe(12000)
    expect(r.uitleg.find((u) => u.id.endsWith('for.verplicht'))?.formule).toContain('vrijwillige afname 3.000')
  })

  it('volledige staking: het restant na de vrijwillige afname is verplicht', () => {
    const r = berekenFor({ stand: 20000, vrijwilligeAfname: 5000 }, { ...basisCtx, staking: true, vrijwilligeAfnameMax: 5000 })
    expect(r.vrijwilligeAfname).toBe(5000)
    expect(r.verplichteAfname).toBe(15000)
    expect(r.standEind).toBe(0)
  })

  it('schrijft Nederlands zonder em-dashes of pijlen', () => {
    const r = berekenFor({ stand: 20000, ondernemingsvermogenEinde: 12000, vrijwilligeAfname: 9000 }, { ...basisCtx, aowBereikt: true, vrijwilligeAfnameMax: 3000 })
    expect(TEKST(r)).not.toMatch(/[—→]/)
  })
})
