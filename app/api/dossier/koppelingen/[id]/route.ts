import { fout, json, leesJson } from '@/lib/auth/api'
import { geldigMbId } from '@/lib/moneybird/client'
import { kiesAdministratie, schoonLabel, verwijderKoppeling } from '@/lib/moneybird/opslag'
import { metDossier } from '@/lib/dossier/route'
import { BODY_KLEIN, idUitParams, metKoppelingFouten, onbekendeKoppeling } from '../hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Kiest de administratie (en eventueel een nieuw label). Body: { administratieId, label? }. */
export async function PATCH(req: Request, { params }: Params) {
  const id = await idUitParams(params)
  if (id === null) return onbekendeKoppeling()
  return metDossier('koppelingen PATCH', async ({ householdId }) =>
    metKoppelingFouten(async () => {
      const body = await leesJson<{ administratieId?: unknown; label?: unknown }>(req, BODY_KLEIN)
      if (!body || typeof body !== 'object') return fout(400, 'Ongeldig verzoek.')
      if (!geldigMbId(body.administratieId)) return fout(422, 'Kies een administratie uit de lijst.')
      let label: string | undefined
      if (body.label !== undefined) {
        const l = schoonLabel(body.label)
        if (!l) return fout(422, 'Geef de koppeling een naam van maximaal 80 tekens.')
        label = l
      }
      const koppeling = await kiesAdministratie(householdId, id, body.administratieId, label)
      if (!koppeling) return onbekendeKoppeling()
      return json({ koppeling })
    }),
  req)
}

export async function DELETE(req: Request, { params }: Params) {
  const id = await idUitParams(params)
  if (id === null) return onbekendeKoppeling()
  return metDossier('koppelingen DELETE', async ({ householdId }) =>
    metKoppelingFouten(async () => {
      if (!(await verwijderKoppeling(householdId, id))) return onbekendeKoppeling()
      return json({ ok: true })
    }),
  req)
}
