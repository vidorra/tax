/**
 * Saldi uit het vorige jaar opnieuw overnemen (verliezen, niet-benutte zelfstandigenaftrek, restant
 * persoonsgebonden aftrek, lijfrentehistorie en premiegrondslag, oudedagsreserve, urencriterium, beginbalans en
 * activa); zie lib/dossier/doorrol.ts.
 *
 *  GET   wat er zou veranderen, zonder iets op te slaan: { vorigJaar, versie, wijzigingen, meldingen }
 *  POST  { versie } zet de saldi en slaat het jaar op; 409 als het jaar intussen is gewijzigd. Zonder wijzigingen
 *        wordt niets opgeslagen (twee keer overnemen geeft hetzelfde).
 *
 * Werkt altijd op de opgeslagen versie van beide jaren; de uitkomst van het vorige jaar rekent de server opnieuw.
 */
import type { NextResponse } from 'next/server'
import { fout, json, leesJson } from '@/lib/auth/api'
import { saldiOpnieuwOvernemen } from '@/lib/dossier/doorrol'
import { bewaarJaar, laadJaar, reken, RekenFout, VersieConflict, type JaarDetail } from '@/lib/dossier/opslag'
import { jaarUitPad, metDossier, onbekendJaar } from '@/lib/dossier/route'
import { valideerInvoer } from '@/lib/dossier/valideer'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ jaar: string }> }

type Overname = { huidig: JaarDetail; vorigJaar: number } & ReturnType<typeof saldiOpnieuwOvernemen>

/** Laadt beide jaren en rekent de overname uit, of geeft de foutresponse. */
async function bereken(householdId: number, jaar: number): Promise<Overname | NextResponse> {
  const huidig = await laadJaar(householdId, jaar)
  if (!huidig) return fout(404, `Er is nog geen dossier voor ${jaar}.`)
  const vorigJaar = jaar - 1
  const vorig = await laadJaar(householdId, vorigJaar)
  if (!vorig) return fout(404, `Er is geen dossier voor ${vorigJaar} om saldi uit over te nemen.`)
  let vorigResultaat
  try {
    vorigResultaat = reken(vorig.invoer, vorig.variant).resultaat
  } catch (e) {
    if (e instanceof RekenFout) return fout(422, `De berekening van ${vorigJaar} lukt niet. Controleer eerst de invoer van ${vorigJaar}.`)
    throw e
  }
  const overname = saldiOpnieuwOvernemen(huidig.invoer, vorig.invoer, vorigResultaat)
  const fouten = valideerInvoer(overname.invoer)
  if (fouten.length > 0) return fout(422, 'Met de saldi uit het vorige jaar klopt de invoer niet.', { fouten })
  return { huidig, vorigJaar, ...overname }
}

export async function GET(_req: Request, { params }: Params) {
  const jaar = jaarUitPad((await params).jaar)
  if (jaar === null) return onbekendJaar()
  return metDossier('dossier/doorrollen GET', async ({ householdId }) => {
    const r = await bereken(householdId, jaar)
    if (!('huidig' in r)) return r
    return json({ vorigJaar: r.vorigJaar, versie: r.huidig.versie, wijzigingen: r.wijzigingen, meldingen: r.meldingen })
  })
}

export async function POST(req: Request, { params }: Params) {
  const jaar = jaarUitPad((await params).jaar)
  if (jaar === null) return onbekendJaar()
  return metDossier(
    'dossier/doorrollen POST',
    async ({ householdId }) => {
      const body = await leesJson<{ versie?: unknown }>(req, 10_000)
      if (!body) return fout(400, 'Ongeldig verzoek.')
      const versie = Number(body.versie)
      if (body.versie === undefined || body.versie === null || !Number.isInteger(versie)) return fout(400, 'Geef de versie van het jaar mee.')

      const r = await bereken(householdId, jaar)
      if (!('huidig' in r)) return r
      const conflict = () => fout(409, 'Dit jaar is intussen ergens anders opgeslagen. Laad de pagina opnieuw en neem de saldi daarna over.')
      if (r.huidig.versie !== versie) return conflict()

      if (r.wijzigingen.length === 0) {
        return json({ opgeslagen: false, vorigJaar: r.vorigJaar, versie: r.huidig.versie, updatedAt: r.huidig.updatedAt, invoer: r.huidig.invoer, wijzigingen: [], meldingen: r.meldingen })
      }
      let uit
      try {
        uit = await bewaarJaar(householdId, jaar, { invoer: r.invoer, status: r.huidig.status, variant: r.huidig.variant, versie })
      } catch (e) {
        if (e instanceof VersieConflict) return conflict()
        if (e instanceof RekenFout) return fout(422, 'De berekening lukt niet met de overgenomen saldi.')
        throw e
      }
      if (!uit) return fout(404, `Er is nog geen dossier voor ${jaar}.`)
      const invoer = { ...r.invoer, jaar }
      if (r.huidig.variant) invoer.variant = r.huidig.variant
      else delete invoer.variant
      return json({ opgeslagen: true, vorigJaar: r.vorigJaar, versie: uit.overzicht.versie, updatedAt: uit.overzicht.updatedAt, invoer, wijzigingen: r.wijzigingen, meldingen: r.meldingen })
    },
    req,
  )
}
