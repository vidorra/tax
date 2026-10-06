import { fout, json, leesJson } from '@/lib/auth/api'
import { maakClient } from '@/lib/moneybird/client'
import { haalJaarImport } from '@/lib/moneybird/import'
import { ENV_ID, laadIndeling, laadKoppeling, raakAan } from '@/lib/moneybird/opslag'
import { jaarUitPad, metDossier } from '@/lib/dossier/route'
import { BESCHIKBARE_JAREN } from '@/lib/tax/years'
import { BODY_KLEIN, idUitParams, importLimiter, metKoppelingFouten, onbekendeKoppeling, teVaak } from '../../hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Haalt de cijfers van één jaar uit Moneybird. Body: { jaar }. Schrijft niets in het dossier. */
export async function POST(req: Request, { params }: Params) {
  const id = await idUitParams(params)
  if (id === null) return onbekendeKoppeling()
  return metDossier('koppelingen import', async ({ householdId }) =>
    metKoppelingFouten(async () => {
      const body = await leesJson<{ jaar?: unknown }>(req, BODY_KLEIN)
      if (!body || typeof body !== 'object') return fout(400, 'Ongeldig verzoek.')
      const jaar = typeof body.jaar === 'number' || typeof body.jaar === 'string' ? jaarUitPad(String(body.jaar)) : null
      if (jaar === null) return fout(422, `Onbekend belastingjaar. Beschikbaar: ${BESCHIKBARE_JAREN().join(', ')}.`)

      const k = await laadKoppeling(householdId, id)
      if (!k) return onbekendeKoppeling()
      if (!k.administratie) return fout(409, 'Kies eerst een Moneybird-administratie voor deze koppeling.')

      const sleutel = `hh:${householdId}`
      const limiet = importLimiter().controleer(sleutel)
      if (!limiet.toegestaan) return teVaak(limiet.wachtSeconden)
      importLimiter().mislukt(sleutel)

      let administratie = k.administratie
      if (id === ENV_ID && !k.naamBekend) {
        const gevonden = (await maakClient(k.token, null).administraties()).find((a) => a.id === administratie.id)
        if (!gevonden) return fout(502, 'MONEYBIRD_ADMINISTRATION_ID hoort niet bij MONEYBIRD_TOKEN. Controleer de serverinstellingen.')
        administratie = gevonden
      }
      const indeling = (await laadIndeling(householdId, id)) ?? {}
      const imp = await haalJaarImport(k.token, administratie, jaar, indeling, k.id, new Date())
      await raakAan(householdId, id, id === ENV_ID ? administratie.naam : undefined)
      return json({ import: imp })
    }),
  req)
}
