import { fout, json, leesJson } from '@/lib/auth/api'
import { lijstKoppelingen, maakKoppeling, schoonLabel, schoonToken } from '@/lib/moneybird/opslag'
import { metDossier } from '@/lib/dossier/route'
import { BODY_KLEIN, metKoppelingFouten, teVaak, toevoegLimiter } from './hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Alle koppelingen van het huishouden, met een gemaskeerd token. */
export async function GET() {
  return metDossier('koppelingen GET', async ({ householdId }) => json({ koppelingen: await lijstKoppelingen(householdId) }))
}

/** Nieuwe koppeling. Body: { token, label }. Het token wordt eerst bij Moneybird gecontroleerd. */
export async function POST(req: Request) {
  return metDossier('koppelingen POST', async ({ householdId }) =>
    metKoppelingFouten(async () => {
      const body = await leesJson<{ token?: unknown; label?: unknown }>(req, BODY_KLEIN)
      if (!body || typeof body !== 'object') return fout(400, 'Ongeldig verzoek.')
      const token = schoonToken(body.token)
      if (!token) return fout(422, 'Vul een geldig Moneybird-token in (Instellingen > Ontwikkelaars > Persoonlijke API-tokens).')
      const label = body.label === undefined || body.label === '' ? 'Moneybird' : schoonLabel(body.label)
      if (!label) return fout(422, 'Geef de koppeling een naam van maximaal 80 tekens.')
      const sleutel = `hh:${householdId}`
      const limiet = toevoegLimiter().controleer(sleutel)
      if (!limiet.toegestaan) return teVaak(limiet.wachtSeconden)
      toevoegLimiter().mislukt(sleutel)
      return json(await maakKoppeling(householdId, { token, label }), 201)
    }),
  req)
}
