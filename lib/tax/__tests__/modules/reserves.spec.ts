/**
 * Ronde 2 (A6): herinvesteringsreserve en kostenegalisatiereserve. Testgevallen H1 tot en met H9, KE1 en KE2 uit
 * taak-A6.md (hoofdstuk 5).
 */
import { describe, expect, it } from 'vitest'
import type { HerinvesteringsreserveInvoer, OndernemingInvoer } from '../../types'
import { getJaar } from '../../years'
import { berekenOnderneming } from '../../modules/onderneming'
import { berekenAfschrijvingen } from '../../modules/onderneming/afschrijving'
import { berekenReserves, kanReserveren } from '../../modules/onderneming/reserves'
import { berekenHuishouden } from '../../engine'
import type { HuishoudenInvoer } from '../../types'
import { nieuwJaarUitVorig } from '@/lib/dossier/nieuw-jaar'

const ond = (o: Partial<OndernemingInvoer> = {}): OndernemingInvoer => ({
  id: 'ond-1',
  naam: 'Ontwerpstudio',
  winstberekening: { soort: 'saldo', saldo: 60000 },
  uren: { onderneming: 1600 },
  startjaar: 2010,
  ...o,
})

const bus = (r: Partial<HerinvesteringsreserveInvoer> = {}): HerinvesteringsreserveInvoer => ({
  id: 'hir-2026-1',
  ontstaanJaar: 2026,
  bedragOntstaan: 12000,
  standBegin: 0,
  herkomst: { omschrijving: 'Bus', opbrengst: 20000, boekwaardeOud: 8000, langlopend: false },
  voornemen: true,
  ...r,
})

const reken = (jaar: number, o: OndernemingInvoer) => berekenOnderneming(o, { params: getJaar(jaar), jaar, aowBereikt: false, urenLoondienst: 0, paramsVoorJaar: (j) => getJaar(j) })

describe('herinvesteringsreserve', () => {
  it('H1: boekwinst 12.000 in een reserve; de winst uit de boekhouding gaat niet omhoog door de verkoop', () => {
    const r = reken(2026, ond({ herinvesteringsreserves: [bus()] }))
    const h = r.herinvesteringsreserves![0]
    expect(h.dotatie).toBe(12000)
    expect(h.standEind).toBe(12000)
    expect(h.uiterlijkJaar).toBe(2029)
    expect(h.vrijval).toBe(0)
    expect(r.correctieReserves).toBe(-12000)
    expect(r.winst).toBe(48000)
  })

  it('H1 uit een fiscaal rapport: de dotatie zit al in het saldo, alleen de stand', () => {
    const r = reken(2026, ond({ winstBron: 'fiscaal-rapport', herinvesteringsreserves: [bus()] }))
    expect(r.correctieReserves).toBe(0)
    expect(r.winst).toBe(60000)
    expect(r.herinvesteringsreserves![0].standEind).toBe(12000)
    // Een expliciet antwoord gaat voor.
    expect(reken(2026, ond({ winstBron: 'fiscaal-rapport', herinvesteringsreserves: [bus({ mutatiesInSaldo: false })] })).correctieReserves).toBe(-12000)
  })

  it('H1b: nieuwe bus 30.000, afboeking 12.000: max 22.000, basis 18.000, afschrijving 2.600, KIA over 18.000', () => {
    const p = getJaar(2027)
    const o = ond({
      winstberekening: { soort: 'uitgesplitst', omzet: 80000, kosten: 20000 },
      activaVolledig: true,
      activa: [{ omschrijving: 'Nieuwe bus', aanschafdatum: '2027-01-01', aanschafwaarde: 30000, restwaarde: 5000, levensduurJaren: 5, methode: 'lineair' }],
      investeringen: [{ id: 'inv-1', omschrijving: 'Nieuwe bus', datum: '2027-01-01', bedrag: 30000, regeling: 'kia', herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 12000 } }],
      herinvesteringsreserves: [bus({ standBegin: 12000 })],
    })
    const r = reken(2027, o)
    const h = r.herinvesteringsreserves![0]
    expect(h.maxAfboeking).toBe(12000) // min(stand 12.000, 30.000 − 8.000 = 22.000)
    expect(h.afboeking).toBe(12000)
    expect(h.standEind).toBe(0)
    expect(h.vrijval).toBe(0)
    expect(h.perInvestering).toEqual([{ investering: 'inv-1', omschrijving: 'Nieuwe bus', gevraagd: 12000, bedrag: 12000, nieuwLanglopend: false, zelfdeFunctie: false }])
    expect(r.afschrijvingen![0].afschrijving).toBe(2600)
    expect(r.afschrijvingen![0].boekwaardeBegin).toBe(18000)
    expect(r.kia).toBe(Math.round(p.ondernemer.waarde.kia.pct * 18000))
    // Geen winsteffect van de afboeking zelf.
    expect(r.correctieReserves).toBe(0)
    // Met de goedkeuring: KIA over het volle bedrag.
    const vol = reken(2027, { ...o, investeringen: [{ ...o.investeringen![0], herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 12000, kiaOverVolBedrag: true } }] })
    expect(vol.kia).toBe(Math.round(p.ondernemer.waarde.kia.pct * 30000))
    expect(vol.waarschuwingen.some((w) => w.tekst.includes('afbouwzone kan de KIA verlagen'))).toBe(true)
  })

  it('H1b: het register schrijft af over aanschaf − afboeking − restwaarde', () => {
    const r = berekenAfschrijvingen([{ omschrijving: 'Bus', aanschafdatum: '2027-01-01', aanschafwaarde: 30000, restwaarde: 5000, levensduurJaren: 5, methode: 'lineair', herinvesteringsreserveAfboeking: 12000 }], {
      params: getJaar(2027),
      jaar: 2027,
      isStarter: false,
    })
    expect(r.perActief[0].afschrijving).toBe(2600)
    expect(r.perActief[0].boekwaardeEind).toBe(15400)
  })

  it('H2: nieuwe bus 15.000: max afboeking 7.000, basis 8.000, rest 5.000 tot en met 2029', () => {
    const r = reken(
      2027,
      ond({
        investeringen: [{ id: 'inv-1', omschrijving: 'Bus', datum: '2027-02-01', bedrag: 15000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 12000 } }],
        herinvesteringsreserves: [bus({ standBegin: 12000 })],
      }),
    )
    const h = r.herinvesteringsreserves![0]
    expect(h.maxAfboeking).toBe(7000)
    expect(h.afboeking).toBe(7000)
    expect(h.standEind).toBe(5000)
    expect(h.uiterlijkJaar).toBe(2029)
    expect(h.vrijval).toBe(0)
    expect(r.investeringsaftrekPerMiddel![0].betaald).toBe(8000)
  })

  it('H3: niets gekocht: 2027 en 2028 geen vrijval, 2029 vrijval 12.000 in de winst', () => {
    for (const jaar of [2027, 2028]) {
      const r = reken(jaar, ond({ herinvesteringsreserves: [bus({ standBegin: 12000 })] }))
      expect(r.herinvesteringsreserves![0].vrijval).toBe(0)
      expect(r.correctieReserves).toBe(0)
    }
    // 2029 heeft nog geen eigen parameters; de module rekent met die van 2028 (zelfde termijn).
    const r = berekenReserves(ond({ herinvesteringsreserves: [bus({ standBegin: 12000 })] }), { params: getJaar(2028), jaar: 2029 })
    expect(r.herinvesteringsreserves[0].vrijval).toBe(12000)
    expect(r.herinvesteringsreserves[0].reden).toBe('termijn')
    expect(r.correctieReserves).toBe(12000)
    expect(r.waarschuwingen.some((w) => w.id.includes('.hir.vervalt.'))).toBe(true)
  })

  it('H3b: voornemen vervalt in 2027: vrijval 12.000, reden geen-voornemen', () => {
    const r = reken(2027, ond({ herinvesteringsreserves: [bus({ standBegin: 12000, voornemen: false })] }))
    expect(r.herinvesteringsreserves![0].vrijval).toBe(12000)
    expect(r.herinvesteringsreserves![0].reden).toBe('geen-voornemen')
    expect(r.winst).toBe(72000)
  })

  it('H4: willekeurige afschrijving: dotatie begrensd op de boekwinst zonder willekeurige afschrijving', () => {
    const r = reken(2026, ond({ herinvesteringsreserves: [bus({ bedragOntstaan: 8000, herkomst: { omschrijving: 'Inventaris', opbrengst: 10000, boekwaardeOud: 6000, langlopend: false } })] }))
    const h = r.herinvesteringsreserves![0]
    expect(h.dotatie).toBe(4000)
    expect(h.begrensd).toEqual({ gevraagd: 8000, boekwinst: 4000 })
    // Saldo met de boekwinst van 8.000 (boekwaarde 2.000): 4.000 blijft direct belast.
    expect(r.correctieReserves).toBe(-4000)
  })

  it('H5: auto total loss met een uitkering van 12.000 en boekwaarde 5.000: reserve 7.000', () => {
    const r = reken(2026, ond({ herinvesteringsreserves: [bus({ bedragOntstaan: 7000, herkomst: { omschrijving: 'Auto', opbrengst: 12000, boekwaardeOud: 5000, langlopend: false, schadeloosstelling: true } })] }))
    expect(r.herinvesteringsreserves![0].dotatie).toBe(7000)
    expect(r.herinvesteringsreserves![0].begrensd).toBeUndefined()
  })

  it('H6: afboeken op een nieuw pand (langlopend) zonder zelfde functie wordt gemarkeerd; op een bus niet', () => {
    const pand = ond({
      activa: [{ omschrijving: 'Bedrijfspand', aanschafdatum: '2027-03-01', aanschafwaarde: 300000, restwaarde: 100000, levensduurJaren: 30, methode: 'lineair', soort: 'gebouw', woz: 250000 }],
      investeringen: [{ id: 'inv-1', omschrijving: 'Bedrijfspand', datum: '2027-03-01', bedrag: 300000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 500 } }],
      herinvesteringsreserves: [bus({ standBegin: 500, bedragOntstaan: 500, herkomst: { omschrijving: 'Laptop', boekwaardeOud: 300, langlopend: false } })],
    })
    const r = reken(2027, pand)
    expect(r.herinvesteringsreserves![0].perInvestering![0]).toMatchObject({ nieuwLanglopend: true, zelfdeFunctie: false })
    const bus2 = ond({
      investeringen: [{ id: 'inv-1', omschrijving: 'Bus', datum: '2027-03-01', bedrag: 30000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 5000 } }],
      herinvesteringsreserves: [bus({ standBegin: 5000, herkomst: { omschrijving: 'Oud pand', boekwaardeOud: 20000, langlopend: true } })],
    })
    expect(reken(2027, bus2).herinvesteringsreserves![0].perInvestering![0]).toMatchObject({ nieuwLanglopend: false })
  })

  it('H7: staking in 2028 met stand 5.000: in de stakingswinst', () => {
    const r = reken(2028, ond({ staking: { stakingswinst: 0, soort: 'geheel', datum: '2028-06-30' }, herinvesteringsreserves: [bus({ standBegin: 5000 })] }))
    expect(r.herinvesteringsreserves![0].vrijval).toBe(5000)
    expect(r.herinvesteringsreserves![0].reden).toBe('staking')
    expect(r.staking!.reservesVrijval).toBe(5000)
    expect(r.staking!.totaal).toBe(5000)
  })

  it('H8: geen reserve voor een middel tot de grens voor directe aftrek of een belegging', () => {
    const p = getJaar(2026)
    expect(kanReserveren({ aanschafwaarde: 400, methode: 'lineair' }, p)).toBe(false)
    expect(kanReserveren({ aanschafwaarde: 450, methode: 'lineair' }, p)).toBe(false)
    expect(kanReserveren({ aanschafwaarde: 5000, methode: 'lineair', belegging: true }, p)).toBe(false)
    expect(kanReserveren({ aanschafwaarde: 5000, methode: 'lineair' }, p)).toBe(true)
  })

  it('H8b: de hint "kun je een herinvesteringsreserve vormen" alleen als het kan en er nog geen is', () => {
    const p = getJaar(2026)
    const middel = (aanschafwaarde: number, herkomst?: string) => ({
      omschrijving: 'Middel',
      aanschafdatum: '2025-01-01',
      aanschafwaarde,
      restwaarde: 0,
      levensduurJaren: 5,
      methode: 'lineair' as const,
      verkocht: { datum: '2026-06-30', verkoopprijs: aanschafwaarde },
      ...(herkomst ? { herkomst } : {}),
    })
    const hint = (r: ReturnType<typeof berekenAfschrijvingen>) => r.waarschuwingen.some((w) => w.id.endsWith('.afschrijving.hir'))
    expect(hint(berekenAfschrijvingen([middel(5000)], { params: p, jaar: 2026, isStarter: false }))).toBe(true)
    expect(hint(berekenAfschrijvingen([middel(400)], { params: p, jaar: 2026, isStarter: false }))).toBe(false)
    expect(hint(berekenAfschrijvingen([middel(5000, 'act:2025:0')], { params: p, jaar: 2026, isStarter: false, reserveHerkomsten: new Set(['act:2025:0']) }))).toBe(false)
  })

  it('H9: afboeking 7.000 bij een maximum van 5.000: de engine boekt 5.000 af', () => {
    const r = reken(
      2027,
      ond({
        investeringen: [{ id: 'inv-1', omschrijving: 'Machine', datum: '2027-02-01', bedrag: 13000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 7000 } }],
        herinvesteringsreserves: [bus({ standBegin: 12000 })],
      }),
    )
    const h = r.herinvesteringsreserves![0]
    expect(h.maxAfboeking).toBe(5000)
    expect(h.afboeking).toBe(5000)
    expect(h.standEind).toBe(7000)
    expect(r.waarschuwingen.some((w) => w.id.includes('.hir.afboeking.'))).toBe(true)
  })

  it('H2 over twee jaren (review, bevinding 9): de bus van 2027 dekt de boekwaarde-eis, in 2028 kan de rest van 5.000 op een machine van 10.000', () => {
    // 2027: bus 15.000, afboeking 7.000: de bus houdt 8.000 = de boekwaarde van het oude middel, de eis is gedekt.
    const r27 = reken(2027, ond({ investeringen: [{ id: 'inv-1', omschrijving: 'Bus', datum: '2027-02-01', bedrag: 15000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 7000 } }], herinvesteringsreserves: [bus({ standBegin: 12000 })] }))
    const h27 = r27.herinvesteringsreserves![0]
    expect(h27.boekwaardeEis).toEqual({ boekwaardeOud: 8000, gedektBegin: 0, gedektEind: 8000, afgeleid: true })
    // 2028 zonder doorgerold veld: afgeleid uit de stand (5.000 < 12.000, dus al eerder afgeboekt).
    const machine = { id: 'inv-1', omschrijving: 'Machine', datum: '2028-03-01', bedrag: 10000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 5000 } }
    const r28 = reken(2028, ond({ investeringen: [machine], herinvesteringsreserves: [bus({ standBegin: h27.standEind })] }))
    const h28 = r28.herinvesteringsreserves![0]
    expect(h28).toMatchObject({ maxAfboeking: 5000, afboeking: 5000, standEind: 0, vrijval: 0 })
    expect(h28.boekwaardeEis).toEqual({ boekwaardeOud: 8000, gedektBegin: 8000, gedektEind: 8000, afgeleid: true })
    expect(r28.waarschuwingen.some((w) => w.id.includes('.hir.afboeking.'))).toBe(false)
    // Een lager doorgerold bedrag (een oude kopie) gaat niet onder wat uit de stand volgt.
    expect(reken(2028, ond({ investeringen: [machine], herinvesteringsreserves: [bus({ standBegin: 5000, boekwaardeEisGedekt: 0 })] })).herinvesteringsreserves![0]).toMatchObject({ maxAfboeking: 5000 })
    // Nog niets afgeboekt (stand begin = gevormd): het doorgerolde veld telt, bijvoorbeeld een eerder middel van 3.000
    // zonder afboeking. Machine 8.000: 8.000 − (8.000 − 3.000) = 3.000; met 0 de gewone toets 8.000 − 8.000 = 0.
    const deels = reken(2028, ond({ investeringen: [{ ...machine, bedrag: 8000 }], herinvesteringsreserves: [bus({ standBegin: 12000, boekwaardeEisGedekt: 3000 })] })).herinvesteringsreserves![0]
    expect(deels).toMatchObject({ maxAfboeking: 3000, afboeking: 3000 })
    expect(deels.boekwaardeEis).toEqual({ boekwaardeOud: 8000, gedektBegin: 3000, gedektEind: 8000, afgeleid: false })
    expect(reken(2028, ond({ investeringen: [{ ...machine, bedrag: 8000 }], herinvesteringsreserves: [bus({ standBegin: 12000, boekwaardeEisGedekt: 0 })] })).herinvesteringsreserves![0]).toMatchObject({ maxAfboeking: 0, afboeking: 0 })
  })

  it('H1, H2 en een machine in 2028 via de doorrol (nieuwJaarUitVorig): 5.000 afgeboekt, geen fout hir-afboeking', () => {
    const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
    const hh = (jaar: number, o: OndernemingInvoer): HuishoudenInvoer => ({
      jaar,
      personen: [{ id: 'A', geboortedatum: '1985-04-01', loon: [], inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 }, ondernemingen: [o] }],
      fiscaalPartner: false,
      kinderen: [],
      box3: { posities: [], schulden: [] },
      verdeling: 'optimaal',
    })
    const i26 = hh(2026, ond({ winstBron: 'boekhouding', herinvesteringsreserves: [bus()] }))
    const r26 = berekenHuishouden(i26, { zonderMarginaleDruk: true })
    const i27 = kloon(nieuwJaarUitVorig(i26, 2027, r26))
    i27.personen[0].ondernemingen[0].investeringen = [{ id: 'inv-1', omschrijving: 'Bus 2', datum: '2027-03-01', bedrag: 15000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 7000 } }]
    const r27 = berekenHuishouden(i27, { zonderMarginaleDruk: true })
    expect(r27.personen[0].ondernemingen[0].herinvesteringsreserves![0]).toMatchObject({ afboeking: 7000, standEind: 5000 })
    const i28 = kloon(nieuwJaarUitVorig(i27, 2028, r27))
    i28.personen[0].ondernemingen[0].investeringen = [{ id: 'inv-1', omschrijving: 'Machine', datum: '2028-03-01', bedrag: 10000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 5000 } }]
    const r28 = berekenHuishouden(i28, { zonderMarginaleDruk: true })
    const h28 = r28.personen[0].ondernemingen[0].herinvesteringsreserves![0]
    expect(h28).toMatchObject({ standBegin: 5000, maxAfboeking: 5000, afboeking: 5000, standEind: 0 })
    expect(r28.personen[0].ondernemingen[0].waarschuwingen.some((w) => w.id.includes('.hir.afboeking.'))).toBe(false)
    // De bus van 2027 dekt de boekwaarde-eis; zonder die telling zou het 10.000 − 8.000 = 2.000 zijn, met een fout.
    expect(h28.boekwaardeEis).toMatchObject({ gedektBegin: 8000, gedektEind: 8000 })
  })

  it('boekwaarde-eis: alleen begrensde dotatie (H4) telt niet als eerdere afboeking', () => {
    // Gevormd 4.000 (boekwinst), stand begin 4.000: niet eerder afgeboekt, de hele eis geldt nog.
    const r = reken(2027, ond({ investeringen: [{ id: 'inv-1', omschrijving: 'Kast', datum: '2027-02-01', bedrag: 9000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 4000 } }], herinvesteringsreserves: [bus({ standBegin: 4000, bedragOntstaan: 8000, herkomst: { omschrijving: 'Inventaris', opbrengst: 10000, boekwaardeOud: 6000, langlopend: false } })] }))
    expect(r.herinvesteringsreserves![0]).toMatchObject({ maxAfboeking: 3000, afboeking: 3000 })
    expect(r.herinvesteringsreserves![0].boekwaardeEis?.gedektBegin).toBe(0)
  })

  it('op een bedrijfsmiddel niet meer afboeken dan de aanschafprijs', () => {
    const r = reken(
      2028,
      ond({
        investeringen: [
          { id: 'inv-1', omschrijving: 'Laptop', datum: '2028-02-01', bedrag: 3000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 5000 } },
          { id: 'inv-2', omschrijving: 'Machine', datum: '2028-03-01', bedrag: 10000, herinvesteringsreserve: { reserveId: 'hir-2026-1', afboeking: 0 } },
        ],
        herinvesteringsreserves: [bus({ standBegin: 5000, boekwaardeEisGedekt: 8000 })],
      }),
    )
    const h = r.herinvesteringsreserves![0]
    expect(h.maxAfboeking).toBe(5000)
    expect(h.perInvestering!.map((x) => x.bedrag)).toEqual([3000, 0])
    expect(r.waarschuwingen.find((w) => w.id.includes('.hir.afboeking.'))?.tekst).toContain('niet meer af dan de aanschafprijs')
  })

  it('reserves tellen niet mee in het ondernemingsvermogen voor de FOR (AOW-leeftijd)', () => {
    const o = ond({ for: { stand: 10000 }, jaarrekening: { eind: { liquideMiddelen: 12000 } } })
    const aow = (x: OndernemingInvoer) => berekenOnderneming(x, { params: getJaar(2027), jaar: 2027, aowBereikt: true, urenLoondienst: 0 })
    expect(aow(o).verplichteForAfname).toBe(0)
    // Met een herinvesteringsreserve van 4.000 is het vermogen voor de FOR 12.000 − 4.000 = 8.000: afname 2.000.
    expect(aow({ ...o, herinvesteringsreserves: [bus({ standBegin: 4000 })] }).verplichteForAfname).toBe(2000)
  })
})

describe('kostenegalisatiereserve', () => {
  it('KE1: stand 10.000, onderhoud 10.500: onttrekking 10.000, 500 blijft kosten', () => {
    const r = reken(2027, ond({ egalisatiereserves: [{ id: 'eg-1', omschrijving: 'Groot onderhoud pand', standBegin: 10000, onttrekking: 10500 }] }))
    const e = r.egalisatiereserves![0]
    expect(e.onttrekking).toBe(10000)
    expect(e.onttrekkingBovenStand).toBe(500)
    expect(e.standEind).toBe(0)
    // Uit de boekhouding: de 10.500 staat als kosten in het saldo; 10.000 komt ten laste van de reserve.
    expect(r.correctieReserves).toBe(10000)
  })

  it('KE1: dotatie 2.000 per jaar', () => {
    const r = berekenReserves(ond({ egalisatiereserves: [{ id: 'eg-1', omschrijving: 'Groot onderhoud pand', standBegin: 8000, dotatie: 2000 }] }), { params: getJaar(2026), jaar: 2026 })
    expect(r.egalisatiereserves[0].standEind).toBe(10000)
    expect(r.correctieReserves).toBe(-2000)
  })

  it('KE2: pand verkocht met stand 8.000: vrijval 8.000', () => {
    const r = reken(2026, ond({ egalisatiereserves: [{ id: 'eg-1', omschrijving: 'Groot onderhoud pand', standBegin: 8000, vervallen: true }] }))
    expect(r.egalisatiereserves![0].vrijval).toBe(8000)
    expect(r.egalisatiereserves![0].standEind).toBe(0)
    expect(r.correctieReserves).toBe(8000)
  })

  it('zonder reserves verandert er niets aan de uitkomst', () => {
    const r = reken(2026, ond())
    expect(r.herinvesteringsreserves).toBeUndefined()
    expect(r.egalisatiereserves).toBeUndefined()
    expect(r.correctieReserves).toBeUndefined()
    expect(r.winst).toBe(60000)
  })

  it('schrijft Nederlands zonder em-dashes of pijlen', () => {
    const r = reken(2027, ond({ herinvesteringsreserves: [bus({ standBegin: 12000, voornemen: false })], egalisatiereserves: [{ id: 'eg-1', omschrijving: 'x', standBegin: 100, onttrekking: 200 }] }))
    const tekst = [...r.uitleg.flatMap((u) => [u.label, u.formule ?? '']), ...r.waarschuwingen.map((w) => w.tekst)].join('\n')
    expect(tekst).not.toMatch(/[—→]/)
  })
})
