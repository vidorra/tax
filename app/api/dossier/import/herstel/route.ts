import { fout, json, leesJson } from '@/lib/auth/api'
import { herstelImport, herstelVoorstel, ImportFout } from '@/lib/dossier/import-opslag'
import { RekenFout } from '@/lib/dossier/opslag'
import { metDossier } from '@/lib/dossier/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WEG = 'Deze import kan niet meer ongedaan worden gemaakt: het herstelpunt is er niet meer. Een herstelpunt blijft 30 dagen bewaard, tot de volgende import.'

/**
 * Ronde 2 (A4): een JSON-import ongedaan maken. Body: HerstelVerzoek. Zonder `bevestigd` alleen het voorstel
 * (HerstelVoorstel, met per jaar `gewijzigdNaImport`); met `bevestigd: true` uitvoeren in één transactie.
 */
export async function POST(req: Request) {
  return metDossier('dossier/import/herstel POST', async (ctx) => {
    const body = await leesJson<{ herstelpuntId?: unknown; bevestigd?: unknown }>(req, 1_000)
    if (!body || typeof body !== 'object' || Array.isArray(body)) return fout(400, 'Ongeldig verzoek.')
    const id = body.herstelpuntId
    if (typeof id !== 'number' || !Number.isInteger(id) || id < 1) return fout(400, 'Ongeldig verzoek.')
    if (body.bevestigd !== undefined && typeof body.bevestigd !== 'boolean') return fout(400, 'Ongeldig verzoek.')
    if (body.bevestigd !== true) {
      const voorstel = await herstelVoorstel(ctx, id)
      if (!voorstel) return fout(404, WEG)
      return json({ voorstel })
    }
    try {
      const resultaat = await herstelImport(ctx, id)
      if (!resultaat) return fout(404, WEG)
      return json({ resultaat })
    } catch (e) {
      if (e instanceof ImportFout || e instanceof RekenFout) return fout(422, 'Ongedaan maken is niet gelukt. Er is niets veranderd.')
      throw e
    }
  }, req)
}
