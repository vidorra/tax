import { fout, json, leesJson } from '@/lib/auth/api'
import { schoonWijzigingen } from '@/lib/dossier/aangiftestaat'
import { StaatFout, laadAangifteStaat, wijzigAangifteStaat } from '@/lib/dossier/aangiftestaat-opslag'
import { jaarUitPad, metDossier, onbekendJaar } from '@/lib/dossier/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ jaar: string }> }

/** Ronde 2: aangiftestaat van een jaar (vinkjes, VIA-bedragen, genegeerde controles, terugvragen, planningsdatums). */
export async function GET(_req: Request, { params }: Params) {
  const jaar = jaarUitPad((await params).jaar)
  if (jaar === null) return onbekendJaar()
  return metDossier('dossier/aangiftestaat GET', async ({ householdId }) => {
    const r = await laadAangifteStaat(householdId, jaar)
    if (!r) return fout(404, `Er is nog geen dossier voor ${jaar}.`)
    return json(r)
  })
}

/** Past kleine wijzigingen toe (lib/dossier/aangiftestaat.ts StaatWijziging); de server voegt samen onder een rijlock. */
export async function PATCH(req: Request, { params }: Params) {
  const jaar = jaarUitPad((await params).jaar)
  if (jaar === null) return onbekendJaar()
  return metDossier(
    'dossier/aangiftestaat PATCH',
    async ({ householdId }) => {
      const body = await leesJson<{ wijzigingen?: unknown }>(req, 200_000)
      if (!body) return fout(400, 'Ongeldig verzoek.')
      const schoon = schoonWijzigingen(body.wijzigingen)
      if ('fout' in schoon) return fout(422, `De wijziging klopt niet: ${schoon.fout}.`)
      try {
        const r = await wijzigAangifteStaat(householdId, jaar, schoon.wijzigingen)
        if (!r) return fout(404, `Er is nog geen dossier voor ${jaar}.`)
        return json(r)
      } catch (e) {
        if (e instanceof StaatFout) return fout(422, `De wijziging past niet: ${e.message}.`)
        throw e
      }
    },
    req,
  )
}
