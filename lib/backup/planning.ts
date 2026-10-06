/**
 * Planning van de geplande back-up: welk moment is aan de beurt, hoe lang je het nog mag inhalen,
 * wanneer de volgende komt en hoe lang je wacht na een mislukte poging.
 *
 * Puur: geen I/O en geen Date.now(). Het tijdstip `nu` komt altijd van de aanroeper. Alle datums
 * zijn kalenderdatums in Europe/Amsterdam als 'JJJJ-MM-DD', zodat 1 februari om 00:30 's nachts
 * (23:30 UTC op 31 januari) al als 1 februari telt.
 */
import { formatDatum } from '../../components/ui/format'

/** Momenten per jaar als 'MM-DD', oplopend. */
export const BACKUP_MOMENTEN = ['02-01', '08-01'] as const

/** Een gemist moment mag je inhalen zolang er minder dan dit aantal dagen voorbij is. */
export const INHAALDAGEN = 30

export const TIJDZONE = 'Europe/Amsterdam'

const MS_PER_DAG = 86_400_000

export interface AmsterdamDelen {
  jaar: string
  maand: string
  dag: string
  /** '00' tot en met '23'. */
  uur: string
  minuut: string
}

let formatter: Intl.DateTimeFormat | null = null

function amsterdamFormatter(): Intl.DateTimeFormat {
  formatter ??= new Intl.DateTimeFormat('en-GB', {
    timeZone: TIJDZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  })
  return formatter
}

/** Datum en tijd van een tijdstip in Europe/Amsterdam, als tekst met voorloopnullen. */
export function amsterdamDelen(nu: Date): AmsterdamDelen {
  if (!(nu instanceof Date) || Number.isNaN(nu.getTime())) throw new RangeError('Ongeldig tijdstip.')
  const delen: Partial<Record<Intl.DateTimeFormatPartTypes, string>> = {}
  for (const deel of amsterdamFormatter().formatToParts(nu)) delen[deel.type] = deel.value
  const { year, month, day, hour, minute } = delen
  if (!year || !month || !day || !hour || !minute) throw new RangeError('Tijdstip is niet om te zetten naar Amsterdamse tijd.')
  return { jaar: year.padStart(4, '0'), maand: month, dag: day, uur: hour === '24' ? '00' : hour, minuut: minute }
}

/** Kalenderdatum in Europe/Amsterdam als 'JJJJ-MM-DD'. */
export function amsterdamDatum(nu: Date): string {
  const { jaar, maand, dag } = amsterdamDelen(nu)
  return `${jaar}-${maand}-${dag}`
}

function dagnummer(datum: string): number {
  const [j, m, d] = datum.split('-').map(Number)
  return Date.UTC(j, m - 1, d) / MS_PER_DAG
}

function momentenIn(jaar: number): string[] {
  return BACKUP_MOMENTEN.map((md) => `${jaar}-${md}`)
}

export interface ActueelMoment {
  /** 'JJJJ-MM' van het moment, bijvoorbeeld '2027-02'. Dit is de sleutel van de geplande run. */
  periode: string
  /** Het moment als 'JJJJ-MM-DD'. */
  datum: string
  /** Kalenderdagen sinds het moment; 0 op de dag zelf. */
  dagenGeleden: number
  /** true zolang dagenGeleden kleiner is dan INHAALDAGEN. */
  binnenInhaaltermijn: boolean
}

/**
 * Het meest recente moment op of vóór de Amsterdamse datum van `nu`.
 * Op 15 januari is dat 1 augustus van het jaar ervoor.
 */
export function actueelMoment(nu: Date): ActueelMoment {
  const vandaag = amsterdamDatum(nu)
  const jaar = Number(vandaag.slice(0, 4))
  const datum = [...momentenIn(jaar - 1), ...momentenIn(jaar)].filter((m) => m <= vandaag).sort().at(-1)!
  const dagenGeleden = dagnummer(vandaag) - dagnummer(datum)
  return { periode: datum.slice(0, 7), datum, dagenGeleden, binnenInhaaltermijn: dagenGeleden < INHAALDAGEN }
}

/**
 * Volgende geplande datum als 'JJJJ-MM-DD'. Ligt het actuele moment nog binnen de inhaaltermijn en
 * is die periode nog niet gedaan, dan is dat moment het antwoord: de back-up staat nu klaar (ook als
 * de datum al een paar dagen voorbij is). Anders het eerste moment na vandaag.
 */
export function volgendMoment(nu: Date, periodeGedaan: (periode: string) => boolean): string {
  const actueel = actueelMoment(nu)
  if (actueel.binnenInhaaltermijn && !periodeGedaan(actueel.periode)) return actueel.datum
  const vandaag = amsterdamDatum(nu)
  const jaar = Number(vandaag.slice(0, 4))
  return [...momentenIn(jaar), ...momentenIn(jaar + 1)].filter((m) => m > vandaag).sort()[0]
}

/**
 * Wachttijd in uren vóór de volgende poging, na `pogingen` mislukte pogingen:
 * 1, 2, 4, 8, 16 en daarna steeds 24. Zonder pogingen is er geen wachttijd.
 * In SQL: least(power(2, pogingen - 1), 24).
 */
export function wachttijdUren(pogingen: number): number {
  if (!Number.isFinite(pogingen) || pogingen < 1) return 0
  return Math.min(2 ** (Math.floor(pogingen) - 1), 24)
}

/** '2027-02-01' wordt '1 februari 2027'. */
export function datumNLLang(datum: string): string {
  return formatDatum(datum)
}
