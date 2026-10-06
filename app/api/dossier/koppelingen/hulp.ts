/**
 * Gedeelde afhandeling voor /api/dossier/koppelingen/*: fouten van Moneybird worden 502 met de
 * Nederlandse uitleg, fouten van de opslag krijgen hun eigen status. Nooit het token of bedragen loggen.
 */
import type { NextResponse } from 'next/server'
import { fout } from '@/lib/auth/api'
import { maakRateLimiter, type RateLimiter } from '@/lib/auth/rate-limit'
import { MoneybirdFout } from '@/lib/moneybird/client'
import { ImportFout } from '@/lib/moneybird/import'
import { KoppelingFout, koppelingIdUitPad, type KoppelingId } from '@/lib/moneybird/opslag'

export const BODY_KLEIN = 2_000
export const BODY_INDELING = 200_000

/** Zet bekende fouten om in een response; andere fouten gaan door naar metDossier (500 zonder details). */
export async function metKoppelingFouten(f: () => Promise<NextResponse>): Promise<NextResponse> {
  try {
    return await f()
  } catch (e) {
    if (e instanceof MoneybirdFout) return fout(502, e.melding, { moneybirdStatus: e.status })
    if (e instanceof KoppelingFout) return fout(e.status, e.message)
    if (e instanceof ImportFout) return fout(422, e.message)
    throw e
  }
}

export const onbekendeKoppeling = () => fout(404, 'Deze koppeling bestaat niet (meer).')

export async function idUitParams(params: Promise<{ id: string }>): Promise<KoppelingId | null> {
  return koppelingIdUitPad((await params).id)
}

const g = globalThis as unknown as { __ibMbImportLimiter?: RateLimiter; __ibMbToevoegLimiter?: RateLimiter }

/** Imports per huishouden: 10 per 5 minuten, bovenop de limiet van Moneybird zelf (150 verzoeken per 5 minuten). */
export function importLimiter(): RateLimiter {
  return (g.__ibMbImportLimiter ??= maakRateLimiter({ max: 10, vensterMs: 5 * 60 * 1000 }))
}

/** Nieuwe koppelingen (elk een controle bij Moneybird): 10 per 15 minuten per huishouden. */
export function toevoegLimiter(): RateLimiter {
  return (g.__ibMbToevoegLimiter ??= maakRateLimiter({ max: 10, vensterMs: 15 * 60 * 1000 }))
}

export function teVaak(wachtSeconden: number): NextResponse {
  return fout(429, `Te veel verzoeken achter elkaar. Probeer het over ${Math.ceil(wachtSeconden / 60)} minuut${wachtSeconden > 60 ? 'en' : ''} opnieuw.`, {}, { 'Retry-After': String(wachtSeconden) })
}
