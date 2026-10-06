/**
 * Ronde 2 (A5): beloning aan en terbeschikkingstelling door de fiscale partner (taak-A5 hoofdstuk 6, P1 tot en met P8).
 * 2026 tenzij anders vermeld; drempel arbeidsbeloning = meewerkaftrek.maxVergoeding (5.000), tbs-vrijstelling 12%.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '../../engine'
import { getJaar } from '../../years'
import { correctiePartner, ondernemingVanTbs, terbeschikkingstelling, werkruimteVoldoet } from '../../modules/partner'
import type { HuishoudenInvoer, OndernemingInvoer, PersoonInvoer, TerbeschikkingstellingInvoer, VermogensPositie } from '../../types'

const ond = (saldo: number, extra: Partial<OndernemingInvoer> = {}): OndernemingInvoer => ({
  id: 'ond-1',
  naam: 'Ontwerpstudio',
  winstberekening: { soort: 'saldo', saldo },
  uren: { onderneming: 1500 },
  startjaar: 2015,
  ...extra,
})

const pers = (id: 'A' | 'B', extra: Partial<PersoonInvoer> = {}): PersoonInvoer => ({
  id,
  geboortedatum: id === 'A' ? '1985-05-05' : '1987-03-03',
  ondernemingen: [],
  loon: [],
  inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  ...extra,
})

const tbs = (extra: Partial<TerbeschikkingstellingInvoer> = {}): TerbeschikkingstellingInvoer => ({
  id: 'tbs-bus',
  omschrijving: 'Bestelbus',
  aan: { persoon: 'A', ondernemingId: 'ond-1' },
  soort: 'zaak',
  vergoeding: 2400,
  kosten: 300,
  afschrijving: 1500,
  ...extra,
})

const hh = (a: PersoonInvoer, b: PersoonInvoer, extra: Partial<HuishoudenInvoer> = {}): HuishoudenInvoer => ({
  jaar: 2026,
  personen: [a, b],
  fiscaalPartner: true,
  kinderen: [],
  box3: { posities: [], schulden: [] },
  verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
  ...extra,
})

const run = (i: HuishoudenInvoer) => berekenHuishouden(i, { zonderMarginaleDruk: true })
const P26 = getJaar(2026)

describe('beloning aan de partner (art. 3.16 lid 4)', () => {
  it('P1: A (saldo 60.000) betaalt B 6.000, niet in de kosten: A winst 54.000, B overig werk en arbeidsinkomen 6.000', () => {
    const u = run(hh(pers('A', { ondernemingen: [ond(60000, { samenwerkingMetPartner: 'arbeidsbeloning', meewerkendePartner: { uren: 600, vergoeding: 6000, vergoedingInKosten: false } })] }), pers('B')))
    const [a, b] = u.personen
    expect(a.ondernemingen[0].correctiePartner).toBe(-6000)
    expect(a.winstUitOnderneming).toBe(54000)
    expect(a.ondernemersaftrek.meewerkaftrek).toBe(0)
    expect(b.overigWerk).toBe(6000)
    expect(b.arbeidsinkomen).toBe(6000)
    expect(b.overigWerkDetail).toEqual({ eigen: 0, arbeidsbeloningPartner: 6000, terbeschikkingstelling: null })
    expect(a.uitleg.some((r) => r.id === 'partner.ond-1.beloning')).toBe(true)
  })

  it('P1b: vergoeding al in de kosten (saldo 54.000, standaard): geen correctie, B 6.000', () => {
    const u = run(hh(pers('A', { ondernemingen: [ond(54000, { samenwerkingMetPartner: 'arbeidsbeloning', meewerkendePartner: { uren: 600, vergoeding: 6000 } })] }), pers('B')))
    const [a, b] = u.personen
    expect(a.ondernemingen[0].correctiePartner).toBeUndefined()
    expect(a.winstUitOnderneming).toBe(54000)
    expect(b.overigWerk).toBe(6000)
    expect(b.arbeidsinkomen).toBe(6000)
  })

  it('P2: A betaalt B 4.000 (in de kosten, saldo 56.000), B werkt 600 uur: terugtellen, winst 60.000, meewerkaftrek 750, B niets', () => {
    const u = run(hh(pers('A', { ondernemingen: [ond(56000, { samenwerkingMetPartner: 'arbeidsbeloning', meewerkendePartner: { uren: 600, vergoeding: 4000 } })] }), pers('B')))
    const [a, b] = u.personen
    expect(a.ondernemingen[0].correctiePartner).toBe(4000)
    expect(a.winstUitOnderneming).toBe(60000)
    expect(a.ondernemersaftrek.meewerkaftrek).toBe(750)
    expect(b.overigWerk).toBe(0)
    expect(b.overigWerkDetail).toBeUndefined()
  })

  it('P2b: zoals P2 in 2027 (voorstel): 0,3125% × 60.000 = 187,50, de module rondt rekenkundig af op 188', () => {
    const u = run({ ...hh(pers('A', { ondernemingen: [ond(56000, { samenwerkingMetPartner: 'arbeidsbeloning', meewerkendePartner: { uren: 600, vergoeding: 4000 } })] }), pers('B')), jaar: 2027 })
    expect(u.personen[0].winstUitOnderneming).toBe(60000)
    expect(u.personen[0].ondernemersaftrek.meewerkaftrek).toBe(188)
  })

  it('vof en loondienst rekent de tool niet door (melding); niet-partners ook niet', () => {
    const vof = run(hh(pers('A', { ondernemingen: [ond(60000, { samenwerkingMetPartner: 'vof', meewerkendePartner: { uren: 600, vergoeding: 6000, vergoedingInKosten: false } })] }), pers('B')))
    expect(vof.personen[0].winstUitOnderneming).toBe(60000)
    expect(vof.personen[1].overigWerk).toBe(0)
    expect(vof.personen[0].waarschuwingen.some((w) => w.id === 'partner-anders-ond-1')).toBe(true)
    const geen = run({ ...hh(pers('A', { ondernemingen: [ond(60000, { samenwerkingMetPartner: 'arbeidsbeloning', meewerkendePartner: { uren: 600, vergoeding: 6000, vergoedingInKosten: false } })] }), pers('B')), fiscaalPartner: false })
    expect(geen.personen[0].winstUitOnderneming).toBe(60000)
    expect(geen.personen[1].overigWerk).toBe(0)
    expect(geen.personen[0].waarschuwingen.some((w) => w.id === 'partner-geen-fiscaal-partner')).toBe(true)
  })
})

describe('terbeschikkingstelling (art. 3.91, 3.95, 3.99b)', () => {
  const bus: VermogensPositie = { id: 'pos-bus', omschrijving: 'Bestelbus', categorie: 'overig', eigenaar: 'B', waardeBegin: 30000 }
  const lening: VermogensPositie = { id: 'pos-lening', omschrijving: 'Lening aan Ontwerpstudio', categorie: 'vorderingen', eigenaar: 'B', waardeBegin: 20000 }

  it('P3: B verhuurt een bestelbus aan A voor 2.400, kosten 300, afschrijving 1.500: resultaat 600, vrijstelling 72, belast 528; bus niet in box 3', () => {
    const u = run(hh(pers('A', { ondernemingen: [ond(60000)] }), pers('B', { terbeschikkingstellingen: [tbs({ box3PositieId: 'pos-bus' })] }), { box3: { posities: [bus], schulden: [] } }))
    const b = u.personen[1]
    expect(b.overigWerkDetail?.terbeschikkingstelling).toMatchObject({ resultaat: 600, vrijstelling: 72, belastbaar: 528 })
    expect(b.overigWerk).toBe(528)
    expect(b.arbeidsinkomen).toBe(0)
    expect(b.zvw.bijdrageInkomen).toBe(528)
    expect(u.box3.buitenBox3).toEqual(['pos-bus'])
    expect(u.box3.bezittingen).toBe(0)
    // Bij A zit de huur standaard al in de kosten: geen correctie.
    expect(u.personen[0].ondernemingen[0].correctiePartner).toBeUndefined()
    // Nog niet in de kosten: dan gaat hij van de winst af.
    const nietInKosten = run(hh(pers('A', { ondernemingen: [ond(60000)] }), pers('B', { terbeschikkingstellingen: [tbs({ vergoedingInKosten: false })] })))
    expect(nietInKosten.personen[0].ondernemingen[0].correctiePartner).toBe(-2400)
    expect(nietInKosten.personen[0].winstUitOnderneming).toBe(57600)
  })

  it('P4: B leent A 20.000 tegen 4%: 800, vrijstelling 96, belast 704; vordering niet in box 3', () => {
    const u = run(
      hh(pers('A', { ondernemingen: [ond(60000)] }), pers('B', { terbeschikkingstellingen: [tbs({ id: 'tbs-lening', omschrijving: 'Lening', soort: 'lening', vergoeding: 800, kosten: 0, afschrijving: 0, waardeBijAanvang: 20000, box3PositieId: 'pos-lening' })] }), {
        box3: { posities: [lening], schulden: [] },
      }),
    )
    expect(u.personen[1].overigWerkDetail?.terbeschikkingstelling).toMatchObject({ resultaat: 800, vrijstelling: 96, belastbaar: 704 })
    expect(u.box3.buitenBox3).toEqual(['pos-lening'])
  })

  it('P5: werkruimte in de woning van B zonder vergoeding die niet aan de toets voldoet: geen terbeschikkingstelling', () => {
    const t = tbs({ id: 'tbs-kamer', omschrijving: 'Kamer', soort: 'werkruimte', vergoeding: 0, kosten: 0, afschrijving: 0 })
    const u = run(hh(pers('A', { ondernemingen: [ond(60000)] }), pers('B', { terbeschikkingstellingen: [t] })))
    const uit = u.personen[1].overigWerkDetail?.terbeschikkingstelling
    expect(uit).toMatchObject({ resultaat: 0, vrijstelling: 0, belastbaar: 0, nietGeteld: [{ id: 'tbs-kamer', reden: 'werkruimte' }] })
    expect(u.personen[1].overigWerk).toBe(0)
    // Voldoet de werkruimte wel (zelfstandig, 30% van het inkomen erin), dan telt hij, ook zonder vergoeding.
    const voldoet = { zelfstandig: true, deelInkomenInOfVanuit: 1, deelInkomenIn: 0.5, werkplekElders: false, kosten: 0 }
    expect(werkruimteVoldoet({ werkruimte: voldoet }, P26)).toBe(true)
    const u2 = run(hh(pers('A', { ondernemingen: [ond(60000, { werkruimte: voldoet })] }), pers('B', { terbeschikkingstellingen: [{ ...t, kosten: 500 }] })))
    expect(u2.personen[1].overigWerkDetail?.terbeschikkingstelling).toMatchObject({ resultaat: -500, vrijstelling: -60, belastbaar: -440 })
  })

  it('werkruimte die niet voldoet met een vergoeding in de kosten: die vergoeding is niet aftrekbaar', () => {
    const t = tbs({ id: 'tbs-kamer', omschrijving: 'Kamer', soort: 'werkruimte', vergoeding: 1200, kosten: 0, afschrijving: 0 })
    const u = run(hh(pers('A', { ondernemingen: [ond(60000)] }), pers('B', { terbeschikkingstellingen: [t] })))
    expect(u.personen[0].ondernemingen[0].correctiePartner).toBe(1200)
    expect(u.personen[1].overigWerk).toBe(0)
  })

  it('P6: bus zonder vergoeding (kosten 300, afschrijving 1.500): resultaat −1.800, vrijstelling −216, belast −1.584', () => {
    const u = terbeschikkingstelling(pers('B', { terbeschikkingstellingen: [tbs({ vergoeding: 0 })] }), hh(pers('A', { ondernemingen: [ond(60000)] }), pers('B', { terbeschikkingstellingen: [tbs({ vergoeding: 0 })] })), P26)
    expect(u).toMatchObject({ resultaat: -1800, vrijstelling: -216, belastbaar: -1584 })
  })

  it('P7: P3 en P6 samen: Σ −1.200, vrijstelling −144, belast −1.056 (vrijstelling over het saldo, niet per regel)', () => {
    const b = pers('B', { terbeschikkingstellingen: [tbs(), tbs({ id: 'tbs-bus2', omschrijving: 'Tweede bus', vergoeding: 0 })] })
    const u = run(hh(pers('A', { ondernemingen: [ond(60000)] }), b))
    expect(u.personen[1].overigWerkDetail?.terbeschikkingstelling).toMatchObject({ resultaat: -1200, vrijstelling: -144, belastbaar: -1056 })
    expect(u.personen[1].overigWerkDetail?.terbeschikkingstelling?.regels.map((r) => r.resultaat)).toEqual([600, -1800])
  })

  it('P8: de verwijzing op id blijft bij dezelfde onderneming als de eerste wordt weggehaald', () => {
    const t = tbs({ aan: { persoon: 'A', ondernemingId: 'ond-2' }, vergoedingInKosten: false })
    const a = pers('A', { ondernemingen: [ond(10000, { id: 'ond-1', naam: 'Eerste' }), ond(60000, { id: 'ond-2', naam: 'Tweede' })] })
    const voor = hh(a, pers('B', { terbeschikkingstellingen: [t] }))
    expect(ondernemingVanTbs(t, voor)?.onderneming.naam).toBe('Tweede')
    const na = hh({ ...a, ondernemingen: [a.ondernemingen[1]] }, pers('B', { terbeschikkingstellingen: [t] }))
    expect(ondernemingVanTbs(t, na)?.onderneming.naam).toBe('Tweede')
    const u = run(na)
    expect(u.personen[0].ondernemingen[0].correctiePartner).toBe(-2400)
    // Is de onderneming zelf weg, dan telt de regel niet (en wijst hij niet naar een andere onderneming).
    const weg = hh({ ...a, ondernemingen: [a.ondernemingen[0]] }, pers('B', { terbeschikkingstellingen: [t] }))
    expect(ondernemingVanTbs(t, weg)).toBeNull()
    expect(correctiePartner(weg, weg.personen[0], weg.personen[0].ondernemingen[0], P26).bedrag).toBe(0)
    expect(run(weg).personen[1].waarschuwingen.some((w) => w.id === 'tbs-zonder-onderneming-tbs-bus')).toBe(true)
  })

  it('einde: boekwinst = opbrengst − boekwaarde; boekwaarde eind rolt door', () => {
    const t = tbs({ boekwaardeBegin: 10000, einde: { datum: '2026-09-30', opbrengst: 9000 } })
    const u = terbeschikkingstelling(pers('B', { terbeschikkingstellingen: [t] }), hh(pers('A', { ondernemingen: [ond(60000)] }), pers('B', { terbeschikkingstellingen: [t] })), P26)
    // boekwaarde na afschrijving 8.500; boekwinst 500; resultaat 2.400 − 300 − 1.500 + 500 = 1.100
    expect(u?.regels[0]).toMatchObject({ resultaat: 1100, boekwinst: 500, boekwaardeEind: 0 })
    const zonder = terbeschikkingstelling(pers('B', { terbeschikkingstellingen: [tbs({ waardeBijAanvang: 30000 })] }), hh(pers('A', { ondernemingen: [ond(60000)] }), pers('B')), P26)
    expect(zonder?.regels[0].boekwaardeEind).toBe(28500)
  })
})
