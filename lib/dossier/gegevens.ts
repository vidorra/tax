/**
 * Persoonlijke gegevens van het huishouden die niet in de berekening zitten (HuishoudenGegevens uit
 * lib/rapport/model.ts): adres en samenlevingsvorm, voor het voorblad en hoofdstuk 1 van het rapport.
 *
 * Opslag: versleuteld in households.gegevens_enc, met de context van het huishouden als AAD
 * (aad.huishouden in opslag.ts), zodat een gekopieerde ciphertext in een ander huishouden niet opent.
 * Een PUT vervangt het geheel; wat niet meekomt, is daarna leeg.
 *
 * Bewust geen BSN: de tool slaat het niet op en toont het niet. Onbekende velden, ook 'bsn', worden
 * geweigerd. Server-only (database); schoonGegevens en gegevensUitOpslag zijn puur.
 */
import { and, eq } from 'drizzle-orm'
import { getDb } from '@/lib/db'
import { households } from '@/lib/db/schema'
import { ontsleutel, versleutel } from '@/lib/crypto'
import type { HuishoudenGegevens } from '@/lib/rapport/model'
import { aad } from './opslag'

export type Samenlevingsvorm = NonNullable<HuishoudenGegevens['samenlevingsvorm']>

/** Record, zodat een nieuwe samenlevingsvorm in het model hier niet vergeten wordt. */
const VORMEN: Readonly<Record<Samenlevingsvorm, true>> = {
  gehuwd: true,
  'geregistreerd-partner': true,
  'samenwonend-met-contract': true,
  samenwonend: true,
  alleenstaand: true,
}
export const SAMENLEVINGSVORMEN = Object.keys(VORMEN) as Samenlevingsvorm[]

export const GEGEVENS_GRENZEN = { straat: 100, plaats: 80 } as const

/** Wat GET en PUT /api/dossier/gegevens teruggeven. */
export interface GegevensAntwoord {
  gegevens: HuishoudenGegevens
  /** ISO-tijdstip van de laatste wijziging van het huishouden. */
  updatedAt: string
}

/** Wie de gegevens leest of schrijft; gelijk aan DossierContext uit route.ts. */
export interface GegevensEigenaar {
  userId: number
  householdId: number
}

const isObj = (x: unknown): x is Record<string, unknown> => typeof x === 'object' && x !== null && !Array.isArray(x)
/** Stuurtekens horen niet in een adres; tabs en regeleinden worden gewone spaties. */
// eslint-disable-next-line no-control-regex
const STUURTEKENS = /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f-\u009f]/

/** Spaties aan de randen weg en reeksen spaties terug naar één. */
const netjes = (s: string) => s.trim().replace(/\s+/g, ' ')

/** '1234ab' en '1234 ab' worden '1234 AB'; null als het geen Nederlandse postcode is. */
export function normaliseerPostcode(ruw: string): string | null {
  const s = ruw.replace(/\s+/g, '').toUpperCase()
  const m = /^([1-9]\d{3})([A-Z]{2})$/.exec(s)
  return m ? `${m[1]} ${m[2]}` : null
}

/**
 * Controleert en normaliseert gegevens uit de API. Geeft de schone gegevens, of de fouten als
 * 'pad: melding' (paden zonder waarden, dus zonder persoonsgegevens in een foutmelding).
 * Een adres is alles of niets: drie lege velden betekenen geen adres.
 */
export function schoonGegevens(x: unknown): { gegevens: HuishoudenGegevens } | { fouten: string[] } {
  if (!isObj(x)) return { fouten: ['gegevens: moet een object zijn'] }
  const fouten: string[] = []
  const uit: HuishoudenGegevens = {}
  for (const k of Object.keys(x)) if (k !== 'adres' && k !== 'samenlevingsvorm') fouten.push(`${k.slice(0, 40)}: onbekend veld`)

  if (x.adres !== undefined && x.adres !== null) {
    const a = x.adres
    if (!isObj(a)) fouten.push('adres: moet een object zijn')
    else {
      for (const k of Object.keys(a)) if (k !== 'straat' && k !== 'postcode' && k !== 'plaats') fouten.push(`adres.${k.slice(0, 40)}: onbekend veld`)
      const veld = (naam: 'straat' | 'postcode' | 'plaats'): string | null => {
        const v = a[naam]
        if (v === undefined || v === null) return ''
        if (typeof v !== 'string') {
          fouten.push(`adres.${naam}: moet tekst zijn`)
          return null
        }
        if (STUURTEKENS.test(v)) {
          fouten.push(`adres.${naam}: bevat tekens die niet in een adres horen`)
          return null
        }
        return netjes(v)
      }
      const straat = veld('straat')
      const postcode = veld('postcode')
      const plaats = veld('plaats')
      if (straat !== null && postcode !== null && plaats !== null && (straat || postcode || plaats)) {
        if (!straat) fouten.push('adres.straat: vul straat en huisnummer in')
        else if (straat.length > GEGEVENS_GRENZEN.straat) fouten.push(`adres.straat: maximaal ${GEGEVENS_GRENZEN.straat} tekens`)
        if (!plaats) fouten.push('adres.plaats: vul de woonplaats in')
        else if (plaats.length > GEGEVENS_GRENZEN.plaats) fouten.push(`adres.plaats: maximaal ${GEGEVENS_GRENZEN.plaats} tekens`)
        const pc = postcode ? normaliseerPostcode(postcode) : null
        if (!postcode) fouten.push('adres.postcode: vul de postcode in')
        else if (!pc) fouten.push('adres.postcode: vul een Nederlandse postcode in, zoals 1234 AB')
        if (straat && plaats && pc && straat.length <= GEGEVENS_GRENZEN.straat && plaats.length <= GEGEVENS_GRENZEN.plaats) uit.adres = { straat, postcode: pc, plaats }
      }
    }
  }

  if (x.samenlevingsvorm !== undefined && x.samenlevingsvorm !== null) {
    const v = x.samenlevingsvorm
    if (typeof v !== 'string' || !Object.prototype.hasOwnProperty.call(VORMEN, v)) fouten.push(`samenlevingsvorm: kies uit ${SAMENLEVINGSVORMEN.join(', ')}`)
    else uit.samenlevingsvorm = v as Samenlevingsvorm
  }

  return fouten.length > 0 ? { fouten } : { gegevens: uit }
}

/**
 * Gegevens zoals ze ontsleuteld uit de database komen: alleen de bekende, geldige delen. Een oud of
 * leeg object ({} bij een nieuw huishouden) geeft lege gegevens; een ongeldig deel valt weg.
 */
export function gegevensUitOpslag(x: unknown): HuishoudenGegevens {
  if (!isObj(x)) return {}
  const uit: HuishoudenGegevens = {}
  const adres = schoonGegevens({ adres: x.adres })
  if ('gegevens' in adres && adres.gegevens.adres) uit.adres = adres.gegevens.adres
  const vorm = schoonGegevens({ samenlevingsvorm: x.samenlevingsvorm })
  if ('gegevens' in vorm && vorm.gegevens.samenlevingsvorm) uit.samenlevingsvorm = vorm.gegevens.samenlevingsvorm
  return uit
}

const vanEigenaar = (e: GegevensEigenaar) => and(eq(households.id, e.householdId), eq(households.userId, e.userId))

/** De gegevens van dit huishouden, ontsleuteld; null als het huishouden niet (meer) van deze gebruiker is. */
export async function laadGegevens(e: GegevensEigenaar): Promise<GegevensAntwoord | null> {
  const [rij] = await getDb().select({ gegevensEnc: households.gegevensEnc, updatedAt: households.updatedAt }).from(households).where(vanEigenaar(e)).limit(1)
  if (!rij) return null
  return { gegevens: gegevensUitOpslag(ontsleutel<unknown>(rij.gegevensEnc, aad.huishouden(e.userId))), updatedAt: rij.updatedAt.toISOString() }
}

/** Vervangt de gegevens (al gecontroleerd met schoonGegevens). Geeft het tijdstip, of null zonder huishouden. */
export async function bewaarGegevens(e: GegevensEigenaar, gegevens: HuishoudenGegevens): Promise<string | null> {
  const nu = new Date()
  const rijen = await getDb()
    .update(households)
    .set({ gegevensEnc: versleutel(gegevens, aad.huishouden(e.userId)), updatedAt: nu })
    .where(vanEigenaar(e))
    .returning({ updatedAt: households.updatedAt })
  return rijen[0] ? rijen[0].updatedAt.toISOString() : null
}
