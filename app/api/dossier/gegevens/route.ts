import { fout, json, leesJson } from '@/lib/auth/api'
import { bewaarGegevens, laadGegevens, schoonGegevens } from '@/lib/dossier/gegevens'
import { metDossier } from '@/lib/dossier/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Adres en samenlevingsvorm passen ruim in een paar honderd bytes. */
const BODY_MAX = 10_000

/** Persoonlijke gegevens van het huishouden: { gegevens, updatedAt }. */
export async function GET() {
  return metDossier('dossier/gegevens GET', async (ctx) => {
    const antwoord = await laadGegevens(ctx)
    if (!antwoord) return fout(404, 'Er is geen huishouden gevonden.')
    return json(antwoord)
  })
}

/** Vervangt de gegevens. Body: { gegevens: { adres?, samenlevingsvorm? } }. Geen BSN; onbekende velden geven 422. */
export async function PUT(req: Request) {
  return metDossier('dossier/gegevens PUT', async (ctx) => {
    const body = await leesJson<{ gegevens?: unknown }>(req, BODY_MAX)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fout(400, 'Ongeldig verzoek.')
    const schoon = schoonGegevens(body.gegevens)
    if ('fouten' in schoon) return fout(422, 'De gegevens kloppen niet.', { fouten: schoon.fouten })
    const updatedAt = await bewaarGegevens(ctx, schoon.gegevens)
    if (!updatedAt) return fout(404, 'Er is geen huishouden gevonden.')
    return json({ gegevens: schoon.gegevens, updatedAt })
  }, req)
}
