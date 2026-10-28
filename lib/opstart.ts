/**
 * Taken bij de start van de server (instrumentation.ts), na de migraties van start.sh. Elke taak mag vaker draaien en
 * een fout stopt de server niet; de log krijgt één regel zonder gegevens.
 *  - TOTP-geheimen uit een oude installatie versleutelen (lib/auth/totp-opslag.ts).
 *  - Een Moneybird-token uit de serverinstellingen overzetten naar een koppeling van het huishouden dat hem gebruikte
 *    (lib/moneybird/omgeving-overzetten.ts).
 */
import { configStatus } from '@/lib/auth/config'
import { versleutelOudeTotpGeheimen } from '@/lib/auth/totp-opslag'
import { zetOmgevingskoppelingOver } from '@/lib/moneybird/omgeving-overzetten'

export async function opstartTaken(): Promise<void> {
  if (!configStatus().geconfigureerd) return
  try {
    const n = versleutelOudeTotpGeheimen()
    if (n > 0) console.log(`[opstart] ${n} TOTP-geheim(en) versleuteld.`)
  } catch (e) {
    console.error(`[opstart] TOTP-geheimen versleutelen: ${(e as Error)?.name ?? 'onbekend'}`)
  }
  try {
    const u = await zetOmgevingskoppelingOver()
    if (u === 'overgezet' || u === 'bestond-al') {
      console.log('[opstart] De Moneybird-koppeling uit MONEYBIRD_TOKEN staat nu versleuteld in het dossier dat hem gebruikte. Haal MONEYBIRD_TOKEN en MONEYBIRD_ADMINISTRATION_ID weg uit de serverinstellingen.')
    } else if (u === 'geen-oude-koppeling') {
      console.log('[opstart] MONEYBIRD_TOKEN wordt niet meer gebruikt. Voeg het token toe bij Koppelingen in je dossier en haal MONEYBIRD_TOKEN en MONEYBIRD_ADMINISTRATION_ID weg uit de serverinstellingen.')
    }
  } catch (e) {
    console.error(`[opstart] Moneybird-koppeling overzetten: ${(e as Error)?.name ?? 'onbekend'}`)
  }
}
