/**
 * Herstelronde na de review van ronde 1 (bevindingen 5, 9, 10, 11, 14 en 20): doorrollen van het activaregister.
 *
 *  - 5 en 14: de fiscale boekwaarde rolt alleen door als het register vorig jaar meetelde; een middel uit een
 *    investering krijgt geen boekwaarde begin en een levensduur die de gebruiker moet bevestigen (bron 'investering').
 *  - 9: 'alle bedrijfsmiddelen in het register' (activaVolledig) volgt vorig jaar; een register uit de doorrol is niet
 *    vanzelf volledig, en een onvolledig register laat de geboekte afschrijving staan.
 *  - 10: opnieuw overnemen koppelt op de vaste herkomst, zet een verwijderd middel niet terug en maakt geen tweede
 *    middel na een aangepaste datum of een aangepast bedrag.
 *  - 11: staat een investering ook in het register, dan krijgt dat middel de genoten investeringsaftrek.
 *  - 20: de rest van een investering die nog niet in gebruik was, staat in het nieuwe jaar klaar.
 *
 * Bedragen die uit de parameters volgen (KIA, drempel, maximaal percentage) komen uit de jaarmodules.
 */
import { describe, expect, it } from 'vitest'
import { berekenHuishouden } from '@/lib/tax/engine'
import type { ActiefInvoer, HuishoudenInvoer, OndernemingInvoer } from '@/lib/tax/types'
import { getJaar } from '@/lib/tax/years'
import { registerTeltMee, saldiOpnieuwOvernemen } from '../doorrol'
import { nieuwJaarUitVorig } from '../nieuw-jaar'
import { valideerInvoer } from '../valideer'

const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const reken = (i: HuishoudenInvoer) => berekenHuishouden(i, { zonderMarginaleDruk: true })
const KIA_PCT = getJaar(2025).ondernemer.waarde.kia.pct
const MAX_PCT = getJaar(2026).ondernemer.waarde.afschrijving.maxPctPerJaar

function huishouden(jaar: number, o: Partial<OndernemingInvoer>): HuishoudenInvoer {
  return {
    jaar,
    personen: [
      {
        id: 'A',
        geboortedatum: '1988-03-01',
        loon: [],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
        ondernemingen: [{ naam: 'Zaak', winstberekening: { soort: 'uitgesplitst', omzet: 90000, kosten: 20000 }, uren: { onderneming: 1400, urencriteriumGehaald: true }, startjaar: 2015, ...o }],
      },
    ],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  }
}

const zaak = (i: HuishoudenInvoer) => i.personen[0].ondernemingen[0]
const middel = (i: HuishoudenInvoer, naam: string): ActiefInvoer => {
  const a = zaak(i).activa?.find((x) => x.omschrijving === naam)
  if (!a) throw new Error(`${naam} staat niet in het register`)
  return a
}

describe('bevinding 5: bedrijfsmiddel uit een investering van vorig jaar', () => {
  // r3-doorrol-activa.ts: bus van 30.000 op 1-1-2025 bij de investeringen, 10.000 afschrijving zoals geboekt, geen register.
  const vorig = huishouden(2025, {
    winstberekening: { soort: 'uitgesplitst', omzet: 90000, kosten: 20000, afschrijvingen: 10000 },
    investeringen: [{ omschrijving: 'Bus', datum: '2025-01-01', bedrag: 30000, regeling: 'kia' }],
  })
  const r25 = reken(vorig)
  const nieuw = nieuwJaarUitVorig(vorig, 2026, r25)

  it('geen boekwaarde begin, levensduur nog te bevestigen, en een melding', () => {
    const bus = middel(nieuw, 'Bus')
    expect(bus).toMatchObject({ bron: 'investering', herkomst: 'inv:2025:0', levensduurJaren: Math.ceil(1 / MAX_PCT), restwaarde: 0 })
    expect(bus.boekwaardeBegin).toBeUndefined()
    const meldingen = saldiOpnieuwOvernemen(nieuw, vorig, r25).meldingen.join('\n')
    expect(meldingen).toContain('controleer de levensduur en restwaarde van Bus')
    expect(meldingen).toContain('vul bij Bus de fiscale boekwaarde op 1 januari 2026 in')
  })

  it('het register telt niet vanzelf mee: de geboekte afschrijving van 2026 blijft staan, dus geen 4.000 te veel aftrek', () => {
    const i = kloon(nieuw)
    zaak(i).winstberekening = { soort: 'uitgesplitst', omzet: 90000, kosten: 20000, afschrijvingen: 5000 }
    expect(registerTeltMee(zaak(i))).toBe(false)
    const o = reken(i).personen[0].ondernemingen[0]
    expect(o.correctieAfschrijving ?? 0).toBe(0)
    expect(o.saldo).toBe(90000 - 20000 - 5000)
  })

  it('na bevestigen (bron handmatig) en een boekwaarde begin verdwijnen de meldingen', () => {
    const i = kloon(nieuw)
    const bus = middel(i, 'Bus')
    bus.bron = 'handmatig'
    bus.levensduurJaren = 8
    bus.boekwaardeBegin = 20000
    const r = saldiOpnieuwOvernemen(i, vorig, r25)
    expect(r.meldingen.join('\n')).not.toMatch(/Bus/)
    // De keuzes van de gebruiker blijven staan bij opnieuw overnemen.
    expect(middel(r.invoer, 'Bus')).toMatchObject({ bron: 'handmatig', levensduurJaren: 8, boekwaardeBegin: 20000 })
    expect(r.wijzigingen).toEqual([])
  })
})

describe('bevinding 14: de fiscale boekwaarde rolt alleen door als het register meetelde', () => {
  // r8-boekwaarde-saldo.ts: server van 6.000, de boekhouding schrijft in 3 jaar af (2.000 in het saldo).
  const server: ActiefInvoer = { omschrijving: 'Server', aanschafdatum: '2025-01-01', aanschafwaarde: 6000, restwaarde: 0, levensduurJaren: 3, methode: 'lineair' }

  it('telde het register niet mee (niet volledig), dan geen boekwaarde begin en een melding met de reden', () => {
    const vorig = huishouden(2025, { winstberekening: { soort: 'saldo', saldo: 60000, afschrijvingenInSaldo: 2000 }, activa: [server] })
    const r25 = reken(vorig)
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    expect(middel(n, 'Server').boekwaardeBegin).toBeUndefined()
    const meldingen = saldiOpnieuwOvernemen(n, vorig, r25).meldingen.join('\n')
    expect(meldingen).toContain('Zaak: vul bij Server de fiscale boekwaarde op 1 januari 2026 in.')
    expect(meldingen).toContain('Het activaregister telde in 2025 niet mee in de winst')
  })

  it('telde het register wel mee (volledig en de afschrijving in het saldo ingevuld), dan de fiscale boekwaarde', () => {
    const vorig = huishouden(2025, { winstberekening: { soort: 'saldo', saldo: 60000, afschrijvingenInSaldo: 2000 }, activa: [server], activaVolledig: true })
    const r25 = reken(vorig)
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    // Fiscaal maximaal 20% per jaar: 6.000 min 1.200.
    expect(middel(n, 'Server').boekwaardeBegin).toBe(6000 - 6000 * MAX_PCT)
    expect(zaak(n).activaVolledig).toBe(true)
    expect(saldiOpnieuwOvernemen(n, vorig, r25).meldingen.join('\n')).not.toMatch(/Server/)
  })

  it('volledig, maar bij een saldo zonder de afschrijving in het saldo telde het register niet mee', () => {
    const vorig = huishouden(2025, { winstberekening: { soort: 'saldo', saldo: 60000 }, activa: [server], activaVolledig: true })
    expect(middel(nieuwJaarUitVorig(vorig, 2026, reken(vorig)), 'Server').boekwaardeBegin).toBeUndefined()
  })

  it('een zelf ingevulde boekwaarde begin blijft staan bij opnieuw overnemen; de oude van vorig jaar gaat niet mee', () => {
    const vorig = huishouden(2025, { activa: [{ ...server, aanschafdatum: '2024-01-01', boekwaardeBegin: 4000 }] })
    const r25 = reken(vorig)
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    expect(middel(n, 'Server').boekwaardeBegin).toBeUndefined()
    middel(n, 'Server').boekwaardeBegin = 2000
    const r = saldiOpnieuwOvernemen(n, vorig, r25)
    expect(middel(r.invoer, 'Server').boekwaardeBegin).toBe(2000)
    expect(r.wijzigingen).toEqual([])
  })
})

describe('bevinding 9: alle bedrijfsmiddelen in het register', () => {
  const laptop: ActiefInvoer = { omschrijving: 'Laptop', aanschafdatum: '2024-03-01', aanschafwaarde: 2500, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' }

  it('opnieuw overnemen zet een volledig register van vorig jaar door als dit jaar nog geen antwoord heeft; een bewust nee blijft', () => {
    const vorig = huishouden(2025, { activa: [laptop], activaVolledig: true })
    const r25 = reken(vorig)
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    expect(zaak(n).activaVolledig).toBe(true)

    const leeg = kloon(n)
    delete zaak(leeg).activaVolledig
    const r = saldiOpnieuwOvernemen(leeg, vorig, r25)
    expect(zaak(r.invoer).activaVolledig).toBe(true)
    expect(r.wijzigingen).toContainEqual({ persoon: 'A', onderneming: 'Zaak', label: 'Alle bedrijfsmiddelen in het register', oud: 'nee', nieuw: 'ja' })

    const nee = kloon(n)
    zaak(nee).activaVolledig = false
    expect(zaak(saldiOpnieuwOvernemen(nee, vorig, r25).invoer).activaVolledig).toBe(false)
  })

  it('een register dat de doorrol alleen uit investeringen maakt, is niet volledig', () => {
    const vorig = huishouden(2025, { investeringen: [{ omschrijving: 'Camera', datum: '2025-03-01', bedrag: 4000, regeling: 'kia' }] })
    const n = nieuwJaarUitVorig(vorig, 2026, reken(vorig))
    expect(zaak(n).activa).toHaveLength(1)
    expect(zaak(n).activaVolledig).toBeUndefined()
    expect(registerTeltMee(zaak(n))).toBe(false)
  })

  it('registerTeltMee volgt het contract: volledig, en bij saldo de afschrijving in het saldo', () => {
    const o = (x: Partial<OndernemingInvoer>): OndernemingInvoer => ({ ...zaak(huishouden(2026, { activa: [laptop] })), ...x })
    expect(registerTeltMee(o({}))).toBe(false)
    expect(registerTeltMee(o({ activaVolledig: true }))).toBe(true)
    expect(registerTeltMee(o({ activaVolledig: true, winstberekening: { soort: 'saldo', saldo: 1 } }))).toBe(false)
    expect(registerTeltMee(o({ activaVolledig: true, winstberekening: { soort: 'saldo', saldo: 1, afschrijvingenInSaldo: 0 } }))).toBe(true)
    expect(registerTeltMee(o({ activaVolledig: true, activa: [] }))).toBe(false)
  })
})

describe('bevinding 10: opnieuw overnemen koppelt op de vaste herkomst', () => {
  // r3-opnieuw-overnemen.ts: laptop en camera uit de investeringen van 2025.
  function startpunt() {
    const vorig = huishouden(2025, {
      investeringen: [
        { omschrijving: 'Laptop', datum: '2025-07-15', bedrag: 2000, regeling: 'kia' },
        { omschrijving: 'Camera', datum: '2025-03-01', bedrag: 4000, regeling: 'kia' },
      ],
    })
    const huidig = nieuwJaarUitVorig(vorig, 2026, reken(vorig))
    return { vorig, huidig }
  }

  it('(a) een aangepaste datum en een aangepast bedrag geven geen tweede camera', () => {
    const { vorig, huidig } = startpunt()
    const camera = middel(huidig, 'Camera')
    camera.aanschafwaarde = 4150
    camera.aanschafdatum = '2025-03-10'
    // 2025 wijzigt daarna (een extra kostenpost) en de gebruiker neemt opnieuw over.
    const v2 = kloon(vorig)
    zaak(v2).winstberekening = { soort: 'uitgesplitst', omzet: 90000, kosten: 25000 }
    const { invoer, wijzigingen } = saldiOpnieuwOvernemen(huidig, v2, reken(v2))
    expect(zaak(invoer).activa!.map((a) => `${a.omschrijving} ${a.aanschafdatum} ${a.aanschafwaarde}`)).toEqual(['Laptop 2025-07-15 2000', 'Camera 2025-03-10 4150'])
    expect(wijzigingen.filter((w) => w.label.startsWith('Bedrijfsmiddel'))).toEqual([])
  })

  it('(b) een verwijderd doorgerold middel komt niet terug en de kaart toont geen afwijking', () => {
    const { vorig, huidig } = startpunt()
    const o = zaak(huidig)
    const laptop = middel(huidig, 'Laptop')
    o.activa = o.activa!.filter((a) => a !== laptop)
    o.doorrolUitgesloten = [laptop.herkomst!]
    expect(valideerInvoer(huidig)).toEqual([])
    const r = saldiOpnieuwOvernemen(huidig, vorig, reken(vorig))
    expect(zaak(r.invoer).activa!.map((a) => a.omschrijving)).toEqual(['Camera'])
    expect(r.wijzigingen).toEqual([])
    // Zonder de uitsluiting komt hij wel terug.
    delete o.doorrolUitgesloten
    expect(zaak(saldiOpnieuwOvernemen(huidig, vorig, reken(vorig)).invoer).activa!.map((a) => a.omschrijving)).toEqual(['Laptop', 'Camera'])
  })

  it('een investering die er in vorig jaar vooraan bij komt, verschuift de volgnummers maar geeft geen dubbele middelen', () => {
    const { vorig, huidig } = startpunt()
    middel(huidig, 'Laptop').levensduurJaren = 4
    const v2 = kloon(vorig)
    zaak(v2).investeringen!.unshift({ omschrijving: 'Printer', datum: '2025-02-01', bedrag: 900, regeling: 'kia' })
    const { invoer } = saldiOpnieuwOvernemen(huidig, v2, reken(v2))
    const activa = zaak(invoer).activa!
    expect(activa.map((a) => [a.omschrijving, a.herkomst])).toEqual([
      ['Printer', 'inv:2025:0'],
      ['Laptop', 'inv:2025:1'],
      ['Camera', 'inv:2025:2'],
    ])
    // De eigen levensduur van de laptop blijft.
    expect(middel(invoer, 'Laptop').levensduurJaren).toBe(4)
    // Daarna is er niets meer te doen.
    expect(saldiOpnieuwOvernemen(invoer, v2, reken(v2)).wijzigingen).toEqual([])
  })

  it('een investering die in vorig jaar is verwijderd, verdwijnt ook uit dit jaar', () => {
    const { vorig, huidig } = startpunt()
    const v2 = kloon(vorig)
    zaak(v2).investeringen = zaak(v2).investeringen!.filter((x) => x.omschrijving !== 'Camera')
    const { invoer, wijzigingen } = saldiOpnieuwOvernemen(huidig, v2, reken(v2))
    expect(zaak(invoer).activa!.map((a) => a.omschrijving)).toEqual(['Laptop'])
    expect(wijzigingen).toContainEqual({ persoon: 'A', onderneming: 'Zaak', label: 'Bedrijfsmiddel Camera', oud: 'in de lijst', nieuw: 'uit de lijst' })
  })

  it('een eigen bedrijfsmiddel van dit jaar blijft altijd staan', () => {
    const { vorig, huidig } = startpunt()
    zaak(huidig).activa!.push({ omschrijving: 'Monitor', aanschafdatum: '2026-02-01', aanschafwaarde: 900, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', bron: 'handmatig' })
    const v2 = kloon(vorig)
    zaak(v2).investeringen = []
    expect(zaak(saldiOpnieuwOvernemen(huidig, v2, reken(v2)).invoer).activa!.map((a) => a.omschrijving)).toEqual(['Monitor'])
  })
})

describe('bevinding 11: een investering die ook in het register staat', () => {
  it('het registermiddel krijgt de genoten KIA, zodat een verkoop binnen vijf jaar de bijtelling geeft', () => {
    // r5-investering-en-actief.ts: camera van 4.000 in het register en bij de investeringen.
    const camera: ActiefInvoer = { omschrijving: 'Camera', aanschafdatum: '2025-03-01', aanschafwaarde: 4000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair' }
    const vorig = huishouden(2025, { activa: [camera], investeringen: [{ omschrijving: 'Camera', datum: '2025-03-01', bedrag: 4000, regeling: 'kia' }] })
    const n = nieuwJaarUitVorig(vorig, 2026, reken(vorig))
    expect(zaak(n).activa).toHaveLength(1)
    expect(middel(n, 'Camera').investeringsaftrek).toEqual({ regeling: 'kia', jaar: 2025, genotenPct: KIA_PCT })
    middel(n, 'Camera').verkocht = { datum: '2026-06-30', verkoopprijs: 3500 }
    expect(reken(n).personen[0].ondernemingen[0].desinvesteringsbijtelling).toBe(Math.round(KIA_PCT * 3500))
  })

  it('ook bij een iets ander bedrag of een andere datum in hetzelfde jaar (zelfde omschrijving) geen tweede middel', () => {
    const camera: ActiefInvoer = { omschrijving: 'Camera', aanschafdatum: '2025-03-05', aanschafwaarde: 4050, restwaarde: 0, levensduurJaren: 6, methode: 'lineair' }
    const vorig = huishouden(2025, { activa: [camera], investeringen: [{ omschrijving: 'camera ', datum: '2025-03-01', bedrag: 4000, regeling: 'kia' }] })
    const n = nieuwJaarUitVorig(vorig, 2026, reken(vorig))
    expect(zaak(n).activa!.map((a) => [a.omschrijving, a.levensduurJaren])).toEqual([['Camera', 6]])
    expect(middel(n, 'Camera').investeringsaftrek?.regeling).toBe('kia')
  })

  it('een eigen investeringsaftrek op het registermiddel blijft staan', () => {
    const camera: ActiefInvoer = {
      omschrijving: 'Camera',
      aanschafdatum: '2025-03-01',
      aanschafwaarde: 4000,
      restwaarde: 0,
      levensduurJaren: 5,
      methode: 'lineair',
      investeringsaftrek: { regeling: 'kia', jaar: 2025, genotenPct: 0.1 },
    }
    const vorig = huishouden(2025, { activa: [camera], investeringen: [{ omschrijving: 'Camera', datum: '2025-03-01', bedrag: 4000, regeling: 'kia' }] })
    expect(middel(nieuwJaarUitVorig(vorig, 2026, reken(vorig)), 'Camera').investeringsaftrek?.genotenPct).toBe(0.1)
  })
})

describe('bevinding 20: investering die eind vorig jaar nog niet in gebruik was', () => {
  // r10-stijging-ingebruik.ts, geval b: 4.000 van 10.000 betaald in 2025.
  const vorig = huishouden(2025, { investeringen: [{ omschrijving: 'Machine', datum: '2025-10-01', bedrag: 10000, betaald: 4000, inGebruik: false, regeling: 'kia' }] })
  const r25 = reken(vorig)

  it('nieuw jaar: de rest staat klaar bij de investeringen en de KIA telt alleen over de rest', () => {
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    expect(zaak(n).activa).toBeUndefined()
    expect(zaak(n).investeringen).toEqual([{ omschrijving: 'Machine', datum: '2026-01-01', bedrag: 6000, regeling: 'kia' }])
    expect(valideerInvoer(n)).toEqual([])
    const kia = reken(n).personen[0].ondernemingen[0].kia
    expect(kia).toBe(Math.round(getJaar(2026).ondernemer.waarde.kia.pct * 6000))
  })

  it('opnieuw overnemen zet de rest niet opnieuw neer, maar noemt het bedrag en het woord bedrijfsmiddelen', () => {
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    delete zaak(n).investeringen
    const r = saldiOpnieuwOvernemen(n, vorig, r25)
    expect(zaak(r.invoer).investeringen).toBeUndefined()
    const tekst = r.meldingen.join('\n')
    expect(tekst).toContain('Machine was eind 2025 nog niet in gebruik. Neem je het in 2026 in gebruik, vul dan bij de investeringen de rest in: € 6.000')
    expect(tekst).toContain('zet het dan bij de bedrijfsmiddelen met de hele aanschafwaarde van € 10.000')
    expect(tekst).not.toMatch(/[—→]/)
  })
})
