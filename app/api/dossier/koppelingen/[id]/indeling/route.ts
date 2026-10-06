import { fout, json, leesJson } from '@/lib/auth/api'
import { schoonIndeling } from '@/lib/moneybird/indeling'
import { bewaarIndeling } from '@/lib/moneybird/opslag'
import { metDossier } from '@/lib/dossier/route'
import { BODY_INDELING, idUitParams, metKoppelingFouten, onbekendeKoppeling } from '../../hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Vervangt de eigen indeling per grootboekrekening. Body: { indeling: { [ledgerAccountId]: categorie } }. */
export async function PUT(req: Request, { params }: Params) {
  const id = await idUitParams(params)
  if (id === null) return onbekendeKoppeling()
  return metDossier('koppelingen indeling', async ({ householdId }) =>
    metKoppelingFouten(async () => {
      const body = await leesJson<{ indeling?: unknown }>(req, BODY_INDELING)
      if (!body || typeof body !== 'object') return fout(400, 'Ongeldig verzoek.')
      const schoon = schoonIndeling(body.indeling)
      if ('fout' in schoon) return fout(422, `De indeling klopt niet: ${schoon.fout}.`)
      const indeling = await bewaarIndeling(householdId, id, schoon.indeling)
      if (!indeling) return onbekendeKoppeling()
      return json({ indeling })
    }),
  req)
}
