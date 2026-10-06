/**
 * Ronde 1 van begin tot eind: een dossier 2025 met een onderneming, investeringen met KIA, een verlies uit 2024 en
 * een oudedagsreserve van 17.460, daarna een nieuw jaar 2026 en 'opnieuw overnemen'.
 *
 * Wat hier samenkomt:
 *  - G01: geen verplichte FOR-afname zonder grond, ook niet als de FOR hoger is dan het ondernemingsvermogen;
 *  - G04: verlies, FOR-stand, urencriterium en activa rollen door; opnieuw overnemen is idempotent;
 *  - G02/G08: een investering van vorig jaar wordt een bedrijfsmiddel met boekwaarde en genoten KIA; een verkoop
 *    geeft boekwinst en, boven de drempel, de desinvesteringsbijtelling;
 *  - G07: de vrijwillige afname van de FOR telt niet mee in het premiegrondslag-inkomen.
 *
 * En uit de herstelronde na de review van ronde 1:
 *  - alleen een register met 'alle bedrijfsmiddelen staan erin' (activaVolledig) vervangt de geboekte afschrijving;
 *    een register dat de doorrol alleen uit investeringen maakt, is dat niet vanzelf;
 *  - een doorgerold middel dat de gebruiker verwijdert, komt bij opnieuw overnemen en in het jaar erna niet terug;
 *  - de premie voor omzetting van de FOR is ten hoogste de vrijwillige afname, en de vrijwillige afname ten hoogste
 *    de afgetrokken lijfrentepremies (art. 3.70 lid 1 onder a, art. 3.128 tekst 2022);
 *  - het urencriterium geldt per persoon: twee ondernemingen die het samen halen, geven geen verplichte FOR-afname en
 *    rollen 'gehaald' door naar het volgende jaar.
 *
 * Alle bedragen die uit de parameters volgen (KIA-percentage, drempel, maximaal percentage afschrijving) komen uit
 * de jaarmodules, zodat de test niet breekt op een parameterwijziging die de rekenregels niet raakt.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import type { ActiefInvoer, HuishoudenInvoer, HuishoudenResultaat, OndernemingInvoer } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { zetActiva } from '@/components/dossier/secties/activaregister'
import { doorrolWijzigingen, saldiOpnieuwOvernemen } from '../doorrol'
import { nieuwJaarUitVorig } from '../nieuw-jaar'
import { valideerInvoer } from '../valideer'

const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const reken = (i: HuishoudenInvoer): HuishoudenResultaat => berekenHuishouden(i, { zonderMarginaleDruk: true })

const p25 = getJaar(2025).ondernemer.waarde
const p26 = getJaar(2026).ondernemer.waarde
const KIA_PCT = p25.kia.pct
const MAX_PCT = p26.afschrijving.maxPctPerJaar

const FOR_STAND = 17460
const VRIJWILLIG = 3000
const VERLIES_2024 = 80000

/**
 * `omzetting`: de vrijwillige afname van de FOR is ten hoogste de afgetrokken lijfrentepremie (art. 3.70 lid 1 onder
 * a), dus de afname wordt in dit dossier omgezet in een lijfrente.
 */
function dossier2025(extra: Partial<OndernemingInvoer> = {}, omzetting = VRIJWILLIG): HuishoudenInvoer {
  return {
    jaar: 2025,
    personen: [
      {
        id: 'A',
        naam: 'Sanne',
        geboortedatum: '1988-03-01',
        loon: [],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, forOmzetting: omzetting },
        verliezen: [{ jaar: 2024, bedrag: VERLIES_2024 }],
        ondernemingen: [
          {
            naam: 'Webbureau',
            startjaar: 2015,
            winstberekening: { soort: 'saldo', saldo: 60000 },
            uren: { onderneming: 0, urencriteriumGehaald: true },
            investeringen: [
              { omschrijving: 'Laptop', datum: '2025-07-15', bedrag: 2000, regeling: 'kia' },
              { omschrijving: 'Camera', datum: '2025-03-01', bedrag: 4000, regeling: 'kia' },
            ],
            for: { stand: FOR_STAND, ondernemingsvermogenEinde: 60000, vrijwilligeAfname: VRIJWILLIG },
            ...extra,
          },
        ],
      },
    ],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  }
}

/**
 * 2026 zoals de gebruiker het na het aanmaken invult: winst uitgesplitst, met de afschrijving zoals geboekt. De laptop
 * en de camera zijn de enige bedrijfsmiddelen, dus met `volledig` geeft de gebruiker aan dat alles in het register staat.
 */
function vul2026(n: HuishoudenInvoer, verkopen: Record<string, { datum: string; verkoopprijs: number }>, volledig = true): HuishoudenInvoer {
  const uit = kloon(n)
  const o = uit.personen[0].ondernemingen[0]
  o.winstberekening = { soort: 'uitgesplitst', omzet: 90000, kosten: 25000, afschrijvingen: 1500 }
  if (volledig) o.activaVolledig = true
  for (const a of o.activa ?? []) {
    const v = verkopen[a.omschrijving]
    if (v) a.verkocht = v
  }
  return uit
}

const actief = (i: HuishoudenInvoer, naam: string): ActiefInvoer => {
  const a = i.personen[0].ondernemingen[0].activa?.find((x) => x.omschrijving === naam)
  if (!a) throw new Error(`${naam} staat niet in het register`)
  return a
}

describe('ronde 1: van 2025 naar 2026', () => {
  const vorig = dossier2025()
  const r25 = reken(vorig)
  const p25r = r25.personen[0]
  const o25 = p25r.ondernemingen[0]
  const nieuw = nieuwJaarUitVorig(vorig, 2026, r25)

  it('2025: KIA over beide investeringen, deels verrekend verlies en geen verplichte FOR-afname', () => {
    expect(valideerInvoer(vorig)).toEqual([])
    expect(o25.kia).toBe(Math.round(KIA_PCT * 6000))
    expect(o25.investeringsaftrekPerMiddel?.map((m) => m.genotenPct)).toEqual([KIA_PCT, KIA_PCT])
    // Urencriterium gehaald, geen staking, geen AOW: de FOR neemt alleen vrijwillig af.
    expect(o25.verplichteForAfname).toBe(0)
    expect(o25.forStandEind).toBe(FOR_STAND - VRIJWILLIG)
    expect(p25r.verliesverrekening).toBeGreaterThan(0)
    expect(p25r.verliesverrekening).toBeLessThan(VERLIES_2024)
  })

  it('2025: ook met een ondernemingsvermogen onder de FOR geen verplichte afname zolang er geen grond is (G01)', () => {
    const laag = reken(dossier2025({ for: { stand: FOR_STAND, ondernemingsvermogenEinde: 10000 } })).personen[0].ondernemingen[0]
    expect(laag.verplichteForAfname).toBe(0)
    expect(laag.forStandEind).toBe(FOR_STAND)
    expect(laag.waarschuwingen.some((w) => w.id.endsWith('.for.bovenOndernemingsvermogen') && w.ernst === 'info')).toBe(true)
  })

  it('2026: de investeringen staan als bedrijfsmiddel met genoten KIA, nog te bevestigen en zonder boekwaarde begin', () => {
    expect(valideerInvoer(nieuw)).toEqual([])
    const o = nieuw.personen[0].ondernemingen[0]
    expect(o.investeringen).toBeUndefined()
    // In 2025 was er geen register, dus het register van 2026 is niet vanzelf volledig.
    expect(o.activaVolledig).toBeUndefined()
    const laptop = actief(nieuw, 'Laptop')
    expect(laptop).toMatchObject({
      aanschafdatum: '2025-07-15',
      aanschafwaarde: 2000,
      restwaarde: 0,
      levensduurJaren: Math.ceil(1 / MAX_PCT),
      methode: 'lineair',
      bron: 'investering',
      herkomst: 'inv:2025:0',
      investeringsaftrek: { regeling: 'kia', jaar: 2025, genotenPct: KIA_PCT },
    })
    expect(laptop.boekwaardeBegin).toBeUndefined()
    const meldingen = saldiOpnieuwOvernemen(nieuw, vorig, r25).meldingen.join('\n')
    expect(meldingen).toContain('Webbureau: controleer de levensduur en restwaarde van Laptop en Camera.')
    expect(meldingen).toContain('Webbureau: vul bij Laptop en Camera de fiscale boekwaarde op 1 januari 2026 in.')
    expect(meldingen).not.toMatch(/[—→]/)
    expect(actief(nieuw, 'Camera').investeringsaftrek?.genotenPct).toBe(KIA_PCT)

    const r26 = reken(nieuw)
    const regels = r26.personen[0].ondernemingen[0].afschrijvingen ?? []
    const l = regels.find((x) => x.omschrijving === 'Laptop')!
    // 2025: 2.000 × 20% × 6/12 (juli tot en met december) = 200; 2026: 400.
    expect(l.boekwaardeBegin).toBe(2000 - 2000 * MAX_PCT * (6 / 12))
    expect(l.afschrijving).toBe(2000 * MAX_PCT)
    expect(l.boekwaardeEind).toBe(l.boekwaardeBegin - l.afschrijving)
  })

  it('2026: het verlies is verminderd met wat in 2025 is verrekend, de FOR begint op de eindstand', () => {
    const p = nieuw.personen[0]
    expect(p.verliezen).toEqual([{ jaar: 2024, bedrag: VERLIES_2024 - p25r.verliesverrekening }])
    const o = p.ondernemingen[0]
    expect(o.for).toEqual({ stand: FOR_STAND - VRIJWILLIG })
    expect(o.uren.urencriteriumVorigJaar).toBe(true)

    const r26 = reken(nieuw)
    expect(r26.personen[0].ondernemingen[0].forStandBegin).toBe(FOR_STAND - VRIJWILLIG)
    expect(r26.personen[0].verliesverrekening).toBeLessThanOrEqual(VERLIES_2024 - p25r.verliesverrekening)
  })

  it('2026: de vrijwillige afname van de FOR telt niet mee in het premiegrondslag-inkomen (G07)', () => {
    expect(nieuw.personen[0].inkomensvoorziening.premiegrondslagInkomenVorigJaar).toBe(Math.round(p25r.winstUitOnderneming - VRIJWILLIG))
    const historie = nieuw.personen[0].inkomensvoorziening.historie?.find((h) => h.jaar === 2025)
    expect(historie).toBeDefined()
  })

  it('verkoop van alleen de laptop: boekwinst, maar onder de drempel geen desinvesteringsbijtelling', () => {
    const i = vul2026(nieuw, { Laptop: { datum: '2026-06-30', verkoopprijs: 1700 } })
    expect(valideerInvoer(i)).toEqual([])
    const o = reken(i).personen[0].ondernemingen[0]
    const l = o.afschrijvingen!.find((x) => x.omschrijving === 'Laptop')!
    // Begin 1.800, afschrijving januari tot en met juni 200, boekwaarde 1.600, verkoopprijs 1.700.
    expect(l.afschrijving).toBe(2000 * MAX_PCT * (6 / 12))
    expect(l.boekwinst).toBe(1700 - (l.boekwaardeBegin - l.afschrijving))
    expect(l.boekwinst).toBeGreaterThan(0)
    expect(l.verkochtDitJaar).toBe(true)
    expect(1700).toBeLessThanOrEqual(p26.desinvestering.drempel)
    expect(o.desinvesteringsbijtelling).toBe(0)
  })

  it('verkoop van laptop en camera: samen boven de drempel, dus desinvesteringsbijtelling met het genoten percentage', () => {
    const i = vul2026(nieuw, { Laptop: { datum: '2026-06-30', verkoopprijs: 1700 }, Camera: { datum: '2026-09-30', verkoopprijs: 3000 } })
    const o = reken(i).personen[0].ondernemingen[0]
    expect(1700 + 3000).toBeGreaterThan(p26.desinvestering.drempel)
    expect(o.desinvesteringsbijtelling).toBe(Math.round(KIA_PCT * 1700 + KIA_PCT * 3000))
    expect(o.afschrijvingen!.filter((x) => x.verkochtDitJaar).map((x) => x.omschrijving).sort()).toEqual(['Camera', 'Laptop'])
    // Een volledig register vervangt de geboekte afschrijving; het verschil staat apart.
    const fiscaal = o.afschrijvingen!.reduce((s, x) => s + x.afschrijving, 0)
    expect(o.correctieAfschrijving).toBe(1500 - fiscaal)
  })

  it('zonder "alles in het register" blijft de geboekte afschrijving staan; de desinvesteringsbijtelling volgt wel', () => {
    const i = vul2026(nieuw, { Laptop: { datum: '2026-06-30', verkoopprijs: 1700 }, Camera: { datum: '2026-09-30', verkoopprijs: 3000 } }, false)
    const o = reken(i).personen[0].ondernemingen[0]
    expect(o.correctieAfschrijving ?? 0).toBe(0)
    expect(o.desinvesteringsbijtelling).toBe(Math.round(KIA_PCT * 1700 + KIA_PCT * 3000))
  })

  it('opnieuw overnemen is idempotent en laat de verkoop in 2026 staan', () => {
    const huidig = vul2026(nieuw, { Laptop: { datum: '2026-06-30', verkoopprijs: 1700 } })
    const eerste = saldiOpnieuwOvernemen(huidig, vorig, r25)
    expect(eerste.wijzigingen).toEqual([])
    expect(eerste.invoer).toEqual(huidig)
    const tweede = saldiOpnieuwOvernemen(eerste.invoer, vorig, r25)
    expect(tweede.invoer).toEqual(eerste.invoer)
    expect(actief(tweede.invoer, 'Laptop').verkocht).toEqual({ datum: '2026-06-30', verkoopprijs: 1700 })
  })

  it('wijzigt 2025 later, dan neemt opnieuw overnemen alleen de saldi over; daarna is er niets meer te doen', () => {
    const huidig = vul2026(nieuw, { Laptop: { datum: '2026-06-30', verkoopprijs: 1700 } })
    const vorigAnders = dossier2025({ for: { stand: FOR_STAND, ondernemingsvermogenEinde: 60000, vrijwilligeAfname: 5000 } }, 5000)
    const rAnders = reken(vorigAnders)
    const o = saldiOpnieuwOvernemen(huidig, vorigAnders, rAnders)
    expect(o.invoer.personen[0].ondernemingen[0].for?.stand).toBe(FOR_STAND - 5000)
    expect(o.wijzigingen.some((w) => w.label === 'Oudedagsreserve begin')).toBe(true)
    // De winstberekening en de verkoop van 2026 blijven staan.
    expect(o.invoer.personen[0].ondernemingen[0].winstberekening).toEqual(huidig.personen[0].ondernemingen[0].winstberekening)
    expect(actief(o.invoer, 'Laptop').verkocht).toEqual({ datum: '2026-06-30', verkoopprijs: 1700 })
    expect(valideerInvoer(o.invoer)).toEqual([])

    const nogEens = saldiOpnieuwOvernemen(o.invoer, vorigAnders, rAnders)
    expect(nogEens.wijzigingen).toEqual([])
    expect(doorrolWijzigingen(o.invoer, nogEens.invoer)).toEqual([])
  })

  it('2027: een in 2026 verkocht bedrijfsmiddel valt uit het register, de rest rolt door met de fiscale boekwaarde', () => {
    const i26 = vul2026(nieuw, { Laptop: { datum: '2026-06-30', verkoopprijs: 1700 } })
    const r26 = reken(i26)
    const n27 = nieuwJaarUitVorig(i26, 2027, r26)
    const o27 = n27.personen[0].ondernemingen[0]
    const activa = o27.activa ?? []
    expect(activa.map((a) => a.omschrijving)).toEqual(['Camera'])
    const camera26 = r26.personen[0].ondernemingen[0].afschrijvingen!.find((x) => x.omschrijving === 'Camera')!
    expect(activa[0].boekwaardeBegin).toBe(camera26.boekwaardeEind)
    expect(activa[0].investeringsaftrek).toEqual({ regeling: 'kia', jaar: 2025, genotenPct: KIA_PCT })
    expect(activa[0].herkomst).toBe('inv:2025:1')
    expect(o27.activaVolledig).toBe(true)
    expect(valideerInvoer(n27)).toEqual([])
  })

  it('2027: telde het register in 2026 niet mee, dan rolt de boekwaarde niet door', () => {
    const i26 = vul2026(nieuw, { Laptop: { datum: '2026-06-30', verkoopprijs: 1700 } }, false)
    const r26 = reken(i26)
    const n27 = nieuwJaarUitVorig(i26, 2027, r26)
    const o27 = n27.personen[0].ondernemingen[0]
    expect(o27.activa?.map((a) => [a.omschrijving, a.boekwaardeBegin])).toEqual([['Camera', undefined]])
    expect(o27.activaVolledig).toBeUndefined()
  })
})

/** Alle melding-id's van een persoon: persoon, inkomensvoorziening en ondernemingen. */
const meldingIds = (r: HuishoudenResultaat): string[] => {
  const p = r.personen[0]
  return [...(p.waarschuwingen ?? []), ...(p.inkomensvoorziening.waarschuwingen ?? []), ...p.ondernemingen.flatMap((o) => o.waarschuwingen)].map((w) => w.id)
}

describe('ronde 1, herstel: verwijderen, omzetting en urencriterium per persoon', () => {
  const vorig = dossier2025()
  const r25 = reken(vorig)
  const nieuw = nieuwJaarUitVorig(vorig, 2026, r25)

  it('een doorgerold middel dat je verwijdert, komt bij opnieuw overnemen niet terug, ook niet als 2025 wijzigt of in 2027', () => {
    const i26 = vul2026(nieuw, {})
    const o = i26.personen[0].ondernemingen[0]
    const laptop = actief(i26, 'Laptop')
    // Zoals het scherm het doet: de lijst zonder de laptop, en de herkomst onthouden.
    zetActiva(o, (o.activa ?? []).filter((a) => a !== laptop))
    expect(o.doorrolUitgesloten).toEqual(['inv:2025:0'])
    expect(valideerInvoer(i26)).toEqual([])

    const opnieuw = saldiOpnieuwOvernemen(i26, vorig, r25)
    expect(opnieuw.invoer.personen[0].ondernemingen[0].activa?.map((a) => a.omschrijving)).toEqual(['Camera'])
    expect(opnieuw.wijzigingen).toEqual([])

    // 2025 wijzigt (meer winst en een andere afname) en de gebruiker neemt nog eens over: de laptop blijft weg.
    const vorigAnders = dossier2025({ winstberekening: { soort: 'saldo', saldo: 65000 } })
    const anders = saldiOpnieuwOvernemen(opnieuw.invoer, vorigAnders, reken(vorigAnders))
    expect(anders.invoer.personen[0].ondernemingen[0].activa?.map((a) => a.omschrijving)).toEqual(['Camera'])
    expect(anders.wijzigingen.some((w) => w.label.includes('Laptop'))).toBe(false)
    expect(anders.wijzigingen.some((w) => w.label.startsWith('Premiegrondslag-inkomen'))).toBe(true)

    // Het register telt mee (alle bedrijfsmiddelen staan erin): alleen de camera wordt afgeschreven.
    const r26 = reken(anders.invoer)
    const o26 = r26.personen[0].ondernemingen[0]
    expect(o26.activaregisterTeltMee).toBe(true)
    expect(o26.afschrijvingen?.map((x) => x.omschrijving)).toEqual(['Camera'])

    // 2027: de laptop staat niet in het register van 2026, dus hij komt ook niet terug; de uitsluiting rolt niet mee.
    const n27 = nieuwJaarUitVorig(anders.invoer, 2027, r26)
    const o27 = n27.personen[0].ondernemingen[0]
    expect(o27.activa?.map((a) => a.omschrijving)).toEqual(['Camera'])
    expect(o27.doorrolUitgesloten).toBeUndefined()
    expect(o27.activaVolledig).toBe(true)
  })

  it('"Uitsluiting opheffen": haal je de herkomst uit de uitsluiting, dan komt het middel bij opnieuw overnemen terug', () => {
    const i26 = vul2026(nieuw, {})
    const o = i26.personen[0].ondernemingen[0]
    zetActiva(o, (o.activa ?? []).filter((a) => a.omschrijving !== 'Laptop'))
    delete o.doorrolUitgesloten
    const terug = saldiOpnieuwOvernemen(i26, vorig, r25)
    expect(terug.invoer.personen[0].ondernemingen[0].activa?.map((a) => a.omschrijving).sort()).toEqual(['Camera', 'Laptop'])
    expect(terug.wijzigingen.some((w) => w.label === 'Bedrijfsmiddel Laptop' && w.oud === 'niet in de lijst')).toBe(true)
  })

  it('omzetting van de FOR is begrensd door de vrijwillige afname, en de vrijwillige afname door de afgetrokken premie', () => {
    const stand = FOR_STAND - VRIJWILLIG
    const metFor = (vrijwillig: number, omzetting: number, lijfrente = 0): HuishoudenInvoer => {
      const i = vul2026(nieuw, {})
      const p = i.personen[0]
      p.inkomensvoorziening = { ...p.inkomensvoorziening, lijfrentePremies: lijfrente, forOmzetting: omzetting }
      p.ondernemingen[0].for = { ...(p.ondernemingen[0].for ?? { stand }), vrijwilligeAfname: vrijwillig }
      return i
    }

    // Omzettingspremie 5.000 bij een vrijwillige afname van 2.000: 2.000 aftrekbaar bovenop de ruimte.
    const a = reken(metFor(2000, 5000))
    const pa = a.personen[0]
    expect(pa.inkomensvoorziening.forOmzettingAftrek).toBe(2000)
    expect(pa.ondernemingen[0].forVrijwilligeAfname).toBe(2000)
    expect(pa.ondernemingen[0].forStandEind).toBe(stand - 2000)
    expect(meldingIds(a)).toContain('lijfrente.forOmzettingBovenAfname')

    // Vrijwillige afname 5.000 met maar 2.000 omzettingspremie: de afname is 2.000, met een let-op.
    const b = reken(metFor(5000, 2000))
    const pb = b.personen[0]
    expect(pb.ondernemingen[0].forVrijwilligeAfname).toBe(2000)
    expect(pb.inkomensvoorziening.forOmzettingAftrek).toBe(2000)
    expect(pb.ondernemingen[0].forStandEind).toBe(stand - 2000)
    expect(meldingIds(b).some((id) => id.endsWith('.for.vrijwilligBegrensd'))).toBe(true)

    // Gelijk aan elkaar: precies die afname, geen let-op over de begrenzing.
    const c = reken(metFor(3000, 3000))
    expect(c.personen[0].ondernemingen[0].forVrijwilligeAfname).toBe(3000)
    expect(c.personen[0].inkomensvoorziening.forOmzettingAftrek).toBe(3000)
    expect(meldingIds(c).some((id) => id.endsWith('.for.vrijwilligBegrensd') || id === 'lijfrente.forOmzettingBovenAfname')).toBe(false)

    // Zonder premie geen afname: de winst is dan gelijk aan die zonder vrijwillige afname.
    const d = reken(metFor(3000, 0))
    const zonder = reken(metFor(0, 0))
    expect(d.personen[0].ondernemingen[0].forVrijwilligeAfname ?? 0).toBe(0)
    expect(d.personen[0].winstUitOnderneming).toBe(zonder.personen[0].winstUitOnderneming)
  })

  it('twee ondernemingen van één persoon halen samen het urencriterium: geen verplichte FOR-afname, en gehaald rolt door', () => {
    const tweeZaken = (jaar: number, urenPerZaak: number, vorigJaarGehaald?: boolean): HuishoudenInvoer => {
      const i = dossier2025()
      i.jaar = jaar
      const p = i.personen[0]
      delete p.verliezen
      p.inkomensvoorziening = { lijfrentePremies: 0, aovPremies: 0 }
      const uren = { onderneming: urenPerZaak, ...(vorigJaarGehaald !== undefined ? { urencriteriumVorigJaar: vorigJaarGehaald } : {}) }
      p.ondernemingen = [
        {
          naam: 'Webbureau',
          startjaar: 2015,
          winstberekening: { soort: 'saldo', saldo: 40000 },
          uren,
          // FOR boven het ondernemingsvermogen: bij twee jaar zonder urencriterium zou het meerdere verplicht afnemen.
          for: { stand: FOR_STAND, ondernemingsvermogenEinde: 5000 },
        },
        { naam: 'Fotografie', startjaar: 2018, winstberekening: { soort: 'saldo', saldo: 20000 }, uren: { ...uren } },
      ]
      return i
    }

    // 2025: elk 800 uur, samen 1.600; vorig jaar niet gehaald.
    const i25 = tweeZaken(2025, 800, false)
    expect(valideerInvoer(i25)).toEqual([])
    const r = reken(i25)
    const p = r.personen[0]
    expect(p.urencriteriumGehaald).toBe(true)
    expect(p.ondernemersaftrek.zelfstandigenaftrek).toBeGreaterThan(0)
    expect(p.ondernemingen.map((o) => o.urencriteriumGehaald)).toEqual([true, true])
    expect(p.ondernemingen[0].verplichteForAfname).toBe(0)
    expect(p.ondernemingen[0].forStandEind).toBe(FOR_STAND)

    // Ter vergelijking: samen maar 2 × 400 uur en vorig jaar niet gehaald, dan neemt het meerdere boven het
    // ondernemingsvermogen wel verplicht af.
    const laag = reken(tweeZaken(2025, 400, false)).personen[0]
    expect(laag.urencriteriumGehaald).toBe(false)
    expect(laag.ondernemingen[0].verplichteForAfname).toBe(FOR_STAND - 5000)

    // 2026: beide ondernemingen krijgen 'urencriterium 2025 gehaald'. Haalt de persoon het in 2026 niet (2 × 400
    // uur), dan is dat pas één jaar zonder, dus nog geen verplichte afname.
    const n26 = nieuwJaarUitVorig(i25, 2026, r)
    expect(n26.personen[0].ondernemingen.map((o) => o.uren.urencriteriumVorigJaar)).toEqual([true, true])
    const i26 = kloon(n26)
    // Een nieuw jaar begint met 'urencriterium gehaald: ja'; hier leidt de gebruiker het af uit zijn uren.
    for (const o of i26.personen[0].ondernemingen) {
      o.uren = { ...o.uren, onderneming: 400 }
      delete o.uren.urencriteriumGehaald
    }
    i26.personen[0].ondernemingen[0].for = { stand: FOR_STAND, ondernemingsvermogenEinde: 5000 }
    const p26r = reken(i26).personen[0]
    expect(p26r.urencriteriumGehaald).toBe(false)
    expect(p26r.ondernemingen[0].verplichteForAfname).toBe(0)
    expect(meldingIds(reken(i26)).filter((id) => id.endsWith('.for.urencriteriumVorigJaar'))).toEqual([])
  })
})
