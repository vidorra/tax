/**
 * Hulpfuncties voor de API-routes van auth en dossier: JSON-fouten in het Nederlands,
 * 503 als het dossier niet is ingericht, 401 zonder geldige sessie. Nooit request bodies loggen.
 */
import { NextResponse } from 'next/server'
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

/** 503 als DATABASE_URL, AUTH_SECRET of DOSSIER_KEY ontbreekt; anders null. */
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

/** Vangt onverwachte fouten zonder details of invoer te loggen. */
export function serverFout(e: unknown, context: string): NextResponse {
  const naam = e instanceof Error ? e.name : 'onbekend'
  // Drizzle verpakt databasefouten; de pg-code staat dan in `cause`.
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code
  console.error(`[${context}] fout: ${naam}${code ? ` (${code})` : ''}`)
  if (naam === 'OntsleutelFout') return fout(500, 'De opgeslagen gegevens konden niet worden ontsleuteld. Controleer of DOSSIER_KEY dezelfde sleutel is als waarmee ze zijn opgeslagen.')
  if (code === '42P01' || code === '42703') return fout(503, 'De databasetabellen bestaan nog niet of zijn verouderd. Voer npm run db:migrate uit.')
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === '28P01' || code === '3D000') {
    return fout(503, 'De database is niet bereikbaar. Controleer DATABASE_URL.')
  }
  return fout(500, 'Er ging iets mis op de server. Probeer het opnieuw.')
}
