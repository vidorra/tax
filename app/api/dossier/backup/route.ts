/**
 * Back-up van de database vanuit het dossier: GET geeft de status voor de kaart, POST mailt nu een back-up.
 * De ontvanger gaat alleen gemaskeerd naar de browser; de SHA-256 en het bestand zelf niet.
 */
import { fout, json } from '@/lib/auth/api'
import { backupStatus, handmatigeBackup } from '@/lib/backup/service'
import { metDossier } from '@/lib/dossier/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Seconden voordat een nieuwe back-up op verzoek weer mag (maximaal drie per uur). */
const WACHT_TE_VAAK = 3600

export async function GET() {
  return metDossier('backup GET', async () => json(await backupStatus()))
}

export async function POST(req: Request) {
  return metDossier(
    'backup POST',
    async () => {
      const r = await handmatigeBackup()
      if ('geweigerd' in r) {
        if (r.geweigerd === 'niet-ingericht') {
          return fout(503, 'De back-up is nog niet ingericht. Zet of controleer de genoemde variabelen op de server en start de app opnieuw.', { ontbreekt: r.ontbreekt ?? [] })
        }
        if (r.geweigerd === 'bezig') return fout(409, 'Er loopt al een back-up. Wacht een paar minuten en kijk dan opnieuw.')
        return fout(429, 'Je hebt het afgelopen uur al drie keer een back-up gestart. Probeer het later opnieuw.', {}, { 'Retry-After': String(WACHT_TE_VAAK) })
      }
      const { status, reden, bestandsnaam, bytes } = r
      return json({ resultaat: { status, reden, bestandsnaam, bytes }, backup: await backupStatus() })
    },
    req,
  )
}
