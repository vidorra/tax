import { fout, json, leesJson } from '@/lib/auth/api'
import { laadAangifteStaat } from '@/lib/dossier/aangiftestaat-opslag'
import { controlesVanJaar } from '@/lib/dossier/controle-telling'
import { bewaarJaar, laadJaar, reken, RekenFout, variantGeldig, VersieConflict, verwijderJaar } from '@/lib/dossier/opslag'
import { jaarUitPad, metDossier, onbekendJaar } from '@/lib/dossier/route'
import { isDossierStatus, type DossierStatus } from '@/lib/dossier/status'
import { valideerInvoer } from '@/lib/dossier/valideer'
import type { HuishoudenInvoer, HuishoudenResultaat } from '@/lib/tax/types'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ jaar: string }> }

function rekenOfNull(invoer: HuishoudenInvoer, variant: string | null): HuishoudenResultaat | null {
  try {
    return reken(invoer, variant).resultaat
  } catch {
    return null
  }
}

/**
 * Ronde 2 (A3): de statusregel. Alleen Gecontroleerd wordt tegengehouden: met een open fout (niet opgelost en niet
 * geldig genegeerd in de aangiftestaat) bewaart de server de invoer met status Concept en zegt waarom. Ingediend is een
 * feit en wordt nooit tegengehouden of teruggezet; Concept kan altijd. Geeft de status om op te slaan en de melding.
 */
async function statusNaControles(
  householdId: number,
  jaar: number,
  invoer: HuishoudenInvoer,
  variant: string | null,
  gevraagd: DossierStatus,
): Promise<{ status: DossierStatus; melding?: string }> {
  if (gevraagd !== 'gecontroleerd') return { status: gevraagd }
  const huidig = await laadJaar(householdId, jaar, { controles: false })
  const vorig = await laadJaar(householdId, jaar - 1, { controles: false })
  const staat = (await laadAangifteStaat(householdId, jaar))?.staat ?? null
  const uitkomst = controlesVanJaar({
    jaar,
    variant,
    status: 'gecontroleerd',
    invoer,
    resultaat: rekenOfNull(invoer, variant),
    staat,
    vorig: vorig ? { invoer: vorig.invoer, resultaat: rekenOfNull(vorig.invoer, vorig.variant) } : null,
    vandaag: new Date().toISOString().slice(0, 10),
  })
  const fouten = uitkomst?.open.filter((c) => c.ernst === 'fout') ?? []
  if (fouten.length === 0) return { status: 'gecontroleerd' }
  const was = huidig?.status === 'gecontroleerd' ? 'is terug naar Concept' : 'is Concept gebleven'
  const reden = fouten.length === 1 ? `er nog een fout open staat: ${fouten[0].titel}` : `er nog ${fouten.length} fouten open staan`
  return { status: 'concept', melding: `Opgeslagen. De status ${was}, omdat ${reden}.` }
}

export async function GET(_req: Request, { params }: Params) {
  const jaar = jaarUitPad((await params).jaar)
  if (jaar === null) return onbekendJaar()
  return metDossier('dossier/jaar GET', async ({ householdId }) => {
    const detail = await laadJaar(householdId, jaar)
    if (!detail) return fout(404, `Er is nog geen dossier voor ${jaar}.`)
    return json(detail)
  })
}

export async function PUT(req: Request, { params }: Params) {
  const jaar = jaarUitPad((await params).jaar)
  if (jaar === null) return onbekendJaar()
  return metDossier('dossier/jaar PUT', async ({ householdId }) => {
    const body = await leesJson<{ invoer?: unknown; status?: unknown; variant?: unknown; versie?: unknown }>(req, 2_000_000)
    if (!body) return fout(400, 'Ongeldig verzoek of de invoer is te groot.')
    const status = body.status ?? 'concept'
    if (!isDossierStatus(status)) return fout(400, "Status moet 'concept', 'gecontroleerd' of 'ingediend' zijn.")
    const variant = body.variant === undefined || body.variant === null || body.variant === '' ? null : String(body.variant)
    if (!variantGeldig(jaar, variant)) return fout(400, `Onbekende variant voor ${jaar}.`)
    const versie = body.versie === undefined ? undefined : Number(body.versie)
    if (versie !== undefined && !Number.isInteger(versie)) return fout(400, 'Versie moet een heel getal zijn.')
    const fouten = valideerInvoer(body.invoer)
    if (fouten.length > 0) return fout(422, 'Opslaan lukte niet: een paar gegevens kloppen nog niet.', { fouten })
    const invoer = body.invoer as HuishoudenInvoer
    if (invoer.jaar !== jaar) return fout(422, `De invoer hoort bij ${invoer.jaar}, niet bij ${jaar}.`)

    // Ronde 2 (A3): vóór het opslaan de controles; Gecontroleerd met open fouten wordt Concept (zie statusNaControles).
    const besluit = await statusNaControles(householdId, jaar, invoer, variant, status)

    let uit
    try {
      uit = await bewaarJaar(householdId, jaar, { invoer, status: besluit.status, variant, versie })
    } catch (e) {
      if (e instanceof VersieConflict) return fout(409, 'Dit jaar is intussen ergens anders opgeslagen. Laad de pagina opnieuw; je wijzigingen staan dan nog niet in het dossier.')
      if (e instanceof RekenFout) return fout(422, 'De berekening lukt niet met deze invoer. Controleer de ingevulde bedragen en datums.')
      throw e
    }
    if (!uit) return fout(404, `Er is nog geen dossier voor ${jaar}.`)
    return json({ jaar: uit.overzicht, resultaat: uit.resultaat, ...(besluit.melding ? { melding: besluit.melding } : {}) })
  }, req)
}

export async function DELETE(req: Request, { params }: Params) {
  const jaar = jaarUitPad((await params).jaar)
  if (jaar === null) return onbekendJaar()
  return metDossier('dossier/jaar DELETE', async ({ householdId }) => {
    const weg = await verwijderJaar(householdId, jaar)
    if (!weg) return fout(404, `Er is geen dossier voor ${jaar}.`)
    return json({ ok: true })
  }, req)
}
