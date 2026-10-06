/**
 * POST /api/calc: rekent een HuishoudenInvoer door en geeft het HuishoudenResultaat terug.
 * Stateless, rate-limited (60 per minuut per IP), body maximaal 100 KB. Logt geen invoer.
 *
 * Het IP komt uit clientIp (lib/auth/api): het adres dat de CapRover-proxy achteraan
 * X-Forwarded-For zet, zodat een client de limiet niet omzeilt met een eigen X-Forwarded-For.
 * Vóór de engine draait controleren we de grenzen van de invoer (lijstlengtes, bedragen,
 * prototype-sleutels), zodat één verzoek de server niet seconden lang bezig kan houden.
 */
import { NextResponse } from 'next/server'
import { berekenHuishouden } from '@/lib/tax/engine'
import { MAX_BODY_BYTES, controleerVariant, maakRateLimiter, valideerInvoer } from '@/lib/calculator/api'
import { clientIp, leesTekst } from '@/lib/auth/api'
import { controleerGrenzen } from '@/lib/dossier/grenzen'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const limiet = maakRateLimiter({ max: 60, vensterMs: 60_000 })

const GEEN_CACHE = { 'Cache-Control': 'no-store' }

function fout(status: number, melding: string, extra: Record<string, unknown> = {}, headers: Record<string, string> = {}) {
  return NextResponse.json({ ok: false, fout: melding, ...extra }, { status, headers: { ...GEEN_CACHE, ...headers } })
}

export async function POST(req: Request) {
  const rl = limiet(clientIp(req))
  if (!rl.toegestaan) {
    return fout(429, 'Te veel verzoeken. Probeer het over een minuut opnieuw.', {}, { 'Retry-After': String(Math.ceil(rl.resetOver / 1000)) })
  }

  const gelezen = await leesTekst(req, MAX_BODY_BYTES)
  if ('fout' in gelezen) {
    return gelezen.fout === 'te-groot' ? fout(413, `De body is groter dan ${MAX_BODY_BYTES / 1024} KB.`) : fout(400, 'De body kon niet worden gelezen.')
  }
  const tekst = gelezen.tekst
  if (!tekst.trim()) return fout(400, 'Lege body. Stuur een HuishoudenInvoer als JSON.')

  let data: unknown
  try {
    data = JSON.parse(tekst)
  } catch {
    return fout(400, 'De body is geen geldige JSON.')
  }

  const grenzen = controleerGrenzen(data)
  if (grenzen.length > 0) return fout(400, 'De invoer valt buiten de grenzen van de calculator.', { fouten: grenzen })

  const validatie = valideerInvoer(data)
  if (!validatie.ok) return fout(400, 'De invoer heeft niet de verwachte vorm.', { fouten: validatie.fouten })

  const variant = new URL(req.url).searchParams.get('variant') ?? validatie.invoer.variant ?? undefined
  const variantFout = controleerVariant(validatie.invoer.jaar, variant || undefined)
  if (variantFout) return fout(400, variantFout)

  try {
    const resultaat = berekenHuishouden(validatie.invoer, { variant: variant || undefined })
    return NextResponse.json(resultaat, { headers: { ...GEEN_CACHE, 'X-RateLimit-Remaining': String(rl.resterend) } })
  } catch {
    // Geen melding van de engine doorgeven: die kan bedragen uit de invoer bevatten.
    return fout(400, 'De berekening is mislukt. Controleer de ingevulde bedragen en datums.')
  }
}

export function GET() {
  return fout(405, 'Gebruik POST met een HuishoudenInvoer als JSON-body.', {}, { Allow: 'POST' })
}
