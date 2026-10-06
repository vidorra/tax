/**
 * Saldi die doorrollen naar het volgende jaar (doorrol.ts) en 'opnieuw overnemen'.
 *
 * Nagespeeld uit de gap-analyse (scratchpad/gat/nieuwjaar.ts en toets-0/g04.ts): een verlies werd in het nieuwe
 * jaar nog een keer verrekend, de FOR begon weer op de beginstand en het restant persoonsgebonden aftrek ging
 * verloren. Daarnaast: niet-benutte zelfstandigenaftrek, activa en investeringen, idempotentie en de
 * premiegrondslag voor de jaarruimte (G07).
 */
import { describe, expect, it } from 'vitest'
import { voorbeeldInvoer } from '@/lib/voorbeeld'
import { berekenHuishouden } from '@/lib/tax/engine'
import type { ActiefInvoer, HuishoudenInvoer, OndernemingInvoer } from '@/lib/tax/types'
import { berekenDoorrol, doorrolWijzigingen, forToename, pasDoorrolToe, premiegrondslagInkomen, saldiOpnieuwOvernemen } from '../doorrol'
import { nieuwJaarUitVorig } from '../nieuw-jaar'
import { valideerInvoer } from '../valideer'

const kloon = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T
const reken = (i: HuishoudenInvoer) => berekenHuishouden(i, { zonderMarginaleDruk: true })

function huishouden(jaar: number, o: Partial<OndernemingInvoer>, persoon: Partial<HuishoudenInvoer['personen'][number]> = {}): HuishoudenInvoer {
  return {
    jaar,
    personen: [
      {
        id: 'A',
        geboortedatum: '1988-03-01',
        loon: [],
        inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
        ondernemingen: [{ naam: 'zaak', winstberekening: { soort: 'saldo', saldo: 60000 }, uren: { onderneming: 1400, urencriteriumGehaald: true }, startjaar: 2015, ...o }],
        ...persoon,
      },
    ],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  }
}

/** Het voorbeeld uit scratchpad/gat/nieuwjaar.ts. */
function vorigNieuwjaar(): HuishoudenInvoer {
  // De vrijwillige afname is ten hoogste de afgetrokken lijfrentepremie (art. 3.70 lid 1 onder a): hier omgezet in een lijfrente.
  return huishouden(
    2025,
    { for: { stand: 20000, ondernemingsvermogenEinde: 15000, vrijwilligeAfname: 2000 } },
    { verliezen: [{ jaar: 2023, bedrag: 10000 }], restantPgaVorigJaar: 0, inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, forOmzetting: 2000 } },
  )
}

describe('nieuw jaar uit de uitkomst van vorig jaar (G04)', () => {
  it('een verrekend verlies wordt niet nog een keer verrekend en de FOR begint op de eindstand', () => {
    const vorig = vorigNieuwjaar()
    const r25 = reken(vorig)
    expect(r25.personen[0].verliesverrekening).toBe(10000)
    const eind = r25.personen[0].ondernemingen[0].forStandEind!
    expect(eind).toBe(18000)

    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    const p = n.personen[0]
    expect(p.verliezen).toBeUndefined()
    expect(p.ondernemingen[0].for).toEqual({ stand: 18000 })
    expect(valideerInvoer(n)).toEqual([])

    const r26 = reken(n)
    expect(r26.personen[0].verliesverrekening).toBe(0)
    expect(r26.personen[0].ondernemingen[0].forStandBegin).toBe(18000)
  })

  it('een deels verrekend verlies gaat met het restant mee, een vervallen verlies valt weg', () => {
    const vorig = huishouden(2025, { winstberekening: { soort: 'saldo', saldo: 20000 } }, { verliezen: [{ jaar: 2015, bedrag: 4000 }, { jaar: 2023, bedrag: 50000 }] })
    const r25 = reken(vorig)
    const verrekend = r25.personen[0].verliesverrekening
    expect(verrekend).toBeGreaterThan(0)
    expect(verrekend).toBeLessThan(50000)
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    // 2015 + 9 jaar = 2024: in 2025 al vervallen. Van 2023 blijft over wat niet verrekend is.
    expect(n.personen[0].verliezen).toEqual([{ jaar: 2023, bedrag: 50000 - verrekend }])
  })

  it('het restant persoonsgebonden aftrek gaat mee in plaats van te verdwijnen', () => {
    const vorig = huishouden(2025, { winstberekening: { soort: 'saldo', saldo: 1000 }, uren: { onderneming: 0, urencriteriumGehaald: false } }, { restantPgaVorigJaar: 5000 })
    const r25 = reken(vorig)
    const restant = r25.personen[0].pgaToerekening!.restant
    expect(restant).toBeGreaterThan(0)
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    expect(n.personen[0].restantPgaVorigJaar).toBe(restant)
    expect(reken(n).personen[0].pgaToerekening!.restantVorigJaar).toBe(restant)
  })

  it('niet-benutte zelfstandigenaftrek: wat verrekend is gaat eraf, wat nieuw niet benut is komt erbij', () => {
    const vol = huishouden(2025, {}, { nietBenutteZelfstandigenaftrek: [{ jaar: 2024, bedrag: 1500 }] })
    const rVol = reken(vol)
    expect(rVol.personen[0].ondernemersaftrek.verrekendNietBenut).toBe(1500)
    expect(nieuwJaarUitVorig(vol, 2026, rVol).personen[0].nietBenutteZelfstandigenaftrek).toBeUndefined()
    // Daarna niet nog een keer verrekend.
    expect(reken(nieuwJaarUitVorig(vol, 2026, rVol)).personen[0].ondernemersaftrek.verrekendNietBenut).toBe(0)

    const laag = huishouden(2025, { winstberekening: { soort: 'saldo', saldo: 1000 } }, { nietBenutteZelfstandigenaftrek: [{ jaar: 2024, bedrag: 1500 }] })
    const rLaag = reken(laag)
    const nieuw = rLaag.personen[0].ondernemersaftrek.nietBenutteZelfstandigenaftrekNieuw
    expect(nieuw).toBeGreaterThan(0)
    expect(nieuwJaarUitVorig(laag, 2026, rLaag).personen[0].nietBenutteZelfstandigenaftrek).toEqual([
      { jaar: 2024, bedrag: 1500 },
      { jaar: 2025, bedrag: nieuw },
    ])
  })

  it('het urencriterium van vorig jaar gaat mee voor de FOR-afname na twee jaar', () => {
    const vorig = huishouden(2025, { uren: { onderneming: 600, urencriteriumGehaald: false }, for: { stand: 5000 } })
    const n = nieuwJaarUitVorig(vorig, 2026, reken(vorig))
    expect(n.personen[0].ondernemingen[0].uren).toMatchObject({ urencriteriumGehaald: false, urencriteriumVorigJaar: false })
    // Zonder uitkomst weten we het niet.
    expect(nieuwJaarUitVorig(vorig, 2026).personen[0].ondernemingen[0].uren.urencriteriumVorigJaar).toBeUndefined()
  })

  it('het urencriterium van vorig jaar is dat van de persoon: twee ondernemingen van elk 800 uur halen het samen', () => {
    // Bevinding 1 van de review (r2b-doorrol-uren.ts): per onderneming niet gehaald, samen wel.
    const vorig = huishouden(2025, { naam: 'zaak1', uren: { onderneming: 800 }, for: { stand: 20000, ondernemingsvermogenEinde: 5000 } })
    vorig.personen[0].ondernemingen.push({ naam: 'zaak2', winstberekening: { soort: 'saldo', saldo: 20000 }, uren: { onderneming: 800 }, startjaar: 2015 })
    const r25 = reken(vorig)
    expect(r25.personen[0].urencriteriumGehaald).toBe(true)
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    expect(n.personen[0].ondernemingen.map((o) => o.uren.urencriteriumVorigJaar)).toEqual([true, true])
    // Een onderneming die er vorig jaar nog niet was, krijgt het urencriterium van de persoon ook.
    const huidig = kloon(n)
    huidig.personen[0].ondernemingen.push({ naam: 'nieuw', winstberekening: { soort: 'saldo', saldo: 1000 }, uren: { onderneming: 100 }, startjaar: 2026 })
    const { invoer } = saldiOpnieuwOvernemen(huidig, vorig, r25)
    expect(invoer.personen[0].ondernemingen.map((o) => o.uren.urencriteriumVorigJaar)).toEqual([true, true, true])
  })

  it('het ondernemingsvermogen aan het einde en de vrijwillige afneming horen bij vorig jaar', () => {
    const vorig = vorigNieuwjaar()
    const n = nieuwJaarUitVorig(vorig, 2026, reken(vorig))
    expect(n.personen[0].ondernemingen[0].for).not.toHaveProperty('ondernemingsvermogenEinde')
    expect(n.personen[0].ondernemingen[0].for).not.toHaveProperty('vrijwilligeAfname')
  })
})

describe('activa en investeringen', () => {
  const laptopOud: ActiefInvoer = { omschrijving: 'laptop-oud', aanschafdatum: '2023-01-01', aanschafwaarde: 5000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', boekwaardeBegin: 3000 }
  const scanner: ActiefInvoer = { omschrijving: 'scanner', aanschafdatum: '2022-05-01', aanschafwaarde: 1200, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', verkocht: { datum: '2025-03-01', verkoopprijs: 300 } }

  /** Vorig jaar met een volledig register dat meetelt (uitgesplitst), zodat de fiscale boekwaarde doorrolt. */
  function vorigMetActiva(volledig = true): HuishoudenInvoer {
    return huishouden(2025, {
      winstberekening: { soort: 'uitgesplitst', omzet: 80000, kosten: 20000 },
      activa: [laptopOud, scanner],
      ...(volledig ? { activaVolledig: true } : {}),
      investeringen: [
        { omschrijving: 'laptop', datum: '2025-07-15', bedrag: 3000, regeling: 'kia' },
        { omschrijving: 'auto', datum: '2025-02-01', bedrag: 30000, regeling: 'kia', uitgesloten: true },
        { omschrijving: 'muis', datum: '2025-03-01', bedrag: 120, regeling: 'kia' },
      ],
    })
  }

  it('boekwaarde begin is de fiscale boekwaarde aan het einde, verkochte activa vallen weg, een investering wordt een actief', () => {
    const vorig = vorigMetActiva()
    const r25 = reken(vorig)
    const o25 = r25.personen[0].ondernemingen[0]
    const kia = o25.investeringsaftrekPerMiddel!.find((m) => m.omschrijving === 'laptop')!
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    const o = n.personen[0].ondernemingen[0]
    const activa = o.activa!
    // Een volledig register blijft volledig: ook de uitgesloten auto komt erin (geen KIA, wel een bedrijfsmiddel).
    expect(o.activaVolledig).toBe(true)
    expect(activa.map((a) => a.omschrijving)).toEqual(['laptop-oud', 'laptop', 'auto'])
    expect(activa[0]).toEqual({ ...laptopOud, boekwaardeBegin: 2000, herkomst: 'act:2025:0' })
    expect(activa[1]).toEqual({
      omschrijving: 'laptop',
      aanschafdatum: '2025-07-15',
      aanschafwaarde: 3000,
      restwaarde: 0,
      levensduurJaren: 5,
      methode: 'lineair',
      soort: 'bedrijfsmiddel',
      bron: 'investering',
      herkomst: 'inv:2025:0',
      investeringsaftrek: { regeling: 'kia', jaar: 2025, genotenPct: Math.round((kia.aftrek / kia.betaald) * 10000) / 10000 },
    })
    expect(activa[1].investeringsaftrek!.genotenPct).toBeGreaterThan(0)
    expect(activa[2]).toMatchObject({ omschrijving: 'auto', herkomst: 'inv:2025:1', bron: 'investering' })
    expect(activa[2].investeringsaftrek).toBeUndefined()
    expect(o.investeringen).toBeUndefined()
    expect(valideerInvoer(n)).toEqual([])

    // In 2026 loopt de afschrijving door: de oude laptop van 2000 naar 1000, de nieuwe vanaf de aanschaf.
    const r26 = reken(n).personen[0].ondernemingen[0].afschrijvingen!
    expect(r26[0]).toMatchObject({ boekwaardeBegin: 2000, afschrijving: 1000 })
    expect(r26[1].boekwaardeBegin).toBe(2700)
  })

  it('een register dat niet volledig was: geen boekwaarde begin, niet volledig, geen uitgesloten investering', () => {
    const vorig = vorigMetActiva(false)
    const n = nieuwJaarUitVorig(vorig, 2026, reken(vorig))
    const o = n.personen[0].ondernemingen[0]
    expect(o.activaVolledig).toBeUndefined()
    expect(o.activa!.map((a) => [a.omschrijving, a.boekwaardeBegin])).toEqual([
      ['laptop-oud', undefined],
      ['laptop', undefined],
    ])
  })

  it('bij een saldo zonder afschrijvingen in de uitkomst rekenen we de boekwaarde zelf met dezelfde regels', () => {
    const vorig = huishouden(2025, { activa: [laptopOud], activaVolledig: true, winstberekening: { soort: 'saldo', saldo: 60000, afschrijvingenInSaldo: 1000 } })
    const r25 = reken(vorig)
    delete r25.personen[0].ondernemingen[0].afschrijvingen
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    expect(n.personen[0].ondernemingen[0].activa![0].boekwaardeBegin).toBe(2000)
  })

  it('een investering die al in het register staat komt er niet dubbel in en geeft haar investeringsaftrek aan dat middel', () => {
    const vorig = vorigMetActiva()
    vorig.personen[0].ondernemingen[0].activa!.push({ omschrijving: 'Laptop (register)', aanschafdatum: '2025-07-15', aanschafwaarde: 3000, restwaarde: 500, levensduurJaren: 4, methode: 'lineair' })
    const r25 = reken(vorig)
    const kia = r25.personen[0].ondernemingen[0].investeringsaftrekPerMiddel!.find((m) => m.omschrijving === 'laptop')!
    const n = nieuwJaarUitVorig(vorig, 2026, r25)
    const activa = n.personen[0].ondernemingen[0].activa!
    expect(activa.filter((a) => a.aanschafdatum === '2025-07-15')).toHaveLength(1)
    expect(activa.find((a) => a.aanschafdatum === '2025-07-15')).toMatchObject({
      omschrijving: 'Laptop (register)',
      levensduurJaren: 4,
      investeringsaftrek: { regeling: 'kia', jaar: 2025, genotenPct: Math.round((kia.aftrek / kia.betaald) * 10000) / 10000 },
    })
  })
})

describe('opnieuw overnemen', () => {
  function startpunt() {
    const vorig = huishouden(
      2025,
      {
        winstberekening: { soort: 'uitgesplitst', omzet: 80000, kosten: 20000 },
        activa: [{ omschrijving: 'laptop-oud', aanschafdatum: '2023-01-01', aanschafwaarde: 5000, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', boekwaardeBegin: 3000 }],
        investeringen: [{ omschrijving: 'laptop', datum: '2025-07-15', bedrag: 3000, regeling: 'kia' }],
        for: { stand: 20000, vrijwilligeAfname: 2000 },
        jaarrekening: { eind: { liquideMiddelen: 2500, crediteuren: 300 } },
      },
      { verliezen: [{ jaar: 2023, bedrag: 70000 }], restantPgaVorigJaar: 0, inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, forOmzetting: 5000 } },
    )
    const huidig = nieuwJaarUitVorig(vorig, 2026, reken(vorig))
    // De gebruiker vult 2026 verder in: loon, een eigen bedrijfsmiddel, een kortere levensduur voor de laptop.
    const p = huidig.personen[0]
    p.loon = [{ omschrijving: 'Baan', soort: 'loon', bruto: 12000, ingehoudenLoonheffing: 1500 }]
    const o = p.ondernemingen[0]
    o.activa!.push({ omschrijving: 'monitor', aanschafdatum: '2026-02-01', aanschafwaarde: 900, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', bron: 'handmatig' })
    o.activa!.find((a) => a.omschrijving === 'laptop')!.levensduurJaren = 3
    o.for!.vrijwilligeAfname = 1000
    return { vorig, huidig }
  }

  it('zonder wijziging in vorig jaar verandert er niets', () => {
    const { vorig, huidig } = startpunt()
    const r = saldiOpnieuwOvernemen(huidig, vorig, reken(vorig))
    expect(r.wijzigingen).toEqual([])
    expect(r.invoer).toEqual(huidig)
  })

  it('werkt de saldi bij na een wijziging in vorig jaar en laat de rest van de invoer staan', () => {
    const { vorig, huidig } = startpunt()
    const v2 = kloon(vorig)
    const o = v2.personen[0].ondernemingen[0]
    o.winstberekening = { soort: 'uitgesplitst', omzet: 90000, kosten: 20000 }
    o.for!.vrijwilligeAfname = 5000
    o.jaarrekening = { eind: { liquideMiddelen: 4000, crediteuren: 300 } }
    o.investeringen!.push({ omschrijving: 'printer', datum: '2025-10-01', bedrag: 800, regeling: 'kia' })
    o.activa![0].verkocht = { datum: '2025-12-01', verkoopprijs: 1000 }
    const r25 = reken(v2)

    const { invoer, wijzigingen } = saldiOpnieuwOvernemen(huidig, v2, r25)
    const p = invoer.personen[0]
    const n = p.ondernemingen[0]
    expect(n.for).toEqual({ stand: r25.personen[0].ondernemingen[0].forStandEind, vrijwilligeAfname: 1000 })
    expect(n.for!.stand).toBe(15000)
    expect(n.jaarrekening!.begin).toEqual({ liquideMiddelen: 4000, crediteuren: 300 })
    expect(p.verliezen).toEqual([{ jaar: 2023, bedrag: 70000 - r25.personen[0].verliesverrekening }])
    // Verkocht in 2025: weg. De laptop houdt de levensduur van 2026, de printer komt erbij, de monitor blijft.
    expect(n.activa!.map((a) => a.omschrijving)).toEqual(['laptop', 'printer', 'monitor'])
    expect(n.activa![0].levensduurJaren).toBe(3)
    // De rest van 2026 blijft staan.
    expect(p.loon).toEqual(huidig.personen[0].loon)

    const labels = wijzigingen.map((w) => w.label)
    expect(labels).toEqual(
      expect.arrayContaining(['Verliezen box 1', 'Oudedagsreserve begin', 'Beginbalans: liquide middelen', 'Bedrijfsmiddel printer', 'Bedrijfsmiddel laptop-oud', 'Premiegrondslag-inkomen 2025']),
    )
    expect(wijzigingen.find((w) => w.label === 'Oudedagsreserve begin')).toMatchObject({ oud: '€ 18.000', nieuw: '€ 15.000', onderneming: 'zaak', persoon: 'A' })
    const tekst = wijzigingen.map((w) => `${w.label} ${w.oud} ${w.nieuw}`).join('\n')
    expect(tekst).not.toMatch(/[—→]/)
  })

  it('twee keer overnemen geeft hetzelfde', () => {
    const { vorig, huidig } = startpunt()
    const v2 = kloon(vorig)
    v2.personen[0].ondernemingen[0].for!.vrijwilligeAfname = 5000
    v2.personen[0].ondernemingen[0].investeringen!.push({ omschrijving: 'printer', datum: '2025-10-01', bedrag: 800, regeling: 'kia' })
    const r25 = reken(v2)
    const een = saldiOpnieuwOvernemen(huidig, v2, r25)
    expect(een.wijzigingen.length).toBeGreaterThan(0)
    const twee = saldiOpnieuwOvernemen(een.invoer, v2, r25)
    expect(twee.invoer).toEqual(een.invoer)
    expect(twee.wijzigingen).toEqual([])
    expect(doorrolWijzigingen(een.invoer, twee.invoer)).toEqual([])
  })

  it('ook een verschil zonder eigen regel (een andere omschrijving) telt als wijziging', () => {
    const { vorig, huidig } = startpunt()
    const v2 = kloon(vorig)
    v2.personen[0].ondernemingen[0].activa![0].omschrijving = 'Laptop 2023'
    const r = saldiOpnieuwOvernemen(huidig, v2, reken(v2))
    expect(r.invoer.personen[0].ondernemingen[0].activa![0].omschrijving).toBe('Laptop 2023')
    expect(r.wijzigingen).toEqual([{ persoon: 'A', label: 'Overige gegevens uit 2025', oud: 'zoals nu', nieuw: 'bijgewerkt uit 2025' }])
  })

  it('een verkoop in dit jaar en een zelf ingevuld verlies van vorig jaar blijven staan', () => {
    const { vorig, huidig } = startpunt()
    const p = huidig.personen[0]
    p.ondernemingen[0].activa![0].verkocht = { datum: '2026-04-01', verkoopprijs: 800 }
    p.verliezen = [...(p.verliezen ?? []), { jaar: 2025, bedrag: 1234 }]
    const r = saldiOpnieuwOvernemen(huidig, vorig, reken(vorig))
    expect(r.invoer.personen[0].ondernemingen[0].activa![0].verkocht).toEqual({ datum: '2026-04-01', verkoopprijs: 800 })
    expect(r.invoer.personen[0].verliezen).toContainEqual({ jaar: 2025, bedrag: 1234 })
    expect(r.wijzigingen).toEqual([])
  })

  it('een nieuw verlies van vorig jaar gaat niet vanzelf mee, maar geeft een melding', () => {
    const vorig = huishouden(2025, { winstberekening: { soort: 'saldo', saldo: -8000 } })
    const r25 = reken(vorig)
    const huidig = nieuwJaarUitVorig(vorig, 2026, r25)
    expect(huidig.personen[0].verliezen).toBeUndefined()
    const verlies = r25.personen[0].verliesDitJaar!
    expect(verlies).toBeGreaterThan(0)
    const r = saldiOpnieuwOvernemen(huidig, vorig, r25)
    expect(r.meldingen.join(' ')).toContain(`verlies in box 1 van € ${verlies.toLocaleString('nl-NL')}. Dat gaat eerst terug naar de 3 jaar daarvoor.`)
    // Na het invullen van het restant verdwijnt de melding.
    huidig.personen[0].verliezen = [{ jaar: 2025, bedrag: 3000 }]
    expect(saldiOpnieuwOvernemen(huidig, vorig, r25).meldingen.join(' ')).not.toMatch(/verlies in box 1/)
  })

  it('koppelt ondernemingen op naam, ook als de volgorde verschilt', () => {
    const vorig = huishouden(2025, { naam: 'Meubelmakerij', for: { stand: 8000, vrijwilligeAfname: 1000 } }, { inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, forOmzetting: 1000 } })
    vorig.personen[0].ondernemingen.push({ naam: 'Fotografie', winstberekening: { soort: 'saldo', saldo: 5000 }, uren: { onderneming: 0 }, startjaar: 2020 })
    const huidig = nieuwJaarUitVorig(vorig, 2026, reken(vorig))
    huidig.personen[0].ondernemingen.reverse()
    const d = berekenDoorrol(vorig, reken(vorig), 2026)
    const { invoer } = pasDoorrolToe(huidig, d)
    expect(invoer.personen[0].ondernemingen.map((o) => [o.naam, o.for?.stand])).toEqual([
      ['Fotografie', undefined],
      ['Meubelmakerij', 7000],
    ])
  })
})

describe('opnieuw overnemen: lijfrentehistorie (voorbeeld 2024)', () => {
  const invoer2024 = voorbeeldInvoer(2024)

  it('na een andere lijfrente-inleg in 2024 wordt de regel 2024 bijgewerkt; een eigen jaarruimte van een ouder jaar blijft', () => {
    const huidig = nieuwJaarUitVorig(invoer2024, 2025, reken(invoer2024))
    const rij2021 = huidig.personen[0].inkomensvoorziening.historie!.find((h) => h.jaar === 2021)!
    rij2021.jaarruimteOverride = 12345
    expect(saldiOpnieuwOvernemen(huidig, invoer2024, reken(invoer2024)).wijzigingen).toEqual([])

    const v2 = kloon(invoer2024)
    // Meer dan de reserveringsruimte van de oudere jaren, zodat er ook jaarruimte 2024 wordt gebruikt.
    v2.personen[0].inkomensvoorziening.lijfrentePremies = 60000
    const r24 = reken(v2)
    const tabel = r24.personen[0].inkomensvoorziening.tabel
    const { invoer, wijzigingen } = saldiOpnieuwOvernemen(huidig, v2, r24)
    const historie = invoer.personen[0].inkomensvoorziening.historie!
    const rij2024 = historie.find((h) => h.jaar === 2024)!
    expect(rij2024.alGebruikt).toBe(tabel.find((t) => t.jaar === 2024)!.ditJaarBenut)
    expect(rij2024.alGebruikt).toBeGreaterThan(0)
    expect(historie.find((h) => h.jaar === 2021)!.jaarruimteOverride).toBe(12345)
    expect(wijzigingen.map((w) => w.label)).toContain('Lijfrentehistorie 2024: al gebruikt')
    // En nog een keer: niets meer.
    expect(saldiOpnieuwOvernemen(invoer, v2, r24).wijzigingen).toEqual([])
  })
})

describe('premiegrondslag voor de jaarruimte (G07)', () => {
  it('een vrijwillige afneming van de FOR telt niet mee: winst vóór elke afneming', () => {
    // Voorbeeld uit ronde1.json (toets-0/g07.ts): 2025, saldo 60.000, FOR 20.000.
    for (const vrij of [0, 5000]) {
      const inv = huishouden(2025, { for: { stand: 20000, ondernemingsvermogenEinde: 80000, vrijwilligeAfname: vrij } }, { inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0, forOmzetting: vrij } })
      const p = reken(inv).personen[0]
      expect(p.winstUitOnderneming).toBe(60000 + vrij)
      expect(premiegrondslagInkomen(p)).toBe(60000)
      expect(nieuwJaarUitVorig(inv, 2026, reken(inv)).personen[0].inkomensvoorziening.premiegrondslagInkomenVorigJaar).toBe(60000)
    }
  })

  it('een verplichte afneming telt ook niet mee', () => {
    const inv = huishouden(2025, { uren: { onderneming: 0, urencriteriumGehaald: false, urencriteriumVorigJaar: false }, for: { stand: 20000, ondernemingsvermogenEinde: 15000 } })
    const p = reken(inv).personen[0]
    const verplicht = p.ondernemingen[0].verplichteForAfname
    expect(verplicht).toBe(5000)
    expect(premiegrondslagInkomen(p)).toBe(p.winstUitOnderneming - verplicht)
  })

  it('jaren met dotatie: premiegrondslag-inkomen plus toename FOR is de winst vóór toevoeging', () => {
    // `dotatie` is een optioneel veld bovenop het contract (for.ts): de gekozen dotatie in een jaar met dotatie.
    const inv = huishouden(2022, { for: { stand: 10000, ondernemingsvermogenEinde: 100000, dotatie: 4000 } as NonNullable<OndernemingInvoer['for']> })
    const r22 = reken(inv)
    const p = r22.personen[0]
    const dotatie = p.ondernemingen[0].forDotatie!
    expect(dotatie).toBeGreaterThan(0)
    expect(p.winstUitOnderneming).toBe(60000 - dotatie)
    expect(forToename(p)).toBe(dotatie)
    expect(premiegrondslagInkomen(p) + forToename(p)).toBe(60000)

    // Doorgerold naar 2023: de engine telt de toename er weer bij voor de premiegrondslag en trekt hem af van de jaarruimte.
    const n = nieuwJaarUitVorig(inv, 2023, r22)
    const iv = n.personen[0].inkomensvoorziening
    expect(iv.premiegrondslagInkomenVorigJaar).toBe(60000 - dotatie)
    expect(iv.forToenameVorigJaar).toBe(dotatie)
    expect(n.personen[0].ondernemingen[0].for).toEqual({ stand: 10000 + dotatie })
    const j = reken(n).personen[0].inkomensvoorziening.jaarruimteBerekeningen!.find((x) => x.jaar === 2023)!
    expect(j.inkomen + j.forToename).toBe(60000)
  })
})

describe('validatie van saldi uit eerdere jaren', () => {
  it('jaar vóór dit jaar, geen negatieve bedragen', () => {
    const inv = huishouden(2026, {}, {
      verliezen: [{ jaar: 2026, bedrag: 100 }, { jaar: 2024, bedrag: -5 }],
      nietBenutteZelfstandigenaftrek: [{ jaar: 2025.5, bedrag: 100 }],
      restantPgaVorigJaar: -1,
    })
    expect(valideerInvoer(inv)).toEqual(
      expect.arrayContaining([
        'personen[0].verliezen[0].jaar: moet een eerder jaar zijn dan 2026',
        'personen[0].verliezen[1].bedrag: mag niet negatief zijn',
        'personen[0].nietBenutteZelfstandigenaftrek[0].jaar: moet een heel jaartal zijn',
        'personen[0].restantPgaVorigJaar: mag niet negatief zijn',
      ]),
    )
    expect(valideerInvoer(huishouden(2026, {}, { verliezen: [{ jaar: 2025, bedrag: 100 }], nietBenutteZelfstandigenaftrek: [{ jaar: 2024, bedrag: 50 }] }))).toEqual([])
  })
})
