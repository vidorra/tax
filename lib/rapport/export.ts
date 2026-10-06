/**
 * Export van het fiscaal rapport: voor wie, welke invoer er in Excel meegaat en onder welke bestandsnaam.
 * Gedeeld door de exportpagina (browser) en scripts/rapport-voorbeeld.ts (Node). Puur en licht: geen rapportbouw
 * hier, zodat de exportpagina dit statisch kan laden en de bouw (lib/rapport/rapporten.ts) pas bij een klik.
 *
 * Eén rapport per belastingplichtige, zoals bij de accountant. 'beide' geeft de rapporten van alle personen in
 * het dossier achter elkaar (in de PDF elk met een eigen voorblad en nummering, in Excel een tabblad per persoon).
 */
import type { Eigenaar, HuishoudenInvoer, HuishoudenResultaat, PersoonId, PersoonInvoer } from '@/lib/tax/types'
import type { HuishoudenGegevens } from './model'

export type RapportKeuze = PersoonId | 'beide'

/** Personen waarvoor een rapport wordt gemaakt, in de volgorde van het dossier. */
export function rapportPersonen(invoer: HuishoudenInvoer, keuze: RapportKeuze): PersoonId[] {
  const ids = invoer.personen.map((p) => p.id)
  if (keuze === 'beide') return ids
  if (!ids.includes(keuze)) throw new Error(`Persoon ${keuze} staat niet in dit dossier.`)
  return [keuze]
}

/** Houdt de elementen die aan `houden` voldoen op hun eigen index; de andere plekken blijven leeg (een gat). */
function opEigenPlek<T>(lijst: readonly T[], houden: (x: T) => boolean): T[] {
  const uit: T[] = []
  lijst.forEach((x, i) => {
    if (houden(x)) uit[i] = x
  })
  return uit
}

/**
 * Invoer voor het tabblad Invoer van de Excel-export. Bij 'beide', en in een dossier met één persoon, is dat
 * de hele invoer. Bij één persoon van twee alleen wat bij diens rapport hoort: die persoon zelf en de
 * gezamenlijke delen die het rapport gebruikt (eigen woning, persoonsgebonden aftrek, kinderen, verdeling, de
 * box 3-posities en -schulden van de pot waar deze persoon in zit, en box 2 van beiden bij fiscale partners,
 * anders alleen de eigen posten). Wie het eigen rapport deelt, deelt zo niet ongemerkt de invoer van de ander.
 *
 * Wat meegaat houdt zijn index en wat wegvalt laat een gat in de array (geen element). Zo blijven de paden op
 * het tabblad Invoer ('personen[1].loon[0]', 'box3.posities[2]') gelijk aan de herkomst op het tabblad
 * Gegevens. Alleen voor de export: reken er niet mee.
 */
export function rapportInvoer(invoer: HuishoudenInvoer, resultaat: Pick<HuishoudenResultaat, 'box3'>, keuze: RapportKeuze): HuishoudenInvoer {
  const ids = rapportPersonen(invoer, keuze)
  if (ids.length === invoer.personen.length) return invoer
  const [id] = ids
  const anderen: string[] = invoer.personen.map((p) => p.id).filter((x) => x !== id)
  const partners = invoer.fiscaalPartner && invoer.personen.length === 2

  // Box 3 zoals het rapport hem toont: de pot uit de uitkomst. Zonder potten in de uitkomst in elk geval
  // niets wat op naam van de ander staat.
  const pot = resultaat.box3.potten?.find((x) => x.personen.includes(id))
  const nietVanAnder = (x: { eigenaar: Eigenaar }) => !anderen.includes(x.eigenaar)

  return {
    jaar: invoer.jaar,
    ...(invoer.variant !== undefined ? { variant: invoer.variant } : {}),
    personen: opEigenPlek<PersoonInvoer>(invoer.personen, (p) => p.id === id),
    fiscaalPartner: invoer.fiscaalPartner,
    kinderen: invoer.kinderen,
    ...(invoer.eigenWoning ? { eigenWoning: invoer.eigenWoning } : {}),
    box3: {
      ...invoer.box3,
      posities: opEigenPlek(invoer.box3.posities, (x) => (pot ? pot.positieIds.includes(x.id) : nietVanAnder(x))),
      schulden: opEigenPlek(invoer.box3.schulden, (x) => (pot ? pot.schuldIds.includes(x.id) : nietVanAnder(x))),
    },
    ...(invoer.pga ? { pga: invoer.pga } : {}),
    ...(invoer.box2 ? { box2: partners ? invoer.box2 : opEigenPlek(invoer.box2, (x) => x.eigenaar === id) } : {}),
    verdeling: invoer.verdeling,
  }
}

const MAX_NAAM = 40

/**
 * Naam als deel van een bestandsnaam: kleine letters, accenten weg, alles behalve letters en cijfers wordt een
 * streepje, hoogstens 40 tekens. 'José van den Berg' wordt 'jose-van-den-berg'.
 */
export function veiligeNaam(naam: string, terugval = 'rapport'): string {
  const schoon = naam
    .normalize('NFKD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
  return schoon.slice(0, MAX_NAAM).replace(/-+$/, '') || terugval
}

/**
 * 'fiscaal-rapport-2024-persoon-a.pdf'; bij twee rapporten 'fiscaal-rapport-2024-anna-en-bram.xlsx'. Ronde 2 (A3): met
 * `concept` (open fouten in een jaar dat niet is ingediend) 'fiscaal-rapport-2024-persoon-a-concept.pdf'.
 */
export function rapportBestandsnaam(jaar: number, namen: string[], extensie: 'pdf' | 'xlsx', opties: { concept?: boolean } = {}): string {
  const delen = namen.length > 0 ? namen.map((n, i) => veiligeNaam(n, `persoon-${i + 1}`)) : ['rapport']
  return `fiscaal-rapport-${jaar}-${delen.join('-en-')}${opties.concept ? '-concept' : ''}.${extensie}`
}

/** Versie van de tool voor de verantwoording: '0.1.0', met de eerste zeven tekens van de commit als die bekend is. */
export function toolVersieTekst(versie: string, gitSha?: string | null): string {
  const sha = (gitSha ?? '').trim().replace(/[^0-9a-zA-Z]/g, '').slice(0, 7)
  return sha ? `${versie} (${sha})` : versie
}

const twee = (n: number) => String(n).padStart(2, '0')

/** Lokale datum en tijd als '2026-10-04T18:45' (zonder tijdzone), voor 'Berekend op'. */
export function lokaalTijdstip(d: Date): string {
  return `${d.getFullYear()}-${twee(d.getMonth() + 1)}-${twee(d.getDate())}T${twee(d.getHours())}:${twee(d.getMinutes())}`
}

/**
 * Past de samenlevingsvorm bij het fiscaal partnerschap van dit jaar? Gehuwden, geregistreerd partners en
 * samenwoners met een notarieel samenlevingscontract zijn in de regel fiscale partners; alleenstaand niet.
 * Samenwonend zonder contract kan beide zijn.
 */
export function pastBij(vorm: NonNullable<HuishoudenGegevens['samenlevingsvorm']>, partners: boolean): boolean {
  if (vorm === 'samenwonend') return true
  return partners ? vorm !== 'alleenstaand' : vorm === 'alleenstaand'
}
