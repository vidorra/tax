/**
 * Ronde 2 (A4): de lichte helpers van de JSON-import (grenzen, teksten, keuzes, het verzoek bouwen), zonder rekenkern
 * of validatie, zodat het overzicht ze kan laden zonder de engine. Het lezen van het bestand (`leesJsonExport`, met
 * valideerInvoer en opnieuw rekenen) staat in json.ts en laadt pas als je een bestand kiest. Puur.
 */
import type { DossierStatus } from '@/lib/dossier/status'
import { datumLang } from '@/lib/rapport/notatie'
import { opsomming } from './ongedaan'
import type { ActiefHerstelpunt, JsonFormaat, JsonImportJaar, JsonImportVerzoek, JsonImportVoorstel, JsonJaarActie } from './types'

/** De server leest hooguit zoveel bytes (body van POST /api/dossier/import). */
export const JSON_IMPORT_MAX_BYTES = 5_000_000
/** Zoveel validatiefouten per jaar tonen we, zoals de editor. */
export const MAX_FOUTEN = 12
/** Zoveel jaren in één verzoek (ruim boven het aantal jaren met parameters). */
export const MAX_JAREN = 20
/** Hoogste versie van het dossierformaat die deze tool kent. */
export const DOSSIER_VERSIE = 1

export const TEKST = {
  geenJson: 'Dit bestand is geen JSON. Kies het bestand dat je bij Alles exporteren of Download JSON hebt gekregen.',
  anderFormaat: 'Dit is geen export van deze tool.',
  nieuwer: 'Dit bestand komt uit een nieuwere versie van de tool. Werk de tool bij en probeer het opnieuw.',
  geenJaren: 'In dit bestand staan geen jaren.',
} as const

export interface JsonBronJaar {
  jaar: number
  variant: string | null
  status?: DossierStatus
  invoer: unknown
  accountant: unknown | null
  aangiftestaat: unknown | null
  bijgewerkt?: string
  /** Te betalen IB volgens de samenvatting in het bestand (alleen om te tonen, niet vertrouwd). */
  teBetalenIB?: number
}

/** Wat uit het bestand nodig is om het verzoek te bouwen (blijft in de browser). */
export interface JsonBron {
  formaat: JsonFormaat
  versie: number
  jaren: JsonBronJaar[]
  gegevens: unknown | null
}

export interface JsonBestaand {
  jaar: number
  /** ISO-tijdstip van de laatste opslag. */
  bijgewerkt: string
  teBetalenIB?: number
  /** Status in het dossier (Ingediend blijft Ingediend bij Vervangen). */
  status?: DossierStatus
}

/**
 * Status in het dossier na de import. Ingediend is een feit en wordt nooit stil teruggezet: stond het jaar in het
 * dossier op Ingediend, of zegt het bestand Ingediend, dan staat het daarna op Ingediend. Gecontroleerd wordt Concept,
 * omdat de controles met de huidige regels anders kunnen uitkomen; Concept blijft Concept.
 */
export function statusNaImport(uitBestand: DossierStatus | undefined, inDossier?: DossierStatus | null): DossierStatus {
  return uitBestand === 'ingediend' || inDossier === 'ingediend' ? 'ingediend' : 'concept'
}

const STATUS_LABEL: Record<DossierStatus, string> = { concept: 'Concept', gecontroleerd: 'Gecontroleerd', ingediend: 'Ingediend' }

/**
 * Wat de import met de status van een jaar doet, in gewone taal, voor het paneel vóór je bevestigt. Null als er niets
 * te melden is (een concept blijft een concept).
 */
export function statusOpmerking(jaar: number, actie: JsonJaarActie, uitBestand: DossierStatus | undefined, inDossier: DossierStatus | undefined): string | null {
  if (actie === 'overslaan') return null
  const na = statusNaImport(uitBestand, actie === 'vervangen' ? inDossier : undefined)
  if (actie === 'toevoegen') {
    if (uitBestand === 'ingediend') return `${jaar} komt op Ingediend te staan, zoals in het bestand.`
    if (uitBestand === 'gecontroleerd') return `${jaar} komt op Concept te staan: de controles kunnen met de huidige regels anders uitkomen.`
    return null
  }
  if (inDossier === 'ingediend' && uitBestand !== 'ingediend') return `${jaar} staat in je dossier op Ingediend en blijft daarop staan. De indiendatum blijft bewaard.`
  if (na === inDossier) return null
  if (na === 'ingediend') return `Na vervangen staat ${jaar} op Ingediend, zoals in het bestand.`
  return `Na vervangen staat ${jaar} op ${STATUS_LABEL[na]}${inDossier ? ` in plaats van ${STATUS_LABEL[inDossier]}` : ''}.`
}

export interface JsonKeuzes {
  acties: Record<number, JsonJaarActie>
  accountant: boolean
  aangiftestaat: boolean
  gegevens: boolean
}

/** Standaard: een nieuw jaar Toevoegen, een bestaand jaar Overslaan; accountant en vinkjes aan, persoonlijke gegevens uit. */
export function standaardKeuzes(voorstel: JsonImportVoorstel): JsonKeuzes {
  const acties: Record<number, JsonJaarActie> = {}
  for (const j of voorstel.jaren) acties[j.jaar] = j.standaard
  return { acties, accountant: true, aangiftestaat: true, gegevens: false }
}

/** Welke acties bij een jaar kunnen. */
export function mogelijkeActies(j: JsonImportJaar): JsonJaarActie[] {
  if (!j.mogelijk) return ['overslaan']
  return j.bestaat ? ['overslaan', 'vervangen'] : ['toevoegen', 'overslaan']
}

/** De jaren die worden geïmporteerd (Toevoegen of Vervangen, en mogelijk). */
export function teImporteren(voorstel: JsonImportVoorstel, keuzes: JsonKeuzes): number[] {
  return voorstel.jaren.filter((j) => j.mogelijk && mogelijkeActies(j).includes(keuzes.acties[j.jaar] ?? j.standaard) && (keuzes.acties[j.jaar] ?? j.standaard) !== 'overslaan').map((j) => j.jaar)
}

/**
 * Het verzoek aan de server: alleen de gekozen jaren, alleen de onderdelen waarvan de schakelaar aan staat.
 * Overgeslagen jaren en persoonlijke gegevens met de schakelaar uit gaan niet mee.
 */
export function bouwVerzoek(voorstel: JsonImportVoorstel, bron: JsonBron, keuzes: JsonKeuzes): JsonImportVerzoek {
  const jaren = teImporteren(voorstel, keuzes)
  const verzoek: JsonImportVerzoek = {
    formaat: bron.formaat,
    versie: bron.versie,
    jaren: bron.jaren
      .filter((j) => jaren.includes(j.jaar))
      .map((j) => {
        const actie = keuzes.acties[j.jaar] === 'vervangen' ? 'vervangen' : 'toevoegen'
        return {
          jaar: j.jaar,
          actie,
          invoer: j.invoer,
          variant: j.variant,
          ...(j.status ? { status: j.status } : {}),
          ...(keuzes.accountant && j.accountant !== null ? { accountant: j.accountant } : {}),
          ...(keuzes.aangiftestaat && j.aangiftestaat !== null ? { aangiftestaat: j.aangiftestaat } : {}),
        }
      }),
  }
  if (keuzes.gegevens && bron.gegevens !== null) verzoek.gegevens = bron.gegevens
  return verzoek
}

/** "1 jaar importeren", "2 jaren importeren"; zonder gekozen jaar alleen "Importeren" (de knop staat dan uit). */
export function knopTekst(aantal: number): string {
  if (aantal <= 0) return 'Importeren'
  return `${aantal} ${aantal === 1 ? 'jaar' : 'jaren'} importeren`
}

/**
 * De vaste regel op het overzicht zolang een import ongedaan kan worden gemaakt: "Import van 5 oktober 2026: 2025
 * vervangen en 2024 toegevoegd. Ongedaan maken kan tot 4 november 2026."
 */
export function herstelpuntTekst(h: ActiefHerstelpunt): string {
  const wat = [
    h.vervangen.length > 0 ? `${opsomming(h.vervangen.map(String))} vervangen` : null,
    h.toegevoegd.length > 0 ? `${opsomming(h.toegevoegd.map(String))} toegevoegd` : null,
    h.gegevens ? 'je persoonlijke gegevens vervangen' : null,
  ].filter((x): x is string => Boolean(x))
  return `Import van ${datumLang(h.aangemaakt)}${wat.length > 0 ? `: ${opsomming(wat)}` : ''}. Ongedaan maken kan tot ${datumLang(h.tot)}.`
}
