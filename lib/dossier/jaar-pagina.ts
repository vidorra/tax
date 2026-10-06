/**
 * Laadt één dossierjaar voor de pagina's onder /dossier/[jaar].
 *
 * Ronde 2 (contract, na de nacontrole): ook de aangiftestaat van het jaar (`staat`, als `beginStaat` voor de
 * AangifteStaatProvider van de pagina) en de badges van de tabrij (`badges`, voor JaarKop). Lukt het laden van de
 * staat niet, dan is `staat` null (de provider laadt hem dan zelf) en ontbreken de badges die ervan afhangen.
 */
import { notFound } from 'next/navigation'
import { CONCEPT_JAREN, getJaar } from '@/lib/tax/years'
import type { Status } from '@/lib/tax/types'
import type { AangifteStaat } from './aangiftestaat'
import { laadAangifteStaat } from './aangiftestaat-opslag'
import { jaarBadges, type JaarBadges } from './jaar-tabs'
import { jaarBestaat, laadJaar, type JaarDetail } from './opslag'
import { databaseMelding, paginaContext } from './pagina'
import { jaarUitPad } from './route'

export type JaarPagina =
  | { soort: 'niet-geconfigureerd'; ontbreekt: string[] }
  | { soort: 'fout'; melding: string }
  | { soort: 'leeg'; jaar: number }
  | {
      soort: 'ok'
      /** Voor gegevens die per gebruiker versleuteld zijn (persoonlijke gegevens van het huishouden). */
      userId: number
      householdId: number
      detail: JaarDetail
      paramsStatus: Status
      /** Status van het jaar zonder variant. */
      basisStatus: Status
      varianten: Array<{ id: string; label: string; status: Status }>
      concept: boolean
      /** Er is een dossier voor het jaar ervoor (dan kan de editor saldi daaruit opnieuw overnemen). */
      vorigJaarBestaat: boolean
      /** Ronde 2: de aangiftestaat van het jaar; null als die niet geladen kon worden. */
      staat: AangifteStaat | null
      /** Ronde 2: badges voor de tabrij (lib/dossier/jaar-tabs.ts); geef ze aan JaarKop. */
      badges: JaarBadges
    }

export async function laadJaarPagina(ruwJaar: string): Promise<JaarPagina> {
  const jaar = jaarUitPad(ruwJaar)
  if (jaar === null) notFound()
  const ctx = await paginaContext()
  if (ctx.soort !== 'ok') return ctx
  let detail: JaarDetail | null
  let vorigJaarBestaat = false
  try {
    detail = await laadJaar(ctx.householdId, jaar)
    if (detail) vorigJaarBestaat = await jaarBestaat(ctx.householdId, jaar - 1)
  } catch (e) {
    return { soort: 'fout', melding: databaseMelding(e) }
  }
  if (!detail) return { soort: 'leeg', jaar }
  let staat: AangifteStaat | null = null
  try {
    staat = (await laadAangifteStaat(ctx.householdId, jaar))?.staat ?? null
  } catch (e) {
    // Alleen de naam van de fout naar de log, nooit de inhoud. De pagina werkt verder; de provider laadt de staat zelf.
    console.error(`[dossier/jaar] aangiftestaat laden mislukt: ${(e as Error)?.name ?? 'onbekend'}`)
  }
  const params = getJaar(jaar, detail.variant ?? undefined)
  return {
    soort: 'ok',
    userId: ctx.userId,
    householdId: ctx.householdId,
    detail,
    paramsStatus: params.status,
    basisStatus: getJaar(jaar).status,
    varianten: getJaar(jaar).varianten.map((v) => ({ id: v.id, label: v.label, status: v.status })),
    concept: CONCEPT_JAREN.includes(jaar),
    vorigJaarBestaat,
    staat,
    badges: jaarBadges({ status: detail.status, controles: detail.controles, staat }),
  }
}
