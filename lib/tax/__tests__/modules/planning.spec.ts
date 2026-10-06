import { describe, expect, it } from 'vitest'
import type { BerekenHuishouden, EngineOpties, HuishoudenInvoer, HuishoudenResultaat, PersoonInvoer } from '../../types'
import { getJaar, kloon } from '../../years'
import { prognoseJaarwinst } from '../../modules/planning/prognose'
import { belastingpot } from '../../modules/planning/belastingpot'
import { belastingrentePeriodeOp } from '../../modules/planning/belastingrente'
import { BELASTINGRENTE_IB } from '../../years/data/belastingrente'
import { whatIf, marginaleDruk, extraLijfrente, extraInvestering, box3Variant, extraWinst } from '../../modules/planning/whatif'
import { vergelijkRechtsvorm, box2Heffing, vpbHeffing } from '../../modules/planning/rechtsvorm'
import { berekenMiddeling } from '../../modules/planning/middeling'
import { vergelijkJaren } from '../../modules/planning/jaarvergelijking'

const p2026 = getJaar(2026)
const p2024 = getJaar(2024)

// ---------------------------------------------------------------------------
// Kleine nep-engine: IB 35% over winst (minus 28% KIA), 40% over loon, lijfrente
// aftrekbaar tegen 40%; Zvw 5% over winst; toeslag 5.000 − 10% van het toetsingsinkomen.
// ---------------------------------------------------------------------------
const aanroepen: Array<EngineOpties | undefined> = []
const nepEngine: BerekenHuishouden = (inv, opties) => {
  aanroepen.push(opties)
  const personen = inv.personen.map((p) => {
    const ondernemingen = p.ondernemingen.map((o) => ({
      winst: o.winstberekening.soort === 'saldo' ? o.winstberekening.saldo : o.winstberekening.omzet - o.winstberekening.kosten,
    }))
    const winst = ondernemingen.reduce((s, o) => s + o.winst, 0) + (p.resultaatOverigWerk ?? 0)
    const kia = p.ondernemingen.flatMap((o) => o.investeringen ?? []).reduce((s, i) => s + i.bedrag, 0) * 0.28
    const loon = p.loon.reduce((s, l) => s + l.bruto, 0)
    const lijfrente = p.inkomensvoorziening.lijfrentePremies
    const verschuldigdIB = Math.round(0.35 * (winst - kia) + 0.4 * loon - 0.4 * lijfrente)
    const bijdrage = Math.round(0.05 * winst)
    return {
      id: p.id,
      ondernemingen,
      verschuldigdIB,
      teBetalenIB: verschuldigdIB,
      zvw: { bijdrage, teBetalen: bijdrage },
      verzamelinkomen: winst + loon - lijfrente,
      arbeidsinkomen: winst + loon,
      box1: { inkomen: winst + loon - lijfrente },
      heffingskortingen: { verzilverd: 0 },
      uitleg: [{ id: 'box1.inkomen', label: 'Inkomen box 1', bedrag: winst + loon - lijfrente, soort: 'subtotaal', niveau: 0 }],
    }
  })
  const toetsing = personen.reduce((s, p) => s + p.verzamelinkomen, 0)
  const toeslag = Math.max(0, 5000 - 0.1 * toetsing)
  const verschuldigdIB = personen.reduce((s, p) => s + p.verschuldigdIB, 0)
  const verschuldigdZvw = personen.reduce((s, p) => s + p.zvw.bijdrage, 0)
  return {
    jaar: inv.jaar,
    variant: opties?.variant ?? inv.variant ?? null,
    personen,
    toeslagen: { kot: { totaal: toeslag }, toetsingsinkomen: toetsing, totaal: toeslag },
    totaal: { verschuldigdIB, verschuldigdZvw, teBetalenIB: verschuldigdIB, teBetalenZvw: verschuldigdZvw, toeslagen: toeslag, drukOpOmzet: null },
    uitleg: [{ id: 'toeslagen', label: 'Toeslagen', bedrag: toeslag, soort: 'totaal', niveau: 0 }],
    waarschuwingen: [],
  } as unknown as HuishoudenResultaat
}

const persoon = (id: 'A' | 'B', saldo: number | null, extra: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
  id,
  geboortedatum: '1988-01-01',
  ondernemingen: saldo === null ? [] : [{ naam: `Onderneming ${id}`, winstberekening: { soort: 'saldo', saldo }, uren: { onderneming: 1600 }, startjaar: 2016 }],
  loon: [],
  inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  ...extra,
})

const huishouden = (a: number | null, b: number | null): HuishoudenInvoer => ({
  jaar: 2026,
  personen: [persoon('A', a), persoon('B', b)],
  fiscaalPartner: true,
  kinderen: [],
  box3: { posities: [], schulden: [] },
  verdeling: 'optimaal',
})

describe('prognose', () => {
  it('lineair', () => {
    expect(prognoseJaarwinst({ gerealiseerd: 30000, maandenGewerkt: 6, methode: 'lineair' }).jaarequivalent).toBe(60000)
  })
  it('seizoensprofiel', () => {
    const profiel = [1, 1, 1, 1, 1, 1, 3, 3, 3, 3, 3, 3]
    expect(prognoseJaarwinst({ gerealiseerd: 30000, maandenGewerkt: 6, methode: 'seizoen', seizoensprofiel: profiel }).jaarequivalent).toBe(120000)
  })
  it('handmatig', () => {
    expect(prognoseJaarwinst({ gerealiseerd: 30000, maandenGewerkt: 6, methode: 'handmatig', verwachtRest: 25000 }).jaarequivalent).toBe(55000)
  })
  it('onvolledig profiel valt terug op lineair', () => {
    const r = prognoseJaarwinst({ gerealiseerd: 30000, maandenGewerkt: 6, methode: 'seizoen', seizoensprofiel: [1, 2] })
    expect(r.jaarequivalent).toBe(60000)
    expect(r.uitleg.at(-1)!.label).toContain('lineair')
  })
  it('nul maanden en een heel jaar', () => {
    expect(prognoseJaarwinst({ gerealiseerd: 0, maandenGewerkt: 0, methode: 'lineair', verwachtRest: 40000 }).jaarequivalent).toBe(40000)
    expect(prognoseJaarwinst({ gerealiseerd: 90000, maandenGewerkt: 12, methode: 'lineair' }).jaarequivalent).toBe(90000)
  })
})

describe('belastingpot', () => {
  const basis = { verschuldigdIB: 40000, verschuldigdZvw: 5000, voorlopigBetaald: 30000, saldoPot: 5000, maandenVerstreken: 9, params: p2026, jaar: 2026 }

  it('doel, achterstand, maandbedrag en belastingrente', () => {
    const r = belastingpot(basis)
    expect(r.doel).toBe(15000)
    expect(r.doelNu).toBe(11250)
    expect(r.achterstand).toBe(6250)
    expect(r.perMaandRest).toBe(3333)
    expect(r.renteVanaf).toBe('2027-07-01')
    // Ronde 2 (A2): per periode uit de tabel; vanaf 1-7-2027 geldt 5,5% (geschat), niet het percentage van 2026.
    expect(r.renteRisico).toBe(Math.floor(15000 * 0.055)) // per jaar vertraging
    expect(r.renteStatus).toBe('geschat')
  })

  it('rente tot een verwachte aanslagdatum: tot de dag vóór invorderbaar, 30/360', () => {
    const r = belastingpot({ ...basis, verwachteAanslagdatum: '2027-12-31' })
    // 1-7-2027 tot en met 10-2-2028 (dagtekening + 6 weken − 1 dag): 220 dagen
    expect(r.renteRisico).toBe(Math.floor((15000 * 0.055 * 220) / 360))
  })

  it('rente per persoon en per heffing, elk naar beneden afgerond', () => {
    const r = belastingpot({ ...basis, verwachteAanslagdatum: '2027-09-01', personen: [{ id: 'A', teBetalenIB: 3400, teBetalenZvw: 200 }, { id: 'B', teBetalenIB: -800, teBetalenZvw: 0 }] })
    // 1-7 tot en met 12-10-2027, 102 dagen tegen 5,5%: 52 en 3 (VA1)
    expect(r.renteRisico).toBe(52 + 3)
  })

  it('waarschuwt (als vuistregel) bij een te lage voorlopige aanslag en noemt dat uitstel geen rente voorkomt', () => {
    const r = belastingpot(basis)
    const w = r.waarschuwingen.find((x) => x.id === 'pot-va-te-laag')!
    expect(w.tekst).toContain('vuistregel')
    expect(w.tekst).toContain('uitstel via de accountant voorkomt die niet')
    expect(w.tekst).toContain('vóór 1 mei')
  })

  it('de tips passen bij vandaag: na 1 mei geen aangifte vóór 1 mei meer, na 1 juli loopt de rente al', () => {
    const tekst = (vandaag: string) => belastingpot({ ...basis, vandaag }).waarschuwingen.map((w) => w.tekst).join(' ')
    expect(tekst(`${basis.jaar + 1}-03-01`)).toContain('vóór 1 mei')
    expect(tekst(`${basis.jaar + 1}-05-15`)).not.toContain('vóór 1 mei')
    expect(tekst(`${basis.jaar + 1}-05-15`)).toContain('Een hogere voorlopige aanslag voorkomt die.')
    expect(tekst(`${basis.jaar + 1}-10-05`)).toContain(`die loopt sinds 1 juli ${basis.jaar + 1} tot de aanslag er is`)
  })

  it('review bevinding 12: loopt de rente al, dan het percentage van vandaag (2024 bekeken op 5-10-2026: 5%, niet 6,5%)', () => {
    const r = belastingpot({ ...basis, params: getJaar(2024), jaar: 2024, vandaag: '2026-10-05' })
    expect(r.renteVanaf).toBe('2025-07-01')
    expect(r.renteRisico).toBe(Math.floor(15000 * 0.05))
    const tekst = r.waarschuwingen.find((w) => w.id === 'pot-rente')!.tekst
    expect(tekst).toContain('nu 5')
    expect(tekst).not.toContain('6,5')
    expect(tekst).toContain('die loopt sinds 1 juli 2025 tot de aanslag er is')
    // Vóór de startdatum: het percentage op de startdatum.
    expect(belastingpot({ ...basis, params: getJaar(2024), jaar: 2024, vandaag: '2025-05-15' }).renteRisico).toBe(Math.floor(15000 * 0.065))
    expect(belastingrentePeriodeOp(BELASTINGRENTE_IB, '2026-10-05')?.pct).toBe(0.05)
  })

  it('teruggaaf als de voorlopige aanslag te hoog is', () => {
    const r = belastingpot({ ...basis, voorlopigBetaald: 50000 })
    expect(r.doel).toBe(0)
    expect(r.renteRisico).toBe(0)
    expect(r.waarschuwingen.map((w) => w.id)).toContain('pot-teruggaaf')
    expect(r.waarschuwingen.map((w) => w.id)).not.toContain('pot-va-te-laag')
  })
})

describe('what-if', () => {
  it('extra lijfrente: lagere IB, hogere toeslag', () => {
    const inv = huishouden(20000, 10000)
    const r = whatIf(inv, extraLijfrente('A', 1000), nepEngine)
    expect(r.verschilIB).toBe(-400)
    expect(r.verschilZvw).toBe(0)
    expect(r.verschilToeslagen).toBeCloseTo(100, 6)
    expect(r.nettoEffect).toBeCloseTo(500, 6)
    expect(r.uitleg.find((u) => u.id === 'whatif.kot')).toBeDefined()
    // basis blijft ongewijzigd
    expect(inv.personen[0].inkomensvoorziening.lijfrentePremies).toBe(0)
  })

  it('marginale druk inclusief Zvw en toeslagen', () => {
    expect(marginaleDruk(huishouden(20000, 10000), 'A', 1000, nepEngine)).toBeCloseTo(0.35 + 0.05 + 0.1, 6)
    // boven de toeslaggrens alleen IB en Zvw
    expect(marginaleDruk(huishouden(80000, 10000), 'A', 1000, nepEngine)).toBeCloseTo(0.4, 6)
  })

  it('extra winst zonder onderneming gaat naar resultaat overig werk', () => {
    const inv = extraWinst('B', 500)(kloon(huishouden(20000, null)))
    expect(inv.personen[1].resultaatOverigWerk).toBe(500)
  })

  it('extra investering voegt een KIA-investering toe', () => {
    const inv = extraInvestering('A', 10000)(kloon(huishouden(50000, null)))
    expect(inv.personen[0].ondernemingen[0].investeringen).toHaveLength(1)
    const r = whatIf(huishouden(50000, null), extraInvestering('A', 10000), nepEngine)
    expect(r.verschilIB).toBe(-980)
  })

  it('box 3-variant geeft de variant door aan de engine', () => {
    aanroepen.length = 0
    whatIf(huishouden(50000, null), box3Variant('brief-29-09'), nepEngine, { params: p2026 })
    expect(aanroepen[0]?.params).toBe(p2026)
    expect(aanroepen[1]?.variant).toBe('brief-29-09')
    expect(aanroepen[1]?.params).toBeUndefined()
    expect(aanroepen.every((o) => o?.zonderMarginaleDruk)).toBe(true)
  })
})

describe('rechtsvorm', () => {
  it('box 2: partners samen tweemaal de eerste schijf', () => {
    expect(box2Heffing(100000, p2026, true)).toBe(24500)
    expect(box2Heffing(100000, p2026, false)).toBe(Math.floor(68843 * 0.245 + (100000 - 68843) * 0.31))
  })

  it('Vpb laag en hoog tarief', () => {
    expect(vpbHeffing(88000, p2026)).toBe(16720)
    expect(vpbHeffing(250000, p2026)).toBe(Math.floor(0.19 * 200000 + 0.258 * 50000))
    expect(vpbHeffing(-5, p2026)).toBe(0)
  })

  it('eenmanszaak tegenover BV met de nep-engine', () => {
    const inv = huishouden(150000, 40000)
    inv.personen[0].ondernemingen[0].for = { stand: 17460 }
    const r = vergelijkRechtsvorm({ invoer: inv, persoon: 'A', dgaLoon: 58000, kostenBV: 4000, dividendUitkering: 50000 }, nepEngine, { params: p2026 })
    expect(r.eenmanszaak.belasting).toBe(60000)
    expect(r.eenmanszaak.netto).toBe(90000)
    expect(r.bv.vpb).toBe(16720)
    expect(r.bv.box1).toBe(23200)
    expect(r.bv.zvw).toBe(Math.floor(0.0485 * 58000))
    expect(r.bv.box2).toBe(12250)
    expect(r.bv.kosten).toBe(4000)
    expect(r.bv.netto).toBe(58000 - 23200 - 2813 + 50000 - 12250)
    // ingehouden 21.280 met latente box 2 van 24,5%
    expect(r.verschil).toBe(r.bv.netto + 21280 - Math.floor(21280 * 0.245) - 90000)
    expect(r.overstap).toEqual({ stakingswinst: 0, stakingsaftrek: 3630, forVrijval: 17460 })
    expect(r.waarschuwingen.map((w) => w.id)).toEqual(expect.arrayContaining(['rechtsvorm-marktconform', 'rechtsvorm-for', 'rechtsvorm-indicatief']))
    expect(r.uitleg.find((u) => u.id === 'rechtsvorm.bv.box2-partners')!.bedrag).toBe(2 * 68843)
  })

  it('dga-loon onder het normbedrag geeft een actie-waarschuwing', () => {
    const r = vergelijkRechtsvorm({ invoer: huishouden(150000, null), persoon: 'A', dgaLoon: 40000, kostenBV: 4000, dividendUitkering: 0 }, nepEngine, { params: p2026 })
    expect(r.waarschuwingen.find((w) => w.id === 'rechtsvorm-gebruikelijk-loon')!.ernst).toBe('actie')
  })

  it('box 3-besparing op opgepot vermogen', () => {
    const r = vergelijkRechtsvorm(
      { invoer: huishouden(150000, null), persoon: 'A', dgaLoon: 58000, kostenBV: 4000, dividendUitkering: 0, opgepotVermogen: 100000, verwachtRendement: 0.05 },
      nepEngine,
      { params: p2026 },
    )
    const regel = r.uitleg.find((u) => u.id === 'rechtsvorm.box3')!
    expect(regel.bedrag).toBe(Math.round(100000 * 0.06 * 0.36) - Math.round(100000 * 0.05 * 0.19))
  })

  it('zonder onderneming geen vergelijking', () => {
    const r = vergelijkRechtsvorm({ invoer: huishouden(null, null), persoon: 'A', dgaLoon: 58000, kostenBV: 4000, dividendUitkering: 0 }, nepEngine, { params: p2026 })
    expect(r.verschil).toBe(0)
    expect(r.waarschuwingen[0].id).toBe('rechtsvorm-geen-onderneming')
  })
})

describe('middeling', () => {
  const box1 = (_jaar: number, inkomen: number) => Math.floor(0.37 * Math.min(inkomen, 75518) + 0.495 * Math.max(0, inkomen - 75518))

  it('teruggaaf over 2022-2024 na drempel', () => {
    const jaren = [
      { jaar: 2022, box1Inkomen: 20000, box1BelastingEnPremie: box1(2022, 20000) },
      { jaar: 2023, box1Inkomen: 20000, box1BelastingEnPremie: box1(2023, 20000) },
      { jaar: 2024, box1Inkomen: 140000, box1BelastingEnPremie: box1(2024, 140000) },
    ]
    const r = berekenMiddeling(jaren, box1, { params: p2024 })
    expect(r.gemiddeld).toBe(60000)
    const werkelijk = 2 * box1(0, 20000) + box1(0, 140000)
    expect(r.teruggaaf).toBe(werkelijk - 3 * box1(0, 60000) - 545)
    expect(r.waarschuwingen.find((w) => w.id === 'middeling-termijn')!.tekst).toContain('36 maanden')
  })

  it('niet meer mogelijk na het laatste tijdvak', () => {
    const jaren = [2024, 2025, 2026].map((jaar) => ({ jaar, box1Inkomen: 50000, box1BelastingEnPremie: 18000 }))
    const r = berekenMiddeling(jaren, box1, { params: p2026 })
    expect(r.teruggaaf).toBe(0)
    expect(r.waarschuwingen[0].id).toBe('middeling-niet-mogelijk')
  })

  it('jaren moeten aaneengesloten zijn', () => {
    const jaren = [2020, 2022, 2023].map((jaar) => ({ jaar, box1Inkomen: 50000, box1BelastingEnPremie: 18000 }))
    expect(berekenMiddeling(jaren, box1, { params: p2024 }).waarschuwingen[0].id).toBe('middeling-jaren')
  })

  it('gelijk inkomen levert niets op', () => {
    const jaren = [2022, 2023, 2024].map((jaar) => ({ jaar, box1Inkomen: 50000, box1BelastingEnPremie: box1(jaar, 50000) }))
    expect(berekenMiddeling(jaren, box1, { params: p2024 }).teruggaaf).toBe(0)
  })
})

describe('jaarvergelijking', () => {
  it('koppelt uitlegregels per persoon en huishoudtotalen', () => {
    const a = nepEngine(huishouden(50000, 30000))
    const b = nepEngine(huishouden(60000, 30000))
    const rijen = vergelijkJaren(a, b)
    const box1A = rijen.find((r) => r.id === 'A.box1.inkomen')!
    expect(box1A).toMatchObject({ a: 50000, b: 60000, verschil: 10000 })
    expect(box1A.label).toBe('Persoon A: Inkomen box 1')
    expect(rijen.find((r) => r.id === 'B.box1.inkomen')!.verschil).toBe(0)
    expect(rijen.find((r) => r.id === 'totaal.verschuldigdIB')!.verschil).toBe(3500)
    expect(rijen.find((r) => r.id === 'A.kern.zvw')!.verschil).toBe(500)
    expect(rijen.find((r) => r.id === 'huishouden.toeslagen')).toBeDefined()
  })

  it('regels die maar in één uitkomst staan krijgen 0 aan de andere kant', () => {
    const a = nepEngine(huishouden(50000, null))
    const b = nepEngine(huishouden(50000, null))
    b.personen[0].uitleg.push({ id: 'nieuw', label: 'Nieuwe regel', bedrag: 123, soort: 'info', niveau: 1 })
    const r = vergelijkJaren(a, b).find((x) => x.id === 'A.nieuw')!
    expect(r).toMatchObject({ a: 0, b: 123, verschil: 123 })
  })
})
