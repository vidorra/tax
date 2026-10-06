import { fout, json, leesJson } from '@/lib/auth/api'
import { schoonAccountantRegels } from '@/lib/dossier/accountant'
import { bewaarAccountant, laadAccountant } from '@/lib/dossier/opslag'
import { jaarUitPad, metDossier, onbekendJaar } from '@/lib/dossier/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ jaar: string }> }

export async function GET(_req: Request, { params }: Params) {
  const jaar = jaarUitPad((await params).jaar)
  if (jaar === null) return onbekendJaar()
  return metDossier('dossier/accountant GET', async ({ householdId }) => {
    const doc = await laadAccountant(householdId, jaar)
    if (!doc) return fout(404, `Er is nog geen dossier voor ${jaar}.`)
    return json(doc)
  })
}

export async function PUT(req: Request, { params }: Params) {
  const jaar = jaarUitPad((await params).jaar)
  if (jaar === null) return onbekendJaar()
  return metDossier('dossier/accountant PUT', async ({ householdId }) => {
    const body = await leesJson<{ regels?: unknown }>(req, 50_000)
    if (!body) return fout(400, 'Ongeldig verzoek.')
    const schoon = schoonAccountantRegels(body.regels)
    if ('fout' in schoon) return fout(422, `De rapportregels kloppen niet: ${schoon.fout}.`)
    const updatedAt = await bewaarAccountant(householdId, jaar, schoon.regels)
    if (!updatedAt) return fout(404, `Er is nog geen dossier voor ${jaar}.`)
    return json({ regels: schoon.regels, updatedAt })
  }, req)
}
