/**
 * Kleine bouwstenen voor een HuishoudenInvoer in de deelcalculators.
 * Geen fiscale getallen: het urencriterium komt uit de params van het jaar.
 */
import type { HuishoudenInvoer, InkomensvoorzieningInvoer, KindInvoer, OndernemingInvoer, PersoonId, PersoonInvoer, TaxYearParams } from '@/lib/tax/types'

/** Aanname als de gebruiker geen geboortedatum opgeeft: ruim onder de AOW-leeftijd. */
export const STANDAARD_GEBOORTEDATUM = '1985-01-01'

/** Aantal jaren dat de onderneming in de voorbeelden al bestaat (geen starter). */
const JAREN_ONDERNEMER = 10

export const LEGE_INKOMENSVOORZIENING: InkomensvoorzieningInvoer = { lijfrentePremies: 0, aovPremies: 0 }

/** Onderneming met een uitgesplitste winst (omzet min kosten) waarvan het urencriterium is gehaald. */
export function eenvoudigeOnderneming(winst: number, jaar: number, p: TaxYearParams, extra: Partial<OndernemingInvoer> = {}): OndernemingInvoer {
  return {
    naam: 'Onderneming',
    winstberekening: { soort: 'uitgesplitst', omzet: Math.max(0, winst), kosten: Math.max(0, -winst) },
    uren: { onderneming: p.ondernemer.waarde.urencriterium.uren, urencriteriumGehaald: true },
    startjaar: jaar - JAREN_ONDERNEMER,
    ...extra,
  }
}

export function eenvoudigePersoon(
  id: PersoonId,
  opties: {
    geboortedatum?: string
    winst?: number | null
    loon?: number | null
    jaar: number
    params: TaxYearParams
    inkomensvoorziening?: InkomensvoorzieningInvoer
    onderneming?: Partial<OndernemingInvoer>
  },
): PersoonInvoer {
  const ondernemingen = opties.winst !== undefined && opties.winst !== null ? [eenvoudigeOnderneming(opties.winst, opties.jaar, opties.params, opties.onderneming)] : []
  const loon = opties.loon && opties.loon > 0 ? [{ omschrijving: 'Loon', soort: 'loon' as const, bruto: opties.loon, ingehoudenLoonheffing: 0 }] : []
  return {
    id,
    geboortedatum: opties.geboortedatum || STANDAARD_GEBOORTEDATUM,
    ondernemingen,
    loon,
    inkomensvoorziening: opties.inkomensvoorziening ?? LEGE_INKOMENSVOORZIENING,
  }
}

export function eenvoudigHuishouden(jaar: number, personen: PersoonInvoer[], opties: { variant?: string; kinderen?: KindInvoer[] } = {}): HuishoudenInvoer {
  return {
    jaar,
    variant: opties.variant || undefined,
    personen,
    fiscaalPartner: personen.length === 2,
    kinderen: opties.kinderen ?? [],
    box3: { posities: [], schulden: [] },
    verdeling: { eigenWoning: 1, pga: 1, box3: 1, box2: 1, dividendbelasting: 1 },
  }
}

/** Unieke id voor een rij in een lijst (kind, positie). */
export function nieuweId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 9)}`
}
