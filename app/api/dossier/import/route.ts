import { fout, json, leesTekst } from '@/lib/auth/api'
import { controleerVerzoek, ImportFout, importeerJson } from '@/lib/dossier/import-opslag'
import { RekenFout } from '@/lib/dossier/opslag'
import { metDossier } from '@/lib/dossier/route'
import { JSON_IMPORT_MAX_BYTES } from '@/lib/import/json'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MISLUKT = 'Importeren is niet gelukt. Er is niets veranderd.'

/**
 * Ronde 2 (A4): JSON-import van de eigen export. Body: JsonImportVerzoek (alleen de gekozen jaren en onderdelen,
 * hooguit 5 MB). Alles opnieuw gevalideerd; alles of niets in één transactie. Geeft JsonImportResultaat.
 */
export async function POST(req: Request) {
  return metDossier('dossier/import POST', async (ctx) => {
    const tekst = await leesTekst(req, JSON_IMPORT_MAX_BYTES)
    if ('fout' in tekst) return fout(tekst.fout === 'te-groot' ? 413 : 400, tekst.fout === 'te-groot' ? 'Het bestand is groter dan 5 MB.' : 'Ongeldig verzoek.')
    let body: unknown
    try {
      body = JSON.parse(tekst.tekst)
    } catch {
      return fout(400, 'Ongeldig verzoek.')
    }
    try {
      const verzoek = controleerVerzoek(body)
      return json(await importeerJson(ctx, verzoek))
    } catch (e) {
      if (e instanceof ImportFout) return fout(e.status, e.status >= 500 ? MISLUKT : e.message, e.fouten ? { fouten: e.fouten } : {})
      if (e instanceof RekenFout) return fout(422, `${MISLUKT} De berekening lukt niet met de invoer uit het bestand.`)
      throw e
    }
  }, req)
}
