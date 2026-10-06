/**
 * Ronde 2 (A5): buitenlandse bronbelasting per land, plafond per persoon en voortwenteling (taak-A5 hoofdstuk 5,
 * BB1 tot en met BB12). 2026, forfaitair, tarief 36%, heffingsvrij vermogen 59.357, forfait overig 6%.
 *
 * Voordeel op maat: een belegging van W (een veelvoud van 50, zodat het effectieve percentage precies 6% is) geeft
 * voordeel round((W − 59.357) × 6%). W = 142.700: grondslag 83.343, voordeel 5.001, belasting floor(1.800,36) = 1.800.
 * W = 68.650: grondslag 9.293, voordeel 558, belasting floor(200,88) = 200.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '../../engine'
import { getJaar } from '../../years'
import { berekenBox3 } from '../../modules/box3'
import { bronbelastingPersoon, terugvraagDatum, verrekenbaarPerRegel } from '../../modules/box3/bronbelasting'
import { BRONBELASTING_LANDEN, landUitTabel } from '../../years/data/bronbelasting-landen'
import type { BronbelastingRegel, HuishoudenInvoer, PersoonInvoer, VermogensPositie } from '../../types'

const P26 = getJaar(2026)
const ctx = { params: P26, jaar: 2026 }
const pos = { id: 'p1', eigenaar: 'A' as const }
const r = (land: string, brutoInkomsten: number, bedrag: number, extra: Partial<BronbelastingRegel> = {}): BronbelastingRegel => ({ id: 'bb-1', land, soort: 'dividend', brutoInkomsten, bedrag, ...extra })

const pers = (id: 'A' | 'B', extra: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
  id,
  geboortedatum: '1985-05-05',
  ondernemingen: [],
  loon: [],
  inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  ...extra,
})

const belegging = (waardeBegin: number, regels: BronbelastingRegel[], extra: Partial<VermogensPositie> = {}): VermogensPositie => ({
  id: 'degiro',
  omschrijving: 'Beleggingsrekening',
  categorie: 'beleggingen',
  eigenaar: 'A',
  waardeBegin,
  bronbelastingen: regels,
  ...extra,
})

const alleen = (jaar: number, posities: VermogensPositie[], extra: Partial<PersoonInvoer> = {}): HuishoudenInvoer => ({
  jaar,
  personen: [pers('A', extra)],
  fiscaalPartner: false,
  kinderen: [],
  box3: { posities, schulden: [] },
  verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
})

const run = (i: HuishoudenInvoer) => berekenHuishouden(i, { zonderMarginaleDruk: true })

describe('landentabel', () => {
  it('heeft de 25 landen, elk één keer, met status, bron en peildatum', () => {
    expect(BRONBELASTING_LANDEN).toHaveLength(25)
    expect(new Set(BRONBELASTING_LANDEN.map((l) => l.code)).size).toBe(25)
    for (const l of BRONBELASTING_LANDEN) {
      expect(l.code).toMatch(/^[A-Z]{2}$/)
      expect(l.status).toBe('geschat')
      expect(l.peildatum).toBe('2026-10-05')
      expect(l.bron.titel.length).toBeGreaterThan(0)
      expect(l.dividend.ingehouden).toBeGreaterThanOrEqual(0)
    }
  })

  it('veelgebruikt: VS, DE, FR, CH, VK, BE, IE, LU; onzekere termijnen bij VS, VK, ES, AU, KR, TW, IN', () => {
    expect(BRONBELASTING_LANDEN.filter((l) => l.veelgebruikt).map((l) => l.code).sort()).toEqual(['BE', 'CH', 'DE', 'FR', 'GB', 'IE', 'LU', 'US'])
    expect(BRONBELASTING_LANDEN.filter((l) => l.terugvragen?.regel === 'onzeker').map((l) => l.code).sort()).toEqual(['AU', 'ES', 'GB', 'IN', 'KR', 'TW', 'US'])
  })

  it('Japan rente 10% en Portugal 28% volgens de primaire bron', () => {
    expect(landUitTabel('JP')?.rente?.verdrag).toBe(0.1)
    expect(landUitTabel('PT')?.dividend.ingehouden).toBe(0.28)
  })
})

describe('per regel: verdragstarief, hooguit 15%, terugvragen en termijn', () => {
  it('BB1: VS bruto 2.000, ingehouden 300: verrekenbaar 300, niets terug', () => {
    const u = verrekenbaarPerRegel(r('US', 2000, 300), pos, ctx)
    expect(u).toMatchObject({ verrekenbaar: 300, terugTeVragen: 0, verdragstarief: 0.15, tariefBron: 'tabel', landNaam: 'Verenigde Staten' })
  })

  it('BB2: CH bruto 5.000, ingehouden 1.750: verrekenbaar 750, terugvragen 1.000 uiterlijk 31-12-2029', () => {
    const u = verrekenbaarPerRegel(r('CH', 5000, 1750), pos, ctx)
    expect(u.verrekenbaar).toBe(750)
    expect(u.terugTeVragen).toBe(1000)
    expect(u.terugvraagUiterlijk).toBe('2029-12-31')
    expect(u.procedure).toContain('82 I')
  })

  it('BB3: DE bruto 1.000, ingehouden 263,75: verrekenbaar 150, terugvragen 113,75 bij het BZSt, uiterlijk 31-12-2030', () => {
    const u = verrekenbaarPerRegel(r('DE', 1000, 263.75), pos, ctx)
    expect(u.verrekenbaar).toBe(150)
    expect(u.terugTeVragen).toBe(113.75)
    expect(u.procedure).toContain('BZSt')
    expect(u.terugvraagUiterlijk).toBe('2030-12-31')
  })

  it('BB4: JP bruto 1.000, ingehouden 153,15: verrekenbaar 100 (verdrag 10%), terugvragen 53,15', () => {
    const u = verrekenbaarPerRegel(r('JP', 1000, 153.15), pos, ctx)
    expect(u.verrekenbaar).toBe(100)
    expect(u.terugTeVragen).toBe(53.15)
  })

  it('BB5: FR bruto 1.000, ingehouden 128: verrekenbaar 128, niets terug', () => {
    const u = verrekenbaarPerRegel(r('FR', 1000, 128), pos, ctx)
    expect(u.verrekenbaar).toBe(128)
    expect(u.terugTeVragen).toBe(0)
    expect(u.terugvraagUiterlijk).toBeNull()
  })

  it('BB8: Ierse ETF, uitkering 800, niets ingehouden: verrekenbaar 0 en de melding over het fonds', () => {
    expect(verrekenbaarPerRegel(r('IE', 800, 0), pos, ctx).verrekenbaar).toBe(0)
    const b = berekenBox3({ posities: [belegging(100000, [r('IE', 800, 0)])], schulden: [] }, { params: P26, jaar: 2026, fiscaalPartner: false, aandeelA: 1, personen: ['A'] })
    expect(b.waarschuwingen.find((w) => w.id === 'box3-bronbelasting-fonds')?.tekst).toContain('Bronbelasting binnen het fonds kun je niet verrekenen.')
    expect(b.bronbelasting.A).toBe(0)
  })

  it('BB9: PT bruto 1.000, ingehouden 280: verrekenbaar 100, terugvragen 180 uiterlijk 31-12-2028', () => {
    const u = verrekenbaarPerRegel(r('PT', 1000, 280), pos, ctx)
    expect(u).toMatchObject({ verrekenbaar: 100, terugTeVragen: 180, terugvraagUiterlijk: '2028-12-31' })
  })

  it('BB10: IT bruto 1.000, ingehouden 260, inhouding 20-5-2026: verrekenbaar 150, terugvragen 110 uiterlijk 20-5-2030', () => {
    const u = verrekenbaarPerRegel(r('IT', 1000, 260, { datum: '2026-05-20' }), pos, ctx)
    expect(u).toMatchObject({ verrekenbaar: 150, terugTeVragen: 110, terugvraagUiterlijk: '2030-05-20' })
  })

  it('BB11: oud veld Duitsland 26 op 100 wordt DE: verrekenbaar 15, terugvragen 11', () => {
    const b = berekenBox3(
      { posities: [{ id: 'oud', omschrijving: 'Fonds', categorie: 'beleggingen', eigenaar: 'A', waardeBegin: 100000, bronbelasting: { land: 'Duitsland', bedrag: 26, brutoInkomsten: 100 } }], schulden: [] },
      { params: P26, jaar: 2026, fiscaalPartner: false, aandeelA: 1, personen: ['A'] },
    )
    expect(b.bronbelastingRegels).toHaveLength(1)
    expect(b.bronbelastingRegels?.[0]).toMatchObject({ land: 'DE', verrekenbaar: 15, terugTeVragen: 11, tariefBron: 'tabel' })
    expect(b.bronbelasting.A).toBe(15)
  })

  it('BB12: land ZA (niet in de tabel), bruto 1.000, ingehouden 200: verrekenbaar 150 (15%), tarief onbekend', () => {
    const u = verrekenbaarPerRegel(r('ZA', 1000, 200), pos, ctx)
    expect(u).toMatchObject({ verrekenbaar: 150, verdragstarief: null, tariefBron: 'buiten-tabel', terugTeVragen: 0, terugvraagUiterlijk: null })
  })

  it('een eigen verdragstarief gaat voor de tabel; zonder land in de tabel geen datum ("termijn nakijken")', () => {
    expect(verrekenbaarPerRegel(r('US', 1000, 300, { verdragstarief: 0.1 }), pos, ctx)).toMatchObject({ verrekenbaar: 100, terugTeVragen: 200, tariefBron: 'eigen', terugvraagUiterlijk: null })
    expect(verrekenbaarPerRegel(r('ZA', 1000, 200, { verdragstarief: 0.05 }), pos, ctx)).toMatchObject({ verrekenbaar: 50, terugTeVragen: 150, terugvraagUiterlijk: null })
  })

  it('een land in de tabel zonder verdrag verrekent niets', () => {
    const tabel = [{ ...landUitTabel('CH')!, code: 'XX', dividend: { ingehouden: 0.3, verdrag: null } }]
    expect(verrekenbaarPerRegel(r('XX', 1000, 300), pos, { ...ctx, tabel })).toMatchObject({ verrekenbaar: 0, tariefBron: 'geen-verdrag' })
  })

  it('zonder bruto inkomsten zoals ronde 1: het hele ingehouden bedrag', () => {
    expect(verrekenbaarPerRegel(r('US', 0, 40), pos, ctx)).toMatchObject({ verrekenbaar: 40, zonderBruto: true })
  })

  it('rente gebruikt het verdragstarief voor rente (Zwitserland: alles terugvragen)', () => {
    expect(verrekenbaarPerRegel(r('CH', 1000, 350, { soort: 'rente' }), pos, ctx)).toMatchObject({ verrekenbaar: 0, terugTeVragen: 350 })
  })

  it('termijnregels: eind jaar plus n, vanaf 1 januari, maanden en jaren na de inhouding, onzeker', () => {
    expect(terugvraagDatum({ regel: 'vanaf1JanPlus', n: 5, procedure: '' }, undefined, 2026)).toBe('2030-12-31')
    expect(terugvraagDatum({ regel: 'maandenNaInhouding', n: 60, procedure: '' }, '2026-08-31', 2026)).toBe('2031-08-31')
    expect(terugvraagDatum({ regel: 'maandenNaInhouding', n: 6, procedure: '' }, '2026-08-31', 2026)).toBe('2027-02-28')
    expect(terugvraagDatum({ regel: 'jarenNaUitkering', n: 5, procedure: '' }, '2026-03-15', 2026)).toBe('2031-03-15')
    expect(terugvraagDatum({ regel: 'onzeker', n: 0, procedure: '' }, '2026-03-15', 2026)).toBeNull()
  })
})

describe('per persoon: plafond en voortwenteling', () => {
  it('BB1 in de engine: voordeel 5.001, belasting 1.800, verrekend 300, box 3-belasting 1.500', () => {
    const u = run(alleen(2026, [belegging(142700, [r('US', 2000, 300)])]))
    const a = u.personen[0]
    expect(u.box3.voordeel.A).toBe(5001)
    expect(a.box3BelastingVoorVerrekening).toBe(1800)
    expect(a.box3Belasting).toBe(1500)
    expect(a.bronbelasting).toEqual({ verrekenbaar: 300, voortgewenteldIn: 0, plafond: 1800, verrekend: 300, naarVolgendJaar: 0 })
    expect(u.box3.bronbelastingPerLand).toEqual([{ land: 'US', bruto: 2000, ingehouden: 300, verrekenbaar: 300, terugTeVragen: 0 }])
  })

  it('BB6: box 3-belasting 200, VS bruto 3.000 ingehouden 450: verrekend 200, naar 2027 250', () => {
    const u = run(alleen(2026, [belegging(68650, [r('US', 3000, 450)])]))
    const a = u.personen[0]
    expect(a.box3BelastingVoorVerrekening).toBe(200)
    expect(a.bronbelasting).toMatchObject({ verrekenbaar: 450, verrekend: 200, naarVolgendJaar: 250 })
    expect(a.box3Belasting).toBe(0)
    expect(a.waarschuwingen.find((w) => w.id === 'bronbelasting-voortwenteling')?.tekst).toContain('schuift door naar 2027')
  })

  it('BB6 in 2027: nieuw 300 + 250 uit 2026, box 3-belasting ruim: verrekend 550, naar 2028 0; zonder box 3-belasting 550 door', () => {
    const ruim = run(alleen(2027, [belegging(200000, [r('US', 2000, 300)])], { voortgewenteldeBronbelasting: 250 }))
    expect(ruim.personen[0].box3BelastingVoorVerrekening).toBeGreaterThanOrEqual(1000)
    expect(ruim.personen[0].bronbelasting).toMatchObject({ verrekenbaar: 300, voortgewenteldIn: 250, verrekend: 550, naarVolgendJaar: 0 })
    const nul = run(alleen(2027, [belegging(1000, [r('US', 2000, 300)])], { voortgewenteldeBronbelasting: 250 }))
    expect(nul.personen[0].box3BelastingVoorVerrekening).toBe(0)
    expect(nul.personen[0].bronbelasting).toMatchObject({ verrekend: 0, naarVolgendJaar: 550 })
  })

  it('BB7: partners 50/50, pot 600, box 3-belasting A 250 en B 400', () => {
    // De pot wordt verdeeld zoals de grondslag; daarna per persoon het plafond.
    const b = berekenBox3({ posities: [belegging(300000, [r('US', 4000, 600)])], schulden: [] }, { params: P26, jaar: 2026, fiscaalPartner: true, aandeelA: 0.5, personen: ['A', 'B'] })
    expect(b.bronbelastingVerrekenbaar).toEqual({ A: 300, B: 300 })
    expect(bronbelastingPersoon({ verrekenbaar: 300, voortgewenteld: 0, plafond: 250 })).toEqual({ verrekenbaar: 300, voortgewenteldIn: 0, plafond: 250, verrekend: 250, naarVolgendJaar: 50 })
    expect(bronbelastingPersoon({ verrekenbaar: 300, voortgewenteld: 0, plafond: 400 })).toEqual({ verrekenbaar: 300, voortgewenteldIn: 0, plafond: 400, verrekend: 300, naarVolgendJaar: 0 })
  })

  it('voortwenteling zonder bronbelasting dit jaar en zonder box 3: alles schuift door', () => {
    const u = run(alleen(2026, [], { voortgewenteldeBronbelasting: 120 }))
    expect(u.personen[0].bronbelasting).toMatchObject({ verrekenbaar: 0, voortgewenteldIn: 120, verrekend: 0, naarVolgendJaar: 120 })
  })

  it('zonder bronbelasting geen veld bronbelasting op de persoon en geen regels in box 3', () => {
    const u = run(alleen(2026, [belegging(100000, [])]))
    expect(u.personen[0].bronbelasting).toBeUndefined()
    expect(u.box3.bronbelastingRegels).toBeUndefined()
  })

  it('alle stelsels rekenen via dezelfde functie: 2022 (schijven), 2028 (voorstel) en tegenbewijs', () => {
    for (const jaar of [2022, 2028]) {
      const u = run(alleen(jaar, [belegging(200000, [r('JP', 1000, 153.15)], { waardeEind: 210000, directeOpbrengsten: 1000 })]))
      expect(u.box3.bronbelastingRegels?.[0].verrekenbaar, String(jaar)).toBe(100)
    }
    const tb = run({ ...alleen(2026, [belegging(200000, [r('JP', 1000, 153.15)], { waardeEind: 200500, stortingen: 0, onttrekkingen: 0, directeOpbrengsten: 1000 })]), box3: { posities: [belegging(200000, [r('JP', 1000, 153.15)], { waardeEind: 200500, stortingen: 0, onttrekkingen: 0, directeOpbrengsten: 1000 })], schulden: [], tegenbewijs: true } })
    expect(tb.box3.gekozen).toBe('werkelijk')
    expect(tb.box3.bronbelastingRegels?.[0].verrekenbaar).toBe(100)
    expect(tb.personen[0].bronbelasting?.verrekenbaar).toBe(100)
  })
})
