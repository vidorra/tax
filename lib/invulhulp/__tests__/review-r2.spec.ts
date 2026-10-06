/**
 * Review ronde 2, bevindingen 3, 4, 5, 6, 8, 10 en 11: elk invulhulpveld geeft het bedrag van de engine op het juiste
 * scherm. Waar het programma zelf rekent (winstberekening, terbeschikkingstelling), rekenen we na dat de ingevulde
 * velden samen op de uitkomst van de engine uitkomen.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer, HuishoudenResultaat, OndernemingInvoer, PersoonInvoer } from '@/lib/tax/types'
import { bouwInvulhulp } from '../opbouw'
import type { InvulhulpOpbouw, Scherm, Veld } from '../types'

function ond(x: Partial<OndernemingInvoer> = {}): OndernemingInvoer {
  return { id: 'ond-1', naam: 'Studio', winstBron: 'boekhouding', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 1600, urencriteriumGehaald: true }, startjaar: 2015, ...x }
}
function persoon(id: 'A' | 'B', x: Partial<PersoonInvoer> = {}): PersoonInvoer {
  return { id, naam: `Persoon ${id}`, geboortedatum: id === 'A' ? '1985-04-01' : '1987-06-01', ondernemingen: [], loon: [], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 }, ...x }
}
function hh(jaar: number, personen: PersoonInvoer[], x: Partial<HuishoudenInvoer> = {}): HuishoudenInvoer {
  return {
    jaar,
    personen,
    fiscaalPartner: personen.length === 2,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: { eigenWoning: 0.5, pga: 0.5, box3: 0.5, box2: 0.5, dividendbelasting: 0.5 },
    ...x,
  }
}

function bouw(i: HuishoudenInvoer): { o: InvulhulpOpbouw; r: HuishoudenResultaat } {
  const r = berekenHuishouden(i)
  return { o: bouwInvulhulp({ jaar: i.jaar, invoer: i, resultaat: r, params: getJaar(i.jaar) }), r }
}
const schermenMet = (o: InvulhulpOpbouw, id: string): Scherm[] => o.schermen.filter((s) => s.id === id)
/** Het veld `veldId` op het eerste scherm `schermId` (zichtbaar of leeg), of undefined als het er niet is. */
function veldOp(o: InvulhulpOpbouw, schermId: string, veldId: string, persoonId?: string): Veld | undefined {
  for (const s of schermenMet(o, schermId)) {
    if (persoonId && s.persoon !== persoonId) continue
    for (const r of s.rubrieken) for (const v of r.velden) if (v.id === veldId) return v
  }
  return undefined
}
/** Bedrag zoals de gebruiker het invult: 0 als het veld leeg of verborgen is. */
function bedragOp(o: InvulhulpOpbouw, schermId: string, veldId: string, persoonId?: string): number {
  const v = veldOp(o, schermId, veldId, persoonId)
  return v && !v.leeg && v.waarde.soort === 'bedrag' ? (v.waarde.bedrag ?? 0) : 0
}
const zichtbaar = (o: InvulhulpOpbouw, schermId: string, veldId: string, persoonId?: string) => {
  const v = veldOp(o, schermId, veldId, persoonId)
  return Boolean(v && !v.leeg)
}
const tekstOp = (o: InvulhulpOpbouw, schermId: string, veldId: string) => {
  const v = veldOp(o, schermId, veldId)
  return v && v.waarde.soort === 'tekst' ? v.waarde.tekst : null
}

/**
 * De winstberekening zoals het programma hem uit de ingevulde schermen rekent: saldo W&V (plus de bijtelling als die
 * niet in de boekhouding zit; de invulhulp vraagt dan de kosten te verlagen), plus niet-aftrekbare kosten, plus de
 * afnames min de toevoegingen van de reserves. Moet gelijk zijn aan "Fiscalewinstberekening" (B).
 */
function winstViaProgramma(o: InvulhulpOpbouw, r: HuishoudenResultaat): number {
  const ro = r.personen[0].ondernemingen[0]
  return (
    bedragOp(o, 'winst-en-verliesrekening', 'saldo') +
    ro.bijtellingAuto +
    bedragOp(o, 'niet-aftrekbare-kosten', 'niet-aftrekbaar') +
    bedragOp(o, 'toelaatbare-reserves', 'wtoeresafegaang') +
    bedragOp(o, 'toelaatbare-reserves', 'wtoeresafheraang') +
    bedragOp(o, 'toelaatbare-reserves', 'wtoeresafoudaang') -
    bedragOp(o, 'toelaatbare-reserves', 'wtoerestoevegaang') -
    bedragOp(o, 'toelaatbare-reserves', 'wtoerestoevheraang')
  )
}

describe('bevinding 4: btw-correctie privégebruik buiten de autokosten', () => {
  const auto = (inAutokosten: boolean) => ({
    cataloguswaarde: 45000,
    datumEersteToelating: '2024-01-15',
    nulEmissie: false,
    autokosten: 9000,
    terBeschikkingSinds: '2024-01-15',
    btw: { aftrekBijAanschaf: true, methode: 'forfait' as const, btwOpKosten: 2000, btwBijAanschaf: 7000, inAutokosten },
  })

  it('uitgesplitst: de correctie staat bij de auto- en transportkosten en bij Kosten voor deze auto; W&V plus bijtelling is de winst', () => {
    const i = hh(2026, [persoon('A', { ondernemingen: [ond({ winstberekening: { soort: 'uitgesplitst', omzet: 100000, kosten: 30000 }, auto: auto(false) })] })])
    const { o, r } = bouw(i)
    const ro = r.personen[0].ondernemingen[0]
    const btw = ro.auto!.btwCorrectieAfgetrokken
    expect(btw).toBeGreaterThan(0)
    expect(bedragOp(o, 'winst-en-verliesrekening', 'ovrauto')).toBe(9000 + btw)
    expect(veldOp(o, 'winst-en-verliesrekening', 'ovrauto')?.hint).toContain('btw-correctie')
    expect(bedragOp(o, 'prive', 'autkost')).toBe(ro.auto!.plafond)
    // Opbrengsten min kosten min auto plus de bijtelling: de winst van de engine.
    const wv = bedragOp(o, 'winst-en-verliesrekening', 'opbomz') - bedragOp(o, 'winst-en-verliesrekening', 'ovrand') - bedragOp(o, 'winst-en-verliesrekening', 'ovrauto')
    expect(bedragOp(o, 'winst-en-verliesrekening', 'saldo')).toBe(wv)
    expect(wv + bedragOp(o, 'prive', 'auto-onttrekking')).toBe(Math.round(ro.winst))
    expect(winstViaProgramma(o, r)).toBe(bedragOp(o, 'winstberekening', 'fiscale-winst'))
  })

  it('in de autokosten: geen extra bedrag', () => {
    const i = hh(2026, [persoon('A', { ondernemingen: [ond({ winstberekening: { soort: 'uitgesplitst', omzet: 100000, kosten: 30000 }, auto: auto(true) })] })])
    const { o, r } = bouw(i)
    expect(r.personen[0].ondernemingen[0].auto!.btwCorrectieAfgetrokken).toBe(0)
    expect(bedragOp(o, 'winst-en-verliesrekening', 'ovrauto')).toBe(9000)
    expect(bedragOp(o, 'prive', 'autkost')).toBe(9000)
    expect(winstViaProgramma(o, r)).toBe(bedragOp(o, 'winstberekening', 'fiscale-winst'))
  })

  it('saldo zonder rubrieken: een melding, het controlesaldo zonder de correctie en de correctie in Kosten voor deze auto', () => {
    const i = hh(2026, [persoon('A', { ondernemingen: [ond({ winstberekening: { soort: 'saldo', saldo: 60000 }, auto: auto(false) })] })])
    const { o, r } = bouw(i)
    const ro = r.personen[0].ondernemingen[0]
    const btw = ro.auto!.btwCorrectieAfgetrokken
    expect(btw).toBeGreaterThan(0)
    const s = schermenMet(o, 'winst-en-verliesrekening')[0]
    expect(s.melding?.tekst).toMatch(/btw-correctie privégebruik auto \(€\s[\d.]+\) op bij de auto- en transportkosten/)
    expect(bedragOp(o, 'winst-en-verliesrekening', 'saldo')).toBe(Math.round(ro.saldo - btw))
    expect(bedragOp(o, 'winst-en-verliesrekening', 'saldo')).toBe(Math.round(ro.winst))
    expect(bedragOp(o, 'prive', 'autkost')).toBe(9000 + btw)
  })
})

describe('bevinding 5: afboeking herinvesteringsreserve is een last in het W&V-saldo', () => {
  it('saldo W&V plus afname reserve is de fiscale winst', () => {
    const o1 = ond({
      winstberekening: { soort: 'uitgesplitst', omzet: 100000, kosten: 30000 },
      herinvesteringsreserves: [{ id: 'hir-2025-1', ontstaanJaar: 2025, bedragOntstaan: 12000, standBegin: 12000, herkomst: { omschrijving: 'Bestelbus', boekwaardeOud: 8000, langlopend: false }, voornemen: true }],
      investeringen: [{ id: 'inv-1', omschrijving: 'Nieuwe bus', datum: '2026-03-01', bedrag: 30000, regeling: 'geen', herinvesteringsreserve: { reserveId: 'hir-2025-1', afboeking: 12000 } }],
    })
    const { o, r } = bouw(hh(2026, [persoon('A', { ondernemingen: [o1] })]))
    const winst = Math.round(r.personen[0].ondernemingen[0].winst)
    expect(bedragOp(o, 'winst-en-verliesrekening', 'bgewaf')).toBe(12000)
    expect(bedragOp(o, 'winst-en-verliesrekening', 'saldo')).toBe(100000 - 30000 - 12000)
    expect(bedragOp(o, 'toelaatbare-reserves', 'wtoeresafheraang')).toBe(12000)
    expect(bedragOp(o, 'winst-en-verliesrekening', 'saldo') + bedragOp(o, 'toelaatbare-reserves', 'wtoeresafheraang')).toBe(winst)
    expect(winstViaProgramma(o, r)).toBe(bedragOp(o, 'winstberekening', 'fiscale-winst'))
  })
})

describe('bevinding 3: Verdelen buitenlandse bronbelasting', () => {
  const positie = (waardeBegin: number) => ({
    id: 'p1',
    omschrijving: 'Broker',
    categorie: 'beleggingen' as const,
    eigenaar: 'A' as const,
    waardeBegin,
    bronbelastingen: [{ id: 'bb-us', land: 'US', soort: 'dividend' as const, brutoInkomsten: 2000, bedrag: 300 }],
  })
  const rijen = (o: InvulhulpOpbouw) => ({
    totaal: bedragOp(o, 'verdelen', 'bronbelasting-totaal'),
    a: bedragOp(o, 'verdelen', 'bronbelasting-a'),
    b: bedragOp(o, 'verdelen', 'bronbelasting-b'),
  })
  const btlBijBeleggingen = (o: InvulhulpOpbouw) =>
    schermenMet(o, 'beleggingen')
      .flatMap((s) => s.rubrieken.flatMap((r) => r.velden))
      .filter((v) => v.id === 'btl' && v.waarde.soort === 'bedrag')
      .reduce((s, v) => s + (v.waarde.soort === 'bedrag' ? (v.waarde.bedrag ?? 0) : 0), 0)

  it('verdeelt de bronbelasting van dit jaar zoals bij Beleggingen, zonder de voortwenteling', () => {
    const i = hh(2025, [persoon('A', { voortgewenteldeBronbelasting: 250 }), persoon('B')], { box3: { posities: [positie(200000)], schulden: [] } })
    const { o, r } = bouw(i)
    const x = rijen(o)
    expect(btlBijBeleggingen(o)).toBe(300)
    expect(x).toEqual({ totaal: 300, a: 150, b: 150 })
    expect(x.a).toBe(Math.round(r.personen[0].bronbelasting!.verrekenbaar))
    // De voortwenteling staat apart bij Aftrek om dubbele belasting te voorkomen.
    expect(bedragOp(o, 'aanvullende-vragen', 'restant-buitenlandse-belasting', 'A')).toBe(250)
  })

  it('zonder box 3-belasting (alles schuift door) blijft de rij staan', () => {
    const i = hh(2025, [persoon('A'), persoon('B')], { box3: { posities: [positie(60000)], schulden: [] } })
    const { o, r } = bouw(i)
    expect(r.personen.every((p) => (p.bronbelasting?.verrekend ?? 0) === 0)).toBe(true)
    expect(rijen(o)).toEqual({ totaal: 300, a: 150, b: 150 })
  })

  it('volgt de verdeling van de grondslag', () => {
    const i = hh(2025, [persoon('A'), persoon('B')], {
      box3: { posities: [positie(300000)], schulden: [] },
      verdeling: { eigenWoning: 0.5, pga: 0.5, box3: 0.8, box2: 0.5, dividendbelasting: 0.5 },
    })
    const { o } = bouw(i)
    const x = rijen(o)
    const grondslag = { totaal: bedragOp(o, 'verdelen', 'box3-totaal'), a: bedragOp(o, 'verdelen', 'box3-a') }
    expect(x.totaal).toBe(300)
    expect(x.a + x.b).toBe(300)
    expect(x.a / x.totaal).toBeCloseTo(grondslag.a / grondslag.totaal, 2)
  })
})

describe('bevinding 6: stakingslijfrente uit de vrijval van de oudedagsreserve', () => {
  const metStaking = (premie: number, extra: Partial<NonNullable<PersoonInvoer['inkomensvoorziening']['stakingslijfrente']>> = {}, forOmzetting?: number) =>
    hh(2025, [
      persoon('A', {
        geboortedatum: '1970-03-01',
        ondernemingen: [ond({ winstberekening: { soort: 'saldo', saldo: 70000 }, for: { stand: 10000 }, staking: { soort: 'geheel', datum: '2025-12-31', stakingswinst: 20000 } })],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, ...(forOmzetting ? { forOmzetting } : {}), stakingslijfrente: { premie, eerderAfgetrokkenLijfrentepremies: 0, ...extra } },
      }),
    ])

  it('het deel tot de FOR-vrijval staat bij "uit de oudedagsreserve" (de Zvw-correctie), de rest bij "uit alleen de stakingswinst"', () => {
    const { o, r } = bouw(metStaking(20000))
    const p = r.personen[0]
    expect(p.zvwCorrectieFor).toBe(10000)
    expect(bedragOp(o, 'uitgaven-lijfrente', 'for')).toBe(p.zvwCorrectieFor)
    expect(bedragOp(o, 'uitgaven-lijfrente', 'stakingswinst')).toBe(20000 - 10000)
    const sl = p.inkomensvoorziening.stakingslijfrente!
    if (sl.uitFor !== undefined) {
      expect(bedragOp(o, 'uitgaven-lijfrente', 'for')).toBe(sl.uitFor)
      expect(bedragOp(o, 'uitgaven-lijfrente', 'stakingswinst')).toBe(sl.uitStakingswinst)
    }
    expect(veldOp(o, 'uitgaven-lijfrente', 'for')?.hint).toContain('geen bijdrage Zvw')
    expect(zichtbaar(o, 'uitgaven-lijfrente', 'lijfrente-volgend')).toBe(false)
  })

  it('een premie onder de FOR-vrijval staat helemaal bij "uit de oudedagsreserve"', () => {
    const { o, r } = bouw(metStaking(6000))
    expect(bedragOp(o, 'uitgaven-lijfrente', 'for')).toBe(6000)
    expect(bedragOp(o, 'uitgaven-lijfrente', 'for')).toBe(r.personen[0].zvwCorrectieFor)
    expect(zichtbaar(o, 'uitgaven-lijfrente', 'stakingswinst')).toBe(false)
  })

  it('betaald in de maanden na het jaar: de periodevraag van het programma met de premie, de verdeling blijft', () => {
    const { o } = bouw(metStaking(20000, { betaaldOp: '2026-05-15' }))
    const v = veldOp(o, 'uitgaven-lijfrente', 'lijfrente-volgend')!
    expect(v.leeg).toBeFalsy()
    expect(v.label).toBe('Uitgaven in de periode 1 januari 2026 tot en met 30 juni 2026')
    expect(v.waarde).toEqual({ soort: 'bedrag', bedrag: 20000 })
    expect(bedragOp(o, 'uitgaven-lijfrente', 'for') + bedragOp(o, 'uitgaven-lijfrente', 'stakingswinst')).toBe(20000)
    expect(veldOp(o, 'uitgaven-lijfrente', 'stakingswinst')?.hint).toContain('in 2026 betaalde')
  })

  it('te laat betaald: de engine telt de premie niet, de invulhulp ook niet', () => {
    const { o, r } = bouw(metStaking(20000, { betaaldOp: '2026-07-15' }))
    expect(r.personen[0].inkomensvoorziening.stakingslijfrente?.premie ?? 0).toBe(0)
    expect(zichtbaar(o, 'uitgaven-lijfrente', 'stakingswinst')).toBe(false)
    expect(zichtbaar(o, 'uitgaven-lijfrente', 'lijfrente-volgend')).toBe(false)
  })
})

describe('bevinding 8: terbeschikkingstelling uit de uitkomst van de engine', () => {
  it('boekwinst bij einde of verkoop staat bij de inkomsten; inkomsten min kosten is het resultaat', () => {
    const A = persoon('A', { ondernemingen: [ond()] })
    const B = persoon('B', {
      terbeschikkingstellingen: [
        { id: 'tbs-1', omschrijving: 'Bus', aan: { persoon: 'A', ondernemingId: 'ond-1' }, soort: 'zaak', vergoeding: 2400, kosten: 300, afschrijving: 1000, boekwaardeBegin: 8000, einde: { datum: '2026-12-31', opbrengst: 12000 } },
      ],
    })
    const { o, r } = bouw(hh(2026, [A, B]))
    const tbs = r.personen[1].overigWerkDetail!.terbeschikkingstelling!
    const inkomsten = bedragOp(o, 'beschikbaar-gestelde-bezittingen', 'inkomsten', 'B')
    const kosten = bedragOp(o, 'beschikbaar-gestelde-bezittingen', 'kosten', 'B')
    expect(inkomsten).toBe(2400 + 5000)
    expect(kosten).toBe(1300)
    expect(inkomsten - kosten).toBe(tbs.resultaat)
    expect(veldOp(o, 'beschikbaar-gestelde-bezittingen', 'inkomsten', 'B')?.hint).toContain('boekwinst')
  })

  it('een boekverlies staat bij de kosten', () => {
    const B = persoon('B', {
      terbeschikkingstellingen: [
        { id: 'tbs-1', omschrijving: 'Bus', aan: { persoon: 'A', ondernemingId: 'ond-1' }, soort: 'zaak', vergoeding: 2400, kosten: 300, afschrijving: 1000, boekwaardeBegin: 8000, einde: { datum: '2026-12-31', opbrengst: 5000 } },
      ],
    })
    const { o, r } = bouw(hh(2026, [persoon('A', { ondernemingen: [ond()] }), B]))
    const tbs = r.personen[1].overigWerkDetail!.terbeschikkingstelling!
    expect(bedragOp(o, 'beschikbaar-gestelde-bezittingen', 'inkomsten', 'B')).toBe(2400)
    expect(bedragOp(o, 'beschikbaar-gestelde-bezittingen', 'kosten', 'B')).toBe(1300 + 2000)
    expect(bedragOp(o, 'beschikbaar-gestelde-bezittingen', 'inkomsten', 'B') - bedragOp(o, 'beschikbaar-gestelde-bezittingen', 'kosten', 'B')).toBe(tbs.resultaat)
  })

  it('een werkruimte die niet voldoet, telt niet mee: geen scherm en geen vinkje', () => {
    const A = persoon('A', { ondernemingen: [ond({ werkruimte: { zelfstandig: false, deelInkomenInOfVanuit: 0.5, deelInkomenIn: 0.2, werkplekElders: true, kosten: 0 } })] })
    const B = persoon('B', { terbeschikkingstellingen: [{ id: 'tbs-1', omschrijving: 'Werkkamer', aan: { persoon: 'A', ondernemingId: 'ond-1' }, soort: 'werkruimte', vergoeding: 1200 }] })
    const { o, r } = bouw(hh(2026, [A, B]))
    expect(r.personen[1].overigWerkDetail!.terbeschikkingstelling!.nietGeteld).toEqual([{ id: 'tbs-1', reden: 'werkruimte' }])
    expect(schermenMet(o, 'beschikbaar-gestelde-bezittingen')).toEqual([])
    expect(zichtbaar(o, 'inkomsten', 'beschikbaar', 'B')).toBe(false)
  })

  it('naast een regel die wel telt: alleen die regel, met een hint', () => {
    const A = persoon('A', { ondernemingen: [ond({ werkruimte: { zelfstandig: false, deelInkomenInOfVanuit: 0.5, deelInkomenIn: 0.2, werkplekElders: true, kosten: 0 } })] })
    const B = persoon('B', {
      terbeschikkingstellingen: [
        { id: 'tbs-1', omschrijving: 'Werkkamer', aan: { persoon: 'A', ondernemingId: 'ond-1' }, soort: 'werkruimte', vergoeding: 1200 },
        { id: 'tbs-2', omschrijving: 'Bus', aan: { persoon: 'A', ondernemingId: 'ond-1' }, soort: 'zaak', vergoeding: 2400, kosten: 300, afschrijving: 1000 },
      ],
    })
    const { o, r } = bouw(hh(2026, [A, B]))
    const tbs = r.personen[1].overigWerkDetail!.terbeschikkingstelling!
    expect(bedragOp(o, 'beschikbaar-gestelde-bezittingen', 'inkomsten', 'B')).toBe(2400)
    expect(bedragOp(o, 'beschikbaar-gestelde-bezittingen', 'inkomsten', 'B') - bedragOp(o, 'beschikbaar-gestelde-bezittingen', 'kosten', 'B')).toBe(tbs.resultaat)
    expect(veldOp(o, 'beschikbaar-gestelde-bezittingen', 'inkomsten', 'B')?.hint).toContain('telt niet mee')
  })
})

describe('bevinding 10: periode van de auto', () => {
  const metAuto = (x: Partial<NonNullable<OndernemingInvoer['auto']>>) =>
    hh(2026, [
      persoon('A', {
        ondernemingen: [ond({ winstberekening: { soort: 'uitgesplitst', omzet: 100000, kosten: 30000 }, auto: { cataloguswaarde: 40000, datumEersteToelating: '2026-06-20', nulEmissie: false, autokosten: 6000, ...x } })],
      }),
    ])

  it('vanaf 1 juli: Periode van en tot en met, zoals de engine rekent', () => {
    const { o, r } = bouw(metAuto({ terBeschikkingSinds: '2026-07-01' }))
    expect(r.personen[0].ondernemingen[0].bijtellingAuto).toBe(4400)
    expect(tekstOp(o, 'prive', 'autstandper_b')).toBe('01-07-2026')
    expect(tekstOp(o, 'prive', 'autstandper_e')).toBe('31-12-2026')
    expect(veldOp(o, 'prive', 'autstandper_b')?.hint).toBe('De dag waarop de auto tot je beschikking kwam.')
    expect(veldOp(o, 'prive', 'autstandper_e')?.hint).toBeNull()
  })

  it('het hele jaar: geen periodevelden', () => {
    const { o } = bouw(metAuto({ datumEersteToelating: '2024-03-01', terBeschikkingSinds: '2024-03-01' }))
    expect(zichtbaar(o, 'prive', 'autstandper_b')).toBe(false)
    expect(zichtbaar(o, 'prive', 'autstandper_e')).toBe(false)
  })

  it('midden in een maand: de hint dat het programma per dag rekent', () => {
    const { o } = bouw(metAuto({ datumEersteToelating: '2024-03-01', terBeschikkingSinds: '2024-03-01', terBeschikkingTot: '2026-09-15' }))
    expect(tekstOp(o, 'prive', 'autstandper_b')).toBe('01-01-2026')
    expect(tekstOp(o, 'prive', 'autstandper_e')).toBe('15-09-2026')
    expect(veldOp(o, 'prive', 'autstandper_b')?.hint).toBeNull()
    expect(veldOp(o, 'prive', 'autstandper_e')?.hint).toContain('De laatste dag dat de auto tot je beschikking stond.')
    expect(veldOp(o, 'prive', 'autstandper_e')?.hint).toContain('per dag')
  })
})

describe('bevinding 11: youngtimer in het grensjaar', () => {
  it('overgangsrecht 2026: het bedrag van de bijtelling, niet de cataloguswaarde', () => {
    const o1 = ond({ auto: { cataloguswaarde: 40000, datumEersteToelating: '2010-04-15', dagwaarde: 8000, nulEmissie: false, autokosten: 9000, terBeschikkingSinds: '2024-01-01' } })
    const { o, r } = bouw(hh(2026, [persoon('A', { ondernemingen: [o1] })]))
    const a = r.personen[0].ondernemingen[0].auto!
    expect(a.overgangsrecht).toBe(true)
    expect(bedragOp(o, 'prive', 'autbijzaang')).toBe(a.bijtelling)
    expect(veldOp(o, 'prive', 'autbijzaang')?.hint).toContain('overgangsrecht')
    for (const id of ['autstandcata', 'autkm', 'auttoegel', 'autenergie']) expect(zichtbaar(o, 'prive', id)).toBe(false)
  })

  it('een auto die dit jaar youngtimer wordt: het bedrag, met de datum in de hint', () => {
    const o1 = ond({
      winstberekening: { soort: 'uitgesplitst', omzet: 100000, kosten: 30000 },
      auto: { cataloguswaarde: 40000, datumEersteToelating: '2010-04-15', dagwaarde: 8000, nulEmissie: false, autokosten: 12000 },
    })
    const { o, r } = bouw(hh(2025, [persoon('A', { ondernemingen: [o1] })]))
    const a = r.personen[0].ondernemingen[0].auto!
    expect(a.soort).toBe('gemengd')
    expect(bedragOp(o, 'prive', 'autbijzaang')).toBe(a.bijtelling)
    expect(veldOp(o, 'prive', 'autbijzaang')?.hint).toContain('1 mei 2025')
    expect(zichtbaar(o, 'prive', 'autstandcata')).toBe(false)
  })

  it('een jongere auto: de cataloguswaarde, zoals voorheen', () => {
    const o1 = ond({ auto: { cataloguswaarde: 40000, datumEersteToelating: '2018-04-15', nulEmissie: false, autokosten: 12000 } })
    const { o } = bouw(hh(2025, [persoon('A', { ondernemingen: [o1] })]))
    expect(zichtbaar(o, 'prive', 'autbijzaang')).toBe(false)
    expect(bedragOp(o, 'prive', 'autstandcata')).toBe(40000)
  })
})
