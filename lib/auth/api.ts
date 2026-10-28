/**
 * Hulpfuncties voor de API-routes van auth en dossier: JSON-fouten in het Nederlands,
 * 503 als het dossier niet is ingericht, 401 zonder geldige sessie. Nooit request bodies loggen.
 */
import { NextResponse } from 'next/server'
import { dbFoutSoort, type DbFoutSoort } from '@/lib/db'
import { configStatus, NIET_GECONFIGUREERD_MELDING } from './config'
import { getSessie, sessieNogGeldig } from './server'
import { gebruikerOpId } from './gebruiker'

const GEEN_CACHE = { 'Cache-Control': 'no-store' }

export function json<T>(data: T, status = 200, extraHeaders: Record<string, string> = {}): NextResponse {
  return NextResponse.json(data, { status, headers: { ...GEEN_CACHE, ...extraHeaders } })
}

export function fout(status: number, melding: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}): NextResponse {
  return json({ fout: melding, ...extra }, status, headers)
}

/** 503 als AUTH_SECRET of DOSSIER_KEY ontbreekt of de map van de database niet schrijfbaar is (DATABASE_PATH); anders null. */
export function nietGeconfigureerd(): NextResponse | null {
  const s = configStatus()
  if (s.geconfigureerd) return null
  return fout(503, NIET_GECONFIGUREERD_MELDING, { ontbreekt: s.ontbreekt })
}

export type BodyFout = 'te-groot' | 'onleesbaar'

/**
 * Leest de body als tekst en stopt zodra er meer dan `maxBytes` bytes binnen zijn. Zo kan een
 * body zonder Content-Length (chunked) het geheugen niet vullen; Next.js begrenst route handlers niet zelf.
 */
export async function leesTekst(req: Request, maxBytes: number): Promise<{ tekst: string } | { fout: BodyFout }> {
  const lengte = Number(req.headers.get('content-length') ?? '0')
  if (Number.isFinite(lengte) && lengte > maxBytes) return { fout: 'te-groot' }
  if (!req.body) return { tekst: '' }
  const lezer = req.body.getReader()
  const delen: Uint8Array[] = []
  let totaal = 0
  try {
    for (;;) {
      const { done, value } = await lezer.read()
      if (done) break
      totaal += value.byteLength
      if (totaal > maxBytes) {
        await lezer.cancel().catch(() => undefined)
        return { fout: 'te-groot' }
      }
      delen.push(value)
    }
  } catch {
    return { fout: 'onleesbaar' }
  }
  try {
    return { tekst: new TextDecoder('utf-8', { fatal: true }).decode(Buffer.concat(delen)) }
  } catch {
    return { fout: 'onleesbaar' }
  }
}

/** Leest de JSON-body met een maximale grootte in bytes. Geeft null bij ongeldige of te grote invoer. */
export async function leesJson<T = unknown>(req: Request, maxBytes = 1_000_000): Promise<T | null> {
  const r = await leesTekst(req, maxBytes)
  if ('fout' in r) return null
  try {
    return JSON.parse(r.tekst) as T
  } catch {
    return null
  }
}

/**
 * IP-adres van de client voor rate limiting.
 *
 * Aanname: de app draait achter de nginx van CapRover, die het adres van de verbinding achteraan
 * X-Forwarded-For toevoegt ($proxy_add_x_forwarded_for). Alles links daarvan stuurt de client zelf
 * mee en is dus te vervalsen. We nemen daarom het adres op positie TRUSTED_PROXY_HOPS van rechts
 * (standaard 1: alleen CapRover; zet 2 als er nog een proxy zoals Cloudflare voor staat).
 * Zonder X-Forwarded-For valt de functie terug op X-Real-IP. Draait de app zonder proxy direct aan
 * internet, dan zijn beide headers vervalsbaar en is de limiet per IP niet betrouwbaar.
 */
export function clientIp(req: Request | { headers: Headers }): string {
  const doorgestuurd = req.headers.get('x-forwarded-for')
  if (doorgestuurd) {
    const delen = doorgestuurd.split(',').map((d) => d.trim()).filter(Boolean)
    const hops = Math.max(1, Math.floor(Number(process.env.TRUSTED_PROXY_HOPS ?? '1')) || 1)
    const ip = delen[Math.max(0, delen.length - hops)]
    if (ip) return ip.slice(0, 100)
  }
  return req.headers.get('x-real-ip')?.trim().slice(0, 100) || 'onbekend'
}

/**
 * Weigert wijzigende verzoeken die niet van deze site zelf komen (CSRF). SameSite=Lax beschermt niet
 * tegen andere subdomeinen van hetzelfde domein (bijvoorbeeld andere apps op dezelfde CapRover),
 * die tellen voor de browser als "same-site". Moderne browsers sturen Sec-Fetch-Site mee; dan beslist
 * die header (alleen same-origin of none). Zonder die header vergelijken we Origin met de host, en
 * verzoeken zonder beide headers (curl, heel oude browsers) laten we door.
 */
export function herkomstFout(req: Request): NextResponse | null {
  const methode = req.method.toUpperCase()
  if (methode === 'GET' || methode === 'HEAD' || methode === 'OPTIONS') return null
  const weiger = () => fout(403, 'Dit verzoek komt niet van deze site en is geweigerd.')
  const site = req.headers.get('sec-fetch-site')
  if (site) return site === 'same-origin' || site === 'none' ? null : weiger()
  const origin = req.headers.get('origin')
  if (!origin) return null
  let host: string
  try {
    host = new URL(origin).host
  } catch {
    return weiger()
  }
  const verwacht = (req.headers.get('x-forwarded-host') ?? req.headers.get('host') ?? new URL(req.url).host).split(',')[0].trim()
  return host === verwacht ? null : weiger()
}

/**
 * Ingelogde gebruiker (token, bestaand account met 2FA en een sessie die niet door uitloggen is
 * ingetrokken), of een 401-response.
 */
export async function vereisGebruiker(): Promise<{ userId: number } | NextResponse> {
  const sessie = await getSessie()
  if (!sessie) return fout(401, 'Je bent niet ingelogd of je sessie is verlopen. Log opnieuw in.')
  const gebruiker = await gebruikerOpId(sessie.userId)
  if (!gebruiker || !gebruiker.totpEnabled) return fout(401, 'Dit account bestaat niet meer. Log opnieuw in.')
  if (!sessieNogGeldig(sessie, gebruiker)) return fout(401, 'Je bent niet ingelogd of je sessie is verlopen. Log opnieuw in.')
  return { userId: gebruiker.id }
}

/** Ingelogde beheerder, of 401 (niet ingelogd) of 403 (geen beheerder). */
export async function vereisBeheerder(): Promise<{ userId: number; email: string; naam: string | null } | NextResponse> {
  const sessie = await getSessie()
  if (!sessie) return fout(401, 'Je bent niet ingelogd of je sessie is verlopen. Log opnieuw in.')
  const gebruiker = await gebruikerOpId(sessie.userId)
  if (!gebruiker || !gebruiker.totpEnabled || !sessieNogGeldig(sessie, gebruiker)) return fout(401, 'Je bent niet ingelogd of je sessie is verlopen. Log opnieuw in.')
  if (gebruiker.rol !== 'beheerder') return fout(403, 'Alleen een beheerder kan dit.')
  return { userId: gebruiker.id, email: gebruiker.email, naam: gebruiker.naam }
}

/**
 * Meldingen bij databasefouten die de gebruiker of de beheerder zelf kan oplossen. Een geschonden UNIQUE of CHECK is
 * een fout in de app en krijgt de gewone melding.
 */
const DB_MELDINGEN: Partial<Record<DbFoutSoort, string>> = {
  'schema-ontbreekt': 'De databasetabellen bestaan nog niet of zijn verouderd. Voer npm run db:migrate uit.',
  'niet-bereikbaar': 'Het databasebestand is niet te openen of te schrijven. Controleer DATABASE_PATH en de rechten op de map.',
  bezet: 'De database is even bezet, bijvoorbeeld door een back-up of herstel. Probeer het zo opnieuw.',
}

/** De melding bij een databasefout (zie DB_MELDINGEN), of null als het geen fout is die de gebruiker kan oplossen. */
export function databaseFoutMelding(e: unknown): string | null {
  const soort = dbFoutSoort(e)
  return soort ? (DB_MELDINGEN[soort] ?? null) : null
}

/** Foutcode voor de log (bijvoorbeeld SQLITE_BUSY of EACCES), ook uit `cause`; nooit de melding zelf. */
function foutCode(e: unknown): string | null {
  let f: unknown = e
  for (let i = 0; f && typeof f === 'object' && i < 5; i++, f = (f as { cause?: unknown }).cause) {
    const code = (f as { code?: unknown }).code
    if (typeof code === 'string' && /^[A-Z][A-Z0-9_]{1,40}$/.test(code)) return code
  }
  return null
}

/** Vangt onverwachte fouten zonder details of invoer te loggen. */
export function serverFout(e: unknown, context: string): NextResponse {
  const naam = e instanceof Error ? e.name : 'onbekend'
  // Drizzle verpakt databasefouten; de code van SQLite staat dan in `cause`.
  const code = foutCode(e)
  console.error(`[${context}] fout: ${naam}${code ? ` (${code})` : ''}`)
  if (naam === 'OntsleutelFout') return fout(500, 'De opgeslagen gegevens konden niet worden ontsleuteld. Controleer of DOSSIER_KEY dezelfde sleutel is als waarmee ze zijn opgeslagen.')
  const db = databaseFoutMelding(e)
  if (db) return fout(503, db)
  return fout(500, 'Er ging iets mis op de server. Probeer het opnieuw.')
}
