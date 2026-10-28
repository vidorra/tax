import { fout, json, leesJson } from '@/lib/auth/api'
import { geldigMbId } from '@/lib/moneybird/client'
import { kiesAdministratie, schoonLabel, schoonPersoon, verwijderKoppeling, wijzigKoppeling } from '@/lib/moneybird/opslag'
import { metDossier } from '@/lib/dossier/route'
import { BODY_KLEIN, idUitParams, metKoppelingFouten, onbekendeKoppeling } from '../hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * Wijzigt een koppeling. Body: { administratieId?, label?, persoon? }. Met administratieId wordt die eerst bij Moneybird
 * gecontroleerd; label en persoon ('A', 'B' of null) gaan zonder Moneybird.
 */
export async function PATCH(req: Request, { params }: Params) {
  const id = await idUitParams(params)
  if (id === null) return onbekendeKoppeling()
  return metDossier('koppelingen PATCH', async ({ householdId }) =>
    metKoppelingFouten(async () => {
      const body = await leesJson<{ administratieId?: unknown; label?: unknown; persoon?: unknown }>(req, BODY_KLEIN)
      if (!body || typeof body !== 'object') return fout(400, 'Ongeldig verzoek.')
      let label: string | undefined
      if (body.label !== undefined) {
        const l = schoonLabel(body.label)
        if (!l) return fout(422, 'Geef de koppeling een naam van maximaal 80 tekens.')
        label = l
      }
      const persoon = body.persoon === undefined ? undefined : schoonPersoon(body.persoon)
      if (body.persoon !== undefined && persoon === undefined) return fout(422, 'Kies van wie de administratie is: persoon A of B.')
      let koppeling
      if (body.administratieId !== undefined) {
        if (!geldigMbId(body.administratieId)) return fout(422, 'Kies een administratie uit de lijst.')
        koppeling = await kiesAdministratie(householdId, id, body.administratieId, label)
        if (koppeling && persoon !== undefined) koppeling = await wijzigKoppeling(householdId, id, { persoon })
      } else {
        if (label === undefined && persoon === undefined) return fout(422, 'Er is niets om te wijzigen.')
        koppeling = await wijzigKoppeling(householdId, id, { label, persoon })
      }
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
