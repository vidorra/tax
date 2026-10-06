/** Hulpfuncties van het activaregister in het dossier (ActivaInvoer), met de engine voor de koppeling. */
import { describe, expect, it } from 'vitest'
import { berekenOnderneming } from '@/lib/tax/modules/onderneming'
import { getJaar } from '@/lib/tax/years'
import type { ActiefInvoer, OndernemingInvoer } from '@/lib/tax/types'
import {
  boekwaardeOntbreekt,
  dubbeleActiva,
  geboekteAfschrijving,
  heeftEigenKeuzes,
  herkomstTekst,
  koppelAfschrijvingen,
  koppelFormules,
  levensduurTeBevestigen,
  nieuwActief,
  registerTeltMee,
  verwijderdeHerkomsten,
  waaromAfwezig,
  waaromTeltNiet,
  wisselWinstberekening,
  zetActiva,
} from '../secties/activaregister'

const params = getJaar(2026)
const actief = (x: Partial<ActiefInvoer>): ActiefInvoer => ({ omschrijving: 'Laptop', aanschafdatum: '2025-07-15', aanschafwaarde: 2000, restwaarde: 0, levensduurJaren: 4, methode: 'lineair', ...x })

const onderneming = (activa: ActiefInvoer[], wb: OndernemingInvoer['winstberekening'] = { soort: 'uitgesplitst', omzet: 90000, kosten: 30000, afschrijvingen: 1000 }): OndernemingInvoer => ({
  naam: 'Zaak',
  winstberekening: wb,
  uren: { onderneming: 0, urencriteriumGehaald: true },
  startjaar: 2015,
  activa,
})

describe('activaregister in het dossier', () => {
  it('nieuw actief: met de hand, lineair, de kortste fiscale levensduur', () => {
    expect(nieuwActief(2026, params)).toEqual({ omschrijving: '', aanschafdatum: '2026-01-01', aanschafwaarde: 0, restwaarde: 0, levensduurJaren: 5, methode: 'lineair', bron: 'handmatig' })
  })

  it('koppelt de uitkomst van de engine aan de regels, ook als de engine middelen weglaat', () => {
    const activa = [
      actief({ omschrijving: 'Toekomst', aanschafdatum: '2027-01-01' }),
      actief({}),
      actief({ omschrijving: 'Verkocht', aanschafdatum: '2022-01-01', verkocht: { datum: '2025-03-01', verkoopprijs: 100 } }),
      actief({ omschrijving: 'Monitor', aanschafwaarde: 449, aanschafdatum: '2026-03-01' }),
    ]
    const o = onderneming(activa)
    const r = berekenOnderneming(o, { params, jaar: 2026, aowBereikt: false, urenLoondienst: 0 })
    const gekoppeld = koppelAfschrijvingen(activa, r.afschrijvingen)
    expect(gekoppeld.map((x) => x?.afschrijving)).toEqual([undefined, 400, undefined, 449])
    // Laptop van 2.000 in 4 jaar: begrensd op 20% per jaar; 2025 een half jaar (200), dus 1.800 begin, 1.400 eind.
    expect(gekoppeld[1]).toMatchObject({ boekwaardeBegin: 1800, boekwaardeEind: 1400 })
    const formules = koppelFormules(activa, r.afschrijvingen, r.uitleg)
    expect(formules[1]).toContain('maximaal 20%')
    expect(formules[3]).toContain('direct ten laste van de winst')
    expect(waaromAfwezig(activa[0], 2026, o.winstberekening)).toBe('later')
    expect(waaromAfwezig(activa[2], 2026, o.winstberekening)).toBe('verkocht')
  })

  it('zonder positie uit de engine (oudere uitkomst) koppelen we op omschrijving en aanschafwaarde', () => {
    const activa = [actief({ omschrijving: 'Toekomst', aanschafdatum: '2027-01-01' }), actief({}), actief({ omschrijving: 'Camera', aanschafwaarde: 1200 })]
    const r = berekenOnderneming(onderneming(activa), { params, jaar: 2026, aowBereikt: false, urenLoondienst: 0 })
    const zonderPositie = r.afschrijvingen!.map(({ invoerIndex: _i, ...x }) => x)
    const bedragen = (l: ReturnType<typeof koppelAfschrijvingen>) => l.map((x) => x && [x.omschrijving, x.afschrijving, x.boekwaardeEind])
    expect(bedragen(koppelAfschrijvingen(activa, zonderPositie))).toEqual(bedragen(koppelAfschrijvingen(activa, r.afschrijvingen)))
    expect(koppelAfschrijvingen(activa, zonderPositie).map((x) => x?.omschrijving)).toEqual([undefined, 'Laptop', 'Camera'])
    expect(koppelFormules(activa, zonderPositie, r.uitleg)[2]).toBeDefined()
    // Lopen uitleg en uitkomst niet gelijk op, dan geen formules in plaats van verkeerde.
    expect(koppelFormules(activa, zonderPositie, [])).toEqual([undefined, undefined, undefined])
  })

  it('twee gelijke regels krijgen elk hun eigen uitkomst en worden als dubbel gemeld', () => {
    const activa = [actief({}), actief({})]
    const r = berekenOnderneming(onderneming(activa), { params, jaar: 2026, aowBereikt: false, urenLoondienst: 0 })
    const gekoppeld = koppelAfschrijvingen(activa, r.afschrijvingen)
    expect(gekoppeld.filter(Boolean)).toHaveLength(2)
    expect(gekoppeld[0]).not.toBe(gekoppeld[1])
    expect(dubbeleActiva(activa)).toEqual([[0, 1]])
    expect(dubbeleActiva([actief({ omschrijving: 'Laptop' }), actief({ omschrijving: 'Camera', aanschafwaarde: 2001 })])).toEqual([])
    expect(dubbeleActiva([actief({ aanschafwaarde: 0 }), actief({ aanschafwaarde: 0 })])).toEqual([])
  })

  it('dubbel ook bij dezelfde omschrijving met een nabije datum of een nabij bedrag (bevinding 10)', () => {
    // Doorgerold middel naast een eigen regel met de datum van ingebruikname of de installatiekosten erbij.
    expect(dubbeleActiva([actief({ omschrijving: 'Camera', aanschafdatum: '2025-03-01', aanschafwaarde: 4000 }), actief({ omschrijving: ' camera', aanschafdatum: '2025-03-10', aanschafwaarde: 4150 })])).toEqual([[0, 1]])
    expect(dubbeleActiva([actief({ omschrijving: 'Camera', aanschafdatum: '2025-03-01', aanschafwaarde: 4000 }), actief({ omschrijving: 'Camera', aanschafdatum: '2025-09-01', aanschafwaarde: 4250 })])).toEqual([[0, 1]])
    // Zelfde omschrijving, maar een half jaar later en een ander bedrag: een tweede camera.
    expect(dubbeleActiva([actief({ omschrijving: 'Camera', aanschafdatum: '2025-03-01', aanschafwaarde: 4000 }), actief({ omschrijving: 'Camera', aanschafdatum: '2025-09-01', aanschafwaarde: 6000 })])).toEqual([])
  })

  it('register telt alleen mee als alles erin staat, en bij saldo met de afschrijving in het saldo (bevinding 9)', () => {
    const saldo = onderneming([actief({})], { soort: 'saldo', saldo: 60000 })
    expect(registerTeltMee(saldo)).toBe(false)
    expect(waaromAfwezig(actief({}), 2026, saldo.winstberekening)).toBe('saldo')
    expect(registerTeltMee({ ...onderneming([actief({})], { soort: 'saldo', saldo: 60000, afschrijvingenInSaldo: 900 }), activaVolledig: true })).toBe(true)
    expect(registerTeltMee({ ...onderneming([actief({})]), activaVolledig: true })).toBe(true)
    expect(registerTeltMee(onderneming([actief({})]))).toBe(false)
    expect(registerTeltMee({ ...onderneming([]), activaVolledig: true })).toBe(false)
    expect(waaromTeltNiet(onderneming([actief({})]))).toBe('onvolledig')
    expect(waaromTeltNiet({ ...saldo, activaVolledig: true })).toBe('saldo')
    expect(waaromTeltNiet({ ...onderneming([actief({})]), activaVolledig: true })).toBeNull()
  })

  it('een verwijderd doorgerold middel komt in doorrolUitgesloten, een eigen middel niet (bevinding 10)', () => {
    const doorgerold = actief({ herkomst: 'inv:2025:0' })
    const eigen = actief({ omschrijving: 'Monitor', bron: 'handmatig' })
    const o = onderneming([doorgerold, eigen])
    expect(verwijderdeHerkomsten(o.activa, [eigen])).toEqual(['inv:2025:0'])
    zetActiva(o, [eigen])
    expect(o.doorrolUitgesloten).toEqual(['inv:2025:0'])
    zetActiva(o, [])
    expect(o.activa).toBeUndefined()
    expect(o.doorrolUitgesloten).toEqual(['inv:2025:0'])
    // Een wijziging van een veld verwijdert niets.
    const p = onderneming([doorgerold])
    zetActiva(p, [{ ...doorgerold, levensduurJaren: 8 }])
    expect(p.doorrolUitgesloten).toBeUndefined()
  })

  it('herkomst, levensduur bevestigen en een ontbrekende boekwaarde (bevindingen 5 en 14)', () => {
    expect(herkomstTekst(actief({ herkomst: 'inv:2025:3' }))).toBe('Uit je investeringen van 2025.')
    expect(herkomstTekst(actief({ herkomst: 'act:2024:0' }))).toBe('Overgenomen uit 2024.')
    expect(herkomstTekst(actief({}))).toBeUndefined()
    expect(levensduurTeBevestigen(actief({ bron: 'investering' }))).toBe(true)
    expect(levensduurTeBevestigen(actief({ bron: 'handmatig' }))).toBe(false)
    expect(boekwaardeOntbreekt(actief({}), 2026)).toBe(true)
    expect(boekwaardeOntbreekt(actief({ boekwaardeBegin: 1800 }), 2026)).toBe(false)
    expect(boekwaardeOntbreekt(actief({ aanschafdatum: '2026-02-01' }), 2026)).toBe(false)
    expect(boekwaardeOntbreekt(actief({ methode: 'direct' }), 2026)).toBe(false)
    expect(boekwaardeOntbreekt(actief({ verkocht: { datum: '2025-12-01', verkoopprijs: 0 } }), 2026)).toBe(false)
    expect(boekwaardeOntbreekt(actief({ verkocht: { datum: '2026-05-01', verkoopprijs: 0 } }), 2026)).toBe(true)
  })

  it('wisselen van winstberekening houdt het saldo gelijk en neemt de geboekte afschrijving mee', () => {
    const uit = { soort: 'uitgesplitst' as const, omzet: 90000, kosten: 30000, afschrijvingen: 1500 }
    expect(wisselWinstberekening(uit, 'saldo', 58500)).toEqual({ soort: 'saldo', saldo: 58500, afschrijvingenInSaldo: 1500 })
    expect(wisselWinstberekening({ soort: 'saldo', saldo: 58500, afschrijvingenInSaldo: 1500 }, 'uitgesplitst', 58500)).toEqual({ soort: 'uitgesplitst', omzet: 60000, kosten: 0, afschrijvingen: 1500 })
    expect(wisselWinstberekening({ soort: 'saldo', saldo: 100 }, 'uitgesplitst', 100)).toEqual({ soort: 'uitgesplitst', omzet: 100, kosten: 0 })
    expect(wisselWinstberekening({ soort: 'uitgesplitst', omzet: 10, kosten: 0 }, 'saldo', 10)).toEqual({ soort: 'saldo', saldo: 10 })
    expect(geboekteAfschrijving(uit)).toBe(1500)
  })

  it('eigen keuzes openen het blok met soort, methode en verkoop', () => {
    expect(heeftEigenKeuzes(actief({}))).toBe(false)
    expect(heeftEigenKeuzes(actief({ soort: 'bedrijfsmiddel' }))).toBe(false)
    expect(heeftEigenKeuzes(actief({ soort: 'goodwill' }))).toBe(true)
    expect(heeftEigenKeuzes(actief({ methode: 'vamil' }))).toBe(true)
    expect(heeftEigenKeuzes(actief({ verkocht: { datum: '2026-05-01', verkoopprijs: 0 } }))).toBe(true)
  })
})
