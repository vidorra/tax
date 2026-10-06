import type { HuishoudenInvoer, OndernemingInvoer, PersoonId, PersoonInvoer, UrenInvoer } from '@/lib/tax/types'

/**
 * Lege persoon. De geboortedatum blijft leeg tot de gebruiker hem invult: dan gaat de controle "Geboortedatum ontbreekt"
 * af en rekent niemand ongemerkt met een verzonnen datum. Tot die tijd rekent `berekenDossier` (bereken.ts) met een
 * veilige standaard. `jaar` blijft in de handtekening voor de aanroepers.
 */
export function leegPersoon(id: PersoonId, _jaar?: number): PersoonInvoer {
  return {
    id,
    naam: id === 'A' ? 'Persoon A' : 'Persoon B',
    geboortedatum: '',
    ondernemingen: [],
    loon: [],
    inkomensvoorziening: { lijfrentePremies: 0, aovPremies: 0 },
  }
}

export function leegInvoer(jaar: number): HuishoudenInvoer {
  return {
    jaar,
    personen: [leegPersoon('A', jaar)],
    fiscaalPartner: false,
    kinderen: [],
    box3: { posities: [], schulden: [] },
    verdeling: 'optimaal',
  }
}

/** Standaard voor het urencriterium: de vraag staat op ja, uren invullen is optioneel. */
export function standaardUren(): UrenInvoer {
  return { onderneming: 0, urencriteriumGehaald: true }
}

/**
 * Standaard startjaar van een nieuwe onderneming: ruim vóór de startersjaren, zodat er geen startersaftrek
 * ontstaat die de gebruiker niet heeft gekozen. Wie echt starter is, vult het eigen startjaar in.
 */
export const STANDAARD_JAREN_ONDERNEMER = 10

/** Nieuwe onderneming in het dossier. */
export function leegOnderneming(jaar: number, naam = 'Mijn onderneming'): OndernemingInvoer {
  return { naam, winstberekening: { soort: 'saldo', saldo: 0 }, uren: standaardUren(), startjaar: jaar - STANDAARD_JAREN_ONDERNEMER }
}
