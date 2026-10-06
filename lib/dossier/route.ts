/**
 * Gemeenschappelijke afhandeling voor /api/dossier/*: 503 zonder configuratie, 403 voor wijzigende
 * verzoeken van een andere site, 401 zonder sessie, en onverwachte fouten zonder details of invoer in de log.
 */
import type { NextResponse } from 'next/server'
import { fout, herkomstFout, nietGeconfigureerd, serverFout, vereisGebruiker } from '@/lib/auth/api'
import { BESCHIKBARE_JAREN } from '@/lib/tax/years'
import { huishoudenVan } from './opslag'

export interface DossierContext {
  userId: number
  householdId: number
}

/** `req` is verplicht voor wijzigende verzoeken, zodat de herkomstcontrole (CSRF) altijd draait. */
export async function metDossier(context: string, handler: (ctx: DossierContext) => Promise<NextResponse>, req?: Request): Promise<NextResponse> {
  const niet = nietGeconfigureerd()
  if (niet) return niet
  const herkomst = req ? herkomstFout(req) : null
  if (herkomst) return herkomst
  try {
    const gebruiker = await vereisGebruiker()
    if (!('userId' in gebruiker)) return gebruiker
    const householdId = await huishoudenVan(gebruiker.userId)
    return await handler({ userId: gebruiker.userId, householdId })
  } catch (e) {
    return serverFout(e, context)
  }
}

/** Jaar uit de URL, of null als het geen jaar met parameters is. */
export function jaarUitPad(ruw: string): number | null {
  const jaar = Number(ruw)
  if (!Number.isInteger(jaar) || !BESCHIKBARE_JAREN().includes(jaar)) return null
  return jaar
}

export const onbekendJaar = () => fout(404, `Onbekend belastingjaar. Beschikbaar: ${BESCHIKBARE_JAREN().join(', ')}.`)
