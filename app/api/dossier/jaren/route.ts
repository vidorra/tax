import { fout, json, leesJson } from '@/lib/auth/api'
import { leegInvoer } from '@/lib/dossier/leeg'
import { nieuwJaarUitVorig } from '@/lib/dossier/nieuw-jaar'
import { BestaatAl, laadJaar, lijstJaren, maakJaar, reken, RekenFout } from '@/lib/dossier/opslag'
import { jaarUitPad, metDossier, onbekendJaar } from '@/lib/dossier/route'
import { samenvatting } from '@/lib/dossier/samenvatting'
import { valideerInvoer } from '@/lib/dossier/valideer'
import type { HuishoudenInvoer } from '@/lib/tax/types'
import { VOORBEELD_JAAR, voorbeeldInvoer } from '@/lib/voorbeeld'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const BRONNEN = ['leeg', 'vorig-jaar', 'voorbeeld-2024'] as const
type Bron = (typeof BRONNEN)[number]

export async function GET() {
  return metDossier('dossier/jaren GET', async ({ householdId }) => json({ jaren: await lijstJaren(householdId) }))
}

export async function POST(req: Request) {
  return metDossier('dossier/jaren POST', async ({ householdId }) => {
    const body = await leesJson<{ jaar?: unknown; bron?: unknown }>(req, 10_000)
    if (!body) return fout(400, 'Ongeldig verzoek.')
    const bron = (BRONNEN as readonly string[]).includes(String(body.bron)) ? (body.bron as Bron) : null
    if (!bron) return fout(400, "Kies een bron: 'leeg', 'vorig-jaar' of 'voorbeeld-2024'.")
    const jaar = jaarUitPad(String(body.jaar ?? (bron === 'voorbeeld-2024' ? VOORBEELD_JAAR : '')))
    if (jaar === null) return onbekendJaar()

    let invoer: HuishoudenInvoer
    if (bron === 'leeg') {
      invoer = leegInvoer(jaar)
    } else if (bron === 'voorbeeld-2024') {
      // Verzonnen voorbeeldhuishouden (lib/voorbeeld), geen echte aangifte.
      invoer = { ...voorbeeldInvoer(), jaar }
    } else {
      const vorig = await laadJaar(householdId, jaar - 1)
      if (!vorig) return fout(404, `Er is nog geen dossier voor ${jaar - 1} om te kopiëren.`)
      let vorigResultaat
      try {
        vorigResultaat = reken(vorig.invoer, vorig.variant).resultaat
      } catch {
        vorigResultaat = undefined
      }
      invoer = nieuwJaarUitVorig(vorig.invoer, jaar, vorigResultaat)
    }
    const fouten = valideerInvoer(invoer)
    if (fouten.length > 0) return fout(422, 'De invoer is niet compleet.', { fouten })
    try {
      const { overzicht, resultaat } = await maakJaar(householdId, invoer)
      return json({ jaar: overzicht, samenvatting: samenvatting(resultaat) }, 201)
    } catch (e) {
      if (e instanceof BestaatAl) return fout(409, `Er is al een dossier voor ${jaar}.`)
      if (e instanceof RekenFout) return fout(422, 'De berekening lukt niet met deze invoer.')
      throw e
    }
  }, req)
}
