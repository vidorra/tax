/**
 * Context voor de server components onder /dossier: configuratie, sessie en huishouden.
 * De middleware stuurt al door naar de login; dit is de tweede controle (ook op de database).
 */
import { redirect } from 'next/navigation'
import { configStatus } from '@/lib/auth/config'
import { gebruikerOpId } from '@/lib/auth/gebruiker'
import { getSessie, sessieNogGeldig } from '@/lib/auth/server'
import { huishoudenVan } from './opslag'
import { ruimVerlopenHerstelpuntenOp } from './import-opslag'

export type PaginaContext =
  | { soort: 'niet-geconfigureerd'; ontbreekt: string[] }
  | { soort: 'fout'; melding: string }
  | { soort: 'ok'; userId: number; householdId: number }

export function databaseMelding(e: unknown): string {
  const code = (e as { code?: string })?.code ?? (e as { cause?: { code?: string } })?.cause?.code
  if (code === '42P01') return 'De databasetabellen bestaan nog niet.'
  if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === '28P01' || code === '3D000') return 'De database is niet bereikbaar. Controleer DATABASE_URL.'
  if ((e as Error)?.name === 'OntsleutelFout') return 'De opgeslagen gegevens konden niet worden ontsleuteld. Controleer of DOSSIER_KEY klopt.'
  return 'Er ging iets mis bij het laden van het dossier.'
}

export async function paginaContext(): Promise<PaginaContext> {
  const config = configStatus()
  if (!config.geconfigureerd) return { soort: 'niet-geconfigureerd', ontbreekt: config.ontbreekt }
  const sessie = await getSessie()
  if (!sessie) redirect('/dossier/login/')
  let userId: number | null = null
  let householdId = 0
  try {
    const gebruiker = await gebruikerOpId(sessie.userId)
    if (gebruiker?.totpEnabled && sessieNogGeldig(sessie, gebruiker)) {
      userId = gebruiker.id
      householdId = await huishoudenVan(gebruiker.id)
    }
  } catch (e) {
    console.error(`[dossier/pagina] fout: ${(e as Error)?.name ?? 'onbekend'}`)
    return { soort: 'fout', melding: databaseMelding(e) }
  }
  if (userId === null) redirect('/dossier/login/')
  // Verlopen herstelpunten van de JSON-import echt weghalen, ook zonder nieuwe import (hooguit eens per kwartier).
  void ruimVerlopenHerstelpuntenOp({ afEnToe: true }).catch(() => undefined)
  return { soort: 'ok', userId, householdId }
}
