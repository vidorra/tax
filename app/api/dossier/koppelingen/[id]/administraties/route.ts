import { json } from '@/lib/auth/api'
import { administratiesVan } from '@/lib/moneybird/opslag'
import { metDossier } from '@/lib/dossier/route'
import { idUitParams, metKoppelingFouten, onbekendeKoppeling } from '../../hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Administraties die het token van deze koppeling kan zien. */
export async function GET(_req: Request, { params }: Params) {
  const id = await idUitParams(params)
  if (id === null) return onbekendeKoppeling()
  return metDossier('koppelingen administraties', async ({ householdId }) =>
    metKoppelingFouten(async () => {
      const administraties = await administratiesVan(householdId, id)
      if (!administraties) return onbekendeKoppeling()
      return json({ administraties })
    }),
  )
}
