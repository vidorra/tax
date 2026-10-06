/**
 * Ronde 2 (A4): het land van ingehouden belasting op een dividend of rente. Volgorde (taak-A4 5):
 *  1. wat de broker zelf meldt (IBKR "... - US Tax"; de Hyundai-GDR met een US-ISIN had "- KR Tax");
 *  2. het ISIN-voorvoegsel (niet bij XS en EU: internationale ISIN's zeggen niets over het land);
 *  3. de gebruiker: past het ingehouden percentage niet bij het ISIN-land (meer dan `LAND_MARGE` naast zowel het
 *     statutaire tarief als het verdragstarief uit de landentabel), dan een vraag "Uit welk land komt dit dividend?".
 *
 * Geen percentages in lib/import: de tarieven komen uit `BRONBELASTING_LANDEN` (lib/tax/years/data), die als argument
 * binnenkomt zodat tests een eigen tabel kunnen geven. Met een lege tabel komt er geen vraag op grond van het percentage.
 */
import type { BronbelastingLand } from '@/lib/tax/types'
import { BRONBELASTING_LANDEN, landUitTabel } from '@/lib/tax/years/data/bronbelasting-landen'

/** Tooltolerantie (geen fiscaal getal): 2 procentpunt naast het tarief uit de tabel telt nog als passend. */
export const LAND_MARGE = 0.02

/** ISIN: twee letters, negen tekens, een controlecijfer. */
export const ISIN_PATROON = /^[A-Z]{2}[A-Z0-9]{9}\d$/

/** ISIN-voorvoegsels die geen land zijn. */
const GEEN_LAND = new Set(['XS', 'EU', 'QS', 'XA', 'XB', 'XC', 'XD'])

/** Land uit een ISIN (ISO 3166-1 alpha-2), of null bij een ongeldig of internationaal ISIN. */
export function landUitIsin(isin: string | undefined | null): string | null {
  const s = isin?.trim().toUpperCase() ?? ''
  if (!ISIN_PATROON.test(s)) return null
  const land = s.slice(0, 2)
  return GEEN_LAND.has(land) ? null : land
}

/** Land uit de omschrijving van de broker: IBKR "Cash Dividend USD 0.30 per Share - US Tax". */
export function landUitBrokerTekst(tekst: string | undefined | null): string | null {
  const m = /[-–]\s*([A-Z]{2})\s+Tax\b/.exec(tekst ?? '')
  return m ? m[1] : null
}

export interface LandUitkomst {
  /** ISO-code; '' als de gebruiker moet kiezen. */
  land: string
  bron: 'broker' | 'isin' | 'gebruiker' | 'onbekend'
  /** Het percentage past niet bij het ISIN-land: vraag het de gebruiker. */
  vraag?: { isinLand: string; percentage: number }
}

/**
 * Bepaalt het land van ingehouden belasting. `percentage` is ingehouden / bruto (fractie); zonder percentage of zonder
 * het land in de tabel komt er geen vraag. Een antwoord van de gebruiker gaat altijd voor.
 */
export function bepaalLand(
  args: { brokerLand?: string | null; isin?: string | null; percentage?: number | null; antwoord?: string | null },
  opties: { tabel?: readonly BronbelastingLand[] } = {},
): LandUitkomst {
  const tabel = opties.tabel ?? BRONBELASTING_LANDEN
  if (args.antwoord && /^[A-Z]{2}$/.test(args.antwoord)) return { land: args.antwoord, bron: 'gebruiker' }
  if (args.brokerLand) return { land: args.brokerLand, bron: 'broker' }
  const isinLand = landUitIsin(args.isin)
  if (!isinLand) return { land: '', bron: 'onbekend' }
  const pct = args.percentage
  const rij = landUitTabel(isinLand, tabel)
  if (rij && pct !== undefined && pct !== null && Number.isFinite(pct) && pct > 0) {
    const tarieven = [rij.dividend.ingehouden, rij.dividend.verdrag].filter((t): t is number => typeof t === 'number')
    const past = tarieven.some((t) => Math.abs(pct - t) <= LAND_MARGE + 1e-9)
    if (!past) return { land: '', bron: 'onbekend', vraag: { isinLand, percentage: pct } }
  }
  return { land: isinLand, bron: 'isin' }
}

/**
 * Nederlandse namen voor de keuzelijst en de teksten (geen tarieven). Eerst de landen die het vaakst voorkomen; de
 * landentabel (A5) gaat voor als die een naam heeft.
 */
export const LANDNAMEN: Readonly<Record<string, string>> = {
  US: 'Verenigde Staten',
  GB: 'Verenigd Koninkrijk',
  DE: 'Duitsland',
  FR: 'Frankrijk',
  CH: 'Zwitserland',
  BE: 'België',
  IE: 'Ierland',
  LU: 'Luxemburg',
  ES: 'Spanje',
  IT: 'Italië',
  DK: 'Denemarken',
  SE: 'Zweden',
  NO: 'Noorwegen',
  FI: 'Finland',
  CA: 'Canada',
  JP: 'Japan',
  AU: 'Australië',
  AT: 'Oostenrijk',
  PT: 'Portugal',
  HK: 'Hongkong',
  SG: 'Singapore',
  KR: 'Zuid-Korea',
  TW: 'Taiwan',
  CN: 'China',
  IN: 'India',
  BR: 'Brazilië',
  ZA: 'Zuid-Afrika',
  MX: 'Mexico',
  NZ: 'Nieuw-Zeeland',
  IL: 'Israël',
  NL: 'Nederland',
}

/** Naam van een land, of de code zelf. */
export function landNaam(code: string, tabel: readonly BronbelastingLand[] = BRONBELASTING_LANDEN): string {
  if (!code) return 'onbekend land'
  return landUitTabel(code, tabel)?.naam ?? LANDNAMEN[code.toUpperCase()] ?? code.toUpperCase()
}

/** Keuzelijst van landen (zonder Nederland: dat is dividendbelasting, geen bronbelasting), eerst de opgegeven codes. */
export function landKeuzes(eerst: string[] = [], tabel: readonly BronbelastingLand[] = BRONBELASTING_LANDEN): Array<{ value: string; label: string }> {
  const codes = new Set<string>([...eerst, ...tabel.map((l) => l.code), ...Object.keys(LANDNAMEN)].filter((c) => c && c !== 'NL'))
  const voorop = eerst.filter((c) => codes.has(c))
  const rest = [...codes].filter((c) => !voorop.includes(c)).sort((a, b) => landNaam(a, tabel).localeCompare(landNaam(b, tabel), 'nl'))
  return [...new Set([...voorop, ...rest])].map((c) => ({ value: c, label: landNaam(c, tabel) }))
}
