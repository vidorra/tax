/**
 * Gedeelde afhandeling voor /api/beheer/*: configuratie, CSRF en de rol beheerder vooraf; AccountFout wordt de eigen
 * status met melding, andere fouten 500 zonder details. Nooit e-mailadressen, tokens of request bodies loggen.
 */
import type { NextResponse } from 'next/server'
import { fout, herkomstFout, nietGeconfigureerd, serverFout, vereisBeheerder } from '@/lib/auth/api'
import { AccountFout } from '@/lib/auth/gebruiker'

export type Beheerder = { userId: number; email: string; naam: string | null }

export async function metBeheerder(context: string, req: Request, f: (b: Beheerder) => Promise<NextResponse>): Promise<NextResponse> {
  const niet = nietGeconfigureerd()
  if (niet) return niet
  const herkomst = herkomstFout(req)
  if (herkomst) return herkomst
  try {
    const b = await vereisBeheerder()
    if (!('userId' in b)) return b
    return await f(b)
  } catch (e) {
    if (e instanceof AccountFout) return fout(e.status, e.message)
    return serverFout(e, context)
  }
}

/** Id uit de URL: een positief geheel getal, anders null. */
export async function idUit(params: Promise<{ id: string }>): Promise<number | null> {
  const ruw = (await params).id
  return /^[1-9]\d{0,8}$/.test(ruw) ? Number(ruw) : null
}

/** Naam uit een verzoek: leeg wordt null; 1 tot 80 tekens zonder stuurtekens. undefined bij een ongeldige naam. */
export function schoonNaam(x: unknown): string | null | undefined {
  if (x === undefined || x === null || x === '') return null
  if (typeof x !== 'string') return undefined
  const n = x.replace(/[\u0000-\u001f\u007f]/g, ' ').trim()
  if (n.length === 0) return null
  return n.length > 80 ? undefined : n
}
