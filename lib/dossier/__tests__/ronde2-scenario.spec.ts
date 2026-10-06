/**
 * Ronde 2 van begin tot eind (ontwerp-ronde2.md 14.3 en 14.9): één huishouden met de nieuwe regelingen samen, door de
 * echte engine, de doorrol, de controles, de invulhulp en de controles in het rapport.
 *
 *  - 2025: Persoon A verkoopt de bestelbus en vormt een herinvesteringsreserve (HIR), betaalt partner B 6.000 voor
 *    meewerken (niet in de kosten), rijdt een youngtimer met btw-correctie buiten de autokosten, en heeft beleggingen
 *    met bronbelasting uit Zwitserland en Japan. Persoon B heeft een verlies uit aanmerkelijk belang.
 *  - Kapitaalsvergelijking: de balans (uit de boekhouding) sluit op het saldo, ook al vallen de HIR-dotatie, de
 *    btw-correctie en de partnerbeloning buiten het saldo; een fiscaal rapport met de HIR-dotatie in het saldo sluit ook.
 *  - 2026 (nieuw jaar uit 2025): de reserve wordt afgeboekt op een nieuwe bus, het box 2-verlies rolt door en wordt
 *    verrekend, de bronbelasting die niet verrekend kon worden schuift door, en de partners kopen een nieuwe woning
 *    vóór de verkoop van de oude (EW7: eigenwoningreserve); in 2027 rollen de reserve en (na eerst verkopen, EW2) de
 *    splitsing van de lening met de box 3-schuld door.
 *  - Export: met een open fout een CONCEPT in een conceptjaar; bij Ingediend geen CONCEPT, wel "Ingediend, met 1 open
 *    controle".
 *
 * Bedragen die uit de parameters volgen, komen uit de engine of de jaarmodules, zodat de test niet breekt op een
 * parameterwijziging die de samenhang niet raakt. Geen persoonsgegevens: Persoon A, Persoon B, Ontwerpstudio, Acme BV.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import { getJaar } from '@/lib/tax/years'
import type { HuishoudenInvoer, HuishoudenResultaat, OndernemingInvoer } from '@/lib/tax/types'
import { controleContext, controleer, controleerAlles } from '@/lib/controles'
import { rapportControles, controlesKop } from '@/lib/rapport/controles'
import { alleVelden, bouwInvulhulp } from '@/lib/invulhulp/opbouw'
import type { DossierStatus } from '../status'
import { nieuwJaarUitVorig } from '../nieuw-jaar'
import { valideerInvoer } from '../valideer'

const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const reken = (i: HuishoudenInvoer): HuishoudenResultaat => berekenHuishouden(i, { zonderMarginaleDruk: true })
const VANDAAG = '2026-10-05'

const SALDO = 60000
const BELONING = 6000

function ontwerpstudio(x: Partial<OndernemingInvoer> = {}): OndernemingInvoer {
  return {
    id: 'ond-1',
    naam: 'Ontwerpstudio',
    winstBron: 'boekhouding',
    winstberekening: { soort: 'saldo', saldo: SALDO },
    uren: { onderneming: 1600, urencriteriumGehaald: true },
    startjaar: 2015,
    for: { stand: 12000 },
    activa: [
      {
        omschrijving: 'Bestelbus',
        aanschafdatum: '2021-03-01',
        aanschafwaarde: 28000,
        restwaarde: 4000,
        levensduurJaren: 5,
        methode: 'lineair',
        boekwaardeBegin: 13600,
        herkomst: 'act:2024:0',
        investeringsaftrek: { regeling: 'kia', jaar: 2021, genotenPct: 0 },
        verkocht: { datum: '2025-06-30', verkoopprijs: 20000 },
      },
    ],
    herinvesteringsreserves: [
      {
        id: 'hir-2025-1',
        ontstaanJaar: 2025,
        // De boekwinst op de bus: boekwaarde 13.600 min een half jaar afschrijving 2.400 is 11.200; verkocht voor 20.000.
        bedragOntstaan: 8800,
        standBegin: 0,
        herkomst: { omschrijving: 'Bestelbus', actiefHerkomst: 'act:2024:0', opbrengst: 20000, boekwaardeOud: 11200, langlopend: false },
        voornemen: true,
      },
    ],
    samenwerkingMetPartner: 'arbeidsbeloning',
    meewerkendePartner: { uren: 600, vergoeding: BELONING, vergoedingInKosten: false },
    auto: {
      cataloguswaarde: 40000,
      datumEersteToelating: '2008-04-15',
      nulEmissie: false,
      dagwaarde: 8000,
      autokosten: 9000,
      terBeschikkingSinds: '2024-03-01',
      btw: { aftrekBijAanschaf: false, methode: 'forfait', btwOpKosten: 600, inAutokosten: false },
    },
    // Balans uit de boekhouding: vermogen 20.000 begin, 25.000 eind, privé-opnamen 55.000: winst 60.000 = het saldo.
    jaarrekening: {
      begin: { materieleVasteActiva: 5000, voorraden: 1000, handelsdebiteuren: 4000, overigeVorderingen: 1000, liquideMiddelen: 15000, crediteuren: 4000, omzetbelasting: 2000 },
      eind: { materieleVasteActiva: 6000, voorraden: 1000, handelsdebiteuren: 5000, overigeVorderingen: 1000, liquideMiddelen: 18000, crediteuren: 4000, omzetbelasting: 2000 },
      onttrekkingen: [{ omschrijving: 'Privé-opnamen', bedrag: 55000 }],
    },
    ...x,
  }
}

function dossier2025(): HuishoudenInvoer {
  return {
    jaar: 2025,
    personen: [
      {
        id: 'A',
        naam: 'Persoon A',
        geboortedatum: '1985-04-01',
        loon: [],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
        ondernemingen: [ontwerpstudio()],
      },
      {
        id: 'B',
        naam: 'Persoon B',
        geboortedatum: '1987-06-01',
        ondernemingen: [],
        loon: [{ id: 'loon-1', omschrijving: 'Acme BV', soort: 'loon', bruto: 40000, ingehoudenLoonheffing: 8000 }],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
      },
    ],
    fiscaalPartner: true,
    kinderen: [],
    box3: {
      posities: [
        {
          id: 'degiro',
          omschrijving: 'Beleggingsrekening',
          categorie: 'beleggingen',
          eigenaar: 'A',
          waardeBegin: 60000,
          waardeEind: 64000,
          bronbelastingen: [
            { id: 'bb-ch', land: 'CH', soort: 'dividend', brutoInkomsten: 2000, bedrag: 700 },
            { id: 'bb-jp', land: 'JP', soort: 'dividend', brutoInkomsten: 1000, bedrag: 153.15 },
          ],
        },
      ],
      schulden: [],
    },
    box2: [{ id: 'ab-1', eigenaar: 'B', dividend: 0, ingehoudenDividendbelasting: 0, vervreemdingsvoordeel: -10000 }],
    verdeling: 'optimaal',
  }
}

function ctx(i: HuishoudenInvoer, r: HuishoudenResultaat | null, status: DossierStatus = 'concept', ingediend: { op: string; gewijzigdNa: boolean } | null = null) {
  return controleContext({ jaar: i.jaar, invoer: i, resultaat: r, params: getJaar(i.jaar), status, vandaag: VANDAAG, staat: null, ingediend, vorig: null })
}

describe('ronde 2, scenario 2025: HIR, partnerbeloning, youngtimer, bronbelasting CH en JP, box 2-verlies', () => {
  const i = dossier2025()
  const r = reken(i)
  const a = r.personen.find((p) => p.id === 'A')!
  const b = r.personen.find((p) => p.id === 'B')!
  const o = a.ondernemingen[0]

  it('de invoer is geldig', () => {
    expect(valideerInvoer(i)).toEqual([])
  })

  it('HIR: de boekwinst op de bus gaat in de reserve en is buiten het saldo van de winst af', () => {
    const hir = o.herinvesteringsreserves?.[0]
    expect(hir?.dotatie).toBeGreaterThan(0)
    expect(hir?.standEind).toBe(hir?.dotatie)
    expect(o.correctieReserves).toBe(-hir!.dotatie)
  })

  it('partnerbeloning: A 6.000 lager, B overig werk 6.000', () => {
    expect(o.correctiePartner).toBe(-BELONING)
    expect(b.overigWerk).toBe(BELONING)
    expect(b.overigWerkDetail?.arbeidsbeloningPartner).toBe(BELONING)
  })

  it('bronbelasting: per land met het verdragstarief; Zwitserland 15% van 2.000, Japan wat is ingehouden', () => {
    const landen = (r.box3.bronbelastingPerLand ?? []).map((l) => l.land).sort()
    expect(landen).toEqual(['CH', 'JP'])
    const ch = r.box3.bronbelastingPerLand!.find((l) => l.land === 'CH')!
    expect(ch.verrekenbaar).toBeCloseTo(300, 2)
    expect(ch.terugTeVragen).toBeCloseTo(400, 2)
    const totaal = (a.bronbelasting?.verrekend ?? 0) + (b.bronbelasting?.verrekend ?? 0) + (a.bronbelasting?.naarVolgendJaar ?? 0) + (b.bronbelasting?.naarVolgendJaar ?? 0)
    expect(totaal).toBeGreaterThan(0)
  })

  it('box 2-verlies van B: 10.000, verdeeld over de partners (gemeenschappelijk inkomen), blijft openstaan', () => {
    const som = (f: (p: HuishoudenResultaat['personen'][number]) => number) => r.personen.reduce((t, p) => t + f(p), 0)
    expect(som((p) => p.box2Verlies?.verliesDitJaar ?? 0)).toBe(10000)
    const open = som((p) => (p.box2Verlies?.resterend ?? []).reduce((t, x) => t + x.bedrag, 0) + (p.box2Verlies?.terugwenteling?.bedrag ?? 0))
    expect(open).toBe(10000)
  })

  it('kapitaalsvergelijking: HIR-dotatie, btw-correctie en partnerbeloning buiten het saldo geven samen geen fout', () => {
    const u = controleer(ctx(i, r))
    expect(u.alle.filter((c) => c.regel === 'kapitaalsvergelijking')).toEqual([])
  })

  it('fiscaal rapport met de HIR-dotatie in het saldo: geen fout en dezelfde fiscale winst', () => {
    const dotatie = o.herinvesteringsreserves![0].dotatie
    const f = kloon(i)
    const of = f.personen[0].ondernemingen[0]
    of.winstBron = 'fiscaal-rapport'
    of.winstberekening = { soort: 'saldo', saldo: SALDO - dotatie }
    const rf = reken(f)
    expect(controleer(ctx(f, rf)).alle.filter((c) => c.regel === 'kapitaalsvergelijking')).toEqual([])
    expect(rf.personen[0].winstUitOnderneming).toBe(a.winstUitOnderneming)
  })

  it('een echt verschil in de balans is wel een fout, met de reserves in de uitleg', () => {
    const f = kloon(i)
    f.personen[0].ondernemingen[0].winstberekening = { soort: 'saldo', saldo: SALDO - 300 }
    const [c] = controleer(ctx(f, reken(f))).open.filter((x) => x.regel === 'kapitaalsvergelijking')
    expect(c).toMatchObject({ ernst: 'fout', vingerafdruk: 'verschil=300' })
  })

  it('invulhulp: de toevoeging aan de HIR en de bronbelasting staan in de aangifte', () => {
    const opbouw = bouwInvulhulp({ jaar: 2025, invoer: i, resultaat: r, params: getJaar(2025) })
    const velden = alleVelden(opbouw).map((x) => x.veld)
    const toevoeging = velden.find((v) => v.id === 'wtoerestoevheraang')
    expect(toevoeging?.waarde).toEqual({ soort: 'bedrag', bedrag: o.herinvesteringsreserves![0].dotatie })
    expect(velden.some((v) => v.sleutel.includes('bronbelasting') || v.label.toLowerCase().includes('bronbelasting'))).toBe(true)
    // Elke sleutel is uniek (de aangiftestaat bewaart vinkjes op de sleutel).
    expect(new Set(velden.map((v) => v.sleutel)).size).toBe(velden.length)
  })
})

describe('ronde 2, scenario 2026 en 2027: afboeking, doorrol box 2-verlies en bronbelasting, eigenwoningreserve (EW7)', () => {
  const v25 = dossier2025()
  const r25 = reken(v25)
  const dotatie = r25.personen[0].ondernemingen[0].herinvesteringsreserves![0].dotatie
  const naar26 = nieuwJaarUitVorig(v25, 2026, r25)

  function dossier2026(): HuishoudenInvoer {
    const i = kloon(naar26)
    const o = i.personen[0].ondernemingen[0]
    o.investeringen = [{ id: 'inv-1', omschrijving: 'Elektrische bestelbus', datum: '2026-09-01', bedrag: 30000, regeling: 'kia', herinvesteringsreserve: { reserveId: 'hir-2025-1', afboeking: dotatie } }]
    // B verkoopt in 2026 aandelen met winst: het verlies uit 2025 wordt verrekend.
    i.box2 = [{ id: 'ab-1', eigenaar: 'B', dividend: 0, ingehoudenDividendbelasting: 0, vervreemdingsvoordeel: 4000 }]
    // EW7: eerst gekocht (1-3), later verkocht (1-6).
    i.eigenWoning = {
      woz: 500000,
      vorigeWoning: { leverdatum: '2026-06-01', verkoopprijs: 400000, verkoopkosten: 8000, eigenwoningschuld: 250000, aandeelA: 0.5 },
      aankoop: { leverdatum: '2026-03-01', koopsom: 490000, kostenKoper: 10000, aandeelA: 0.5 },
      leningdelen: [{ id: 'ld-1', omschrijving: 'Hypotheek nieuwe woning', hoofdsom: 450000, startdatum: '2026-03-01', aflossingsvorm: 'annuitair', rente: 9000, standEind: 446000 }],
    }
    return i
  }

  it('het nieuwe jaar neemt de reserve, het box 2-verlies en de bronbelasting over en is geldig', () => {
    const o = naar26.personen[0].ondernemingen[0]
    expect(o.herinvesteringsreserves?.[0]).toMatchObject({ id: 'hir-2025-1', standBegin: dotatie })
    expect(naar26.personen[0].ondernemingen[0].meewerkendePartner?.vergoeding).toBe(BELONING)
    const verliezen = naar26.personen.reduce((t, p) => t + (p.box2Verliezen ?? []).reduce((s, x) => s + x.bedrag, 0), 0)
    expect(verliezen).toBe(r25.personen.reduce((t, p) => t + (p.box2Verlies?.resterend ?? []).reduce((s, x) => s + x.bedrag, 0), 0))
    const naarVolgend = r25.personen.reduce((s, p) => s + (p.bronbelasting?.naarVolgendJaar ?? 0), 0)
    const voortgewenteld = naar26.personen.reduce((s, p) => s + (p.voortgewenteldeBronbelasting ?? 0), 0)
    expect(voortgewenteld).toBe(naarVolgend)
    // Bronbelasting is een jaarbedrag en gaat niet mee.
    expect(naar26.box3.posities[0].bronbelastingen ?? []).toEqual([])
    expect(valideerInvoer(naar26)).toEqual([])
  })

  it('2026: de reserve wordt afgeboekt op de nieuwe bus, het box 2-verlies verrekend, de eigenwoningreserve zonder box 3-schuld', () => {
    const i = dossier2026()
    expect(valideerInvoer(i)).toEqual([])
    const r = reken(i)
    const hir = r.personen[0].ondernemingen[0].herinvesteringsreserves![0]
    expect(hir).toMatchObject({ afboeking: dotatie, standEind: 0 })
    const verrekend = r.personen.reduce((t, p) => t + (p.box2Verlies?.verrekend ?? 0), 0)
    expect(verrekend).toBe(4000)
    expect(r.eigenWoning?.bijleenregeling).toMatchObject({ reserveVoor: 0, ander: 0 })
    expect((r.eigenWoning?.eigenwoningreserve ?? []).reduce((s, x) => s + x.bedrag, 0)).toBeGreaterThan(0)
    // Geen fout in de controles op deze samenhang (de balans van 2025 is niet meegerold; dat is een let op).
    const u = controleer(ctx(i, r))
    expect(u.open.filter((c) => c.ernst === 'fout')).toEqual([])
  })

  it('2027 na EW7: de reserve rolt door tot de vervaldatum; de hele lening blijft eigenwoningschuld', () => {
    const i26 = dossier2026()
    const r26 = reken(i26)
    const i27 = nieuwJaarUitVorig(i26, 2027, r26)
    expect(valideerInvoer(i27)).toEqual([])
    expect(i27.eigenWoning?.vorigeWoning).toBeUndefined()
    expect(i27.eigenWoning?.aankoop).toBeUndefined()
    const reserve = (i27.eigenWoning?.eigenwoningreserve ?? []).reduce((s, x) => s + x.bedrag, 0)
    expect(reserve).toBe((r26.eigenWoning?.eigenwoningreserve ?? []).reduce((s, x) => s + x.bedrag, 0))
    expect(i27.eigenWoning!.leningdelen![0].eigenwoningschuld).toBeUndefined()
    expect(i27.box3.schulden.filter((x) => x.herkomst?.bron === 'eigenwoningschuld')).toEqual([])
    // De reserve is opgebruikt: geen HIR meer in 2027.
    expect(i27.personen[0].ondernemingen[0].herinvesteringsreserves ?? []).toEqual([])
    expect(() => reken(i27)).not.toThrow()
  })

  it('2027 na eerst verkopen en dan kopen (EW2): de splitsing per leningdeel en de box 3-schuld rollen door', () => {
    const i26 = dossier2026()
    i26.eigenWoning = {
      ...i26.eigenWoning!,
      woz: 485000,
      vorigeWoning: { leverdatum: '2026-03-01', verkoopprijs: 400000, verkoopkosten: 8000, eigenwoningschuld: 250000, aandeelA: 0.5 },
      aankoop: { leverdatum: '2026-06-01', koopsom: 485000, kostenKoper: 15000, aandeelA: 0.5 },
      leningdelen: [{ id: 'ld-1', omschrijving: 'Hypotheek nieuwe woning', hoofdsom: 450000, startdatum: '2026-06-01', aflossingsvorm: 'annuitair', rente: 9000, standEind: 446000 }],
    }
    const r26 = reken(i26)
    const splitsing = r26.eigenWoning?.leningsplitsing?.find((x) => x.id === 'ld-1')
    expect(splitsing?.anderEind).toBeGreaterThan(0)
    const i27 = nieuwJaarUitVorig(i26, 2027, r26)
    expect(valideerInvoer(i27)).toEqual([])
    expect(i27.eigenWoning!.leningdelen![0].eigenwoningschuld?.begin).toBe(splitsing?.eigenwoningEind)
    const box3 = i27.box3.schulden.filter((x) => x.herkomst?.bron === 'eigenwoningschuld')
    expect(box3).toHaveLength(1)
    expect(box3[0].herkomst).toMatchObject({ jaar: 2026, sleutel: 'ld-1' })
    expect(() => reken(i27)).not.toThrow()
  })
})

describe('ronde 2, export met een open fout: CONCEPT in een concept, niet bij Ingediend (14.9)', () => {
  const i = dossier2025()
  i.personen[0].ondernemingen[0].winstberekening = { soort: 'saldo', saldo: SALDO - 300 }
  const r = reken(i)

  it('concept: CONCEPT en de lijst open fouten', () => {
    const u = controleerAlles(ctx(i, r, 'concept'))
    expect(u.exportConcept).toBe(true)
    const c = rapportControles(u)
    expect(c.concept).toBe(true)
    expect(controlesKop(c)).toMatch(/^Concept: er (staat|staan) nog \d+ (fout|fouten) open\.$/)
    expect(c.open.map((x) => x.titel)).toContain('Kapitaalsvergelijking sluit niet')
  })

  it('ingediend: geen CONCEPT, wel "Ingediend, met 1 open controle" en de lijst', () => {
    const u = controleerAlles(ctx(i, r, 'ingediend', { op: '2026-04-30T10:00:00.000Z', gewijzigdNa: false }))
    expect(u.exportConcept).toBe(false)
    const fouten = u.open.filter((c) => c.ernst === 'fout').length
    expect(u.exportIngediendOpen).toBe(fouten)
    const c = rapportControles(u)
    expect(c.concept).toBe(false)
    expect(controlesKop(c)).toBe(`Ingediend, met ${fouten} ${fouten === 1 ? 'open controle' : 'open controles'}`)
    expect(fouten).toBe(1)
  })
})
