import { fout, json, leesJson } from '@/lib/auth/api'
import { normaliseerEmail } from '@/lib/auth/gebruiker'
import { maakUitnodiging } from '@/lib/auth/uitnodiging'
import { verstuurUitnodiging } from '@/lib/auth/uitnodiging-mail'
import { metBeheerder, schoonNaam } from '../hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Nieuwe uitnodiging. Body: { email, naam?, rol? }. Gemaild als er een mailer is; anders (of als mailen mislukt)
 * krijgt de beheerder de link terug om zelf door te sturen.
 */
export async function POST(req: Request) {
  return metBeheerder('beheer/uitnodigingen POST', req, async (b) => {
    const body = await leesJson<{ email?: unknown; naam?: unknown; rol?: unknown }>(req, 2_000)
    if (!body) return fout(400, 'Ongeldig verzoek.')
    const email = normaliseerEmail(body.email)
    if (!email) return fout(422, 'Vul een geldig e-mailadres in.')
    const naam = schoonNaam(body.naam)
    if (naam === undefined) return fout(422, 'Gebruik voor de naam maximaal 80 tekens.')
    const rol = body.rol === undefined ? 'gebruiker' : body.rol
    if (rol !== 'beheerder' && rol !== 'gebruiker') return fout(422, 'Kies beheerder of gebruiker.')
    const u = await maakUitnodiging({ email, naam, rol, doorId: b.userId })
    return json({ id: u.id, ...(await verstuurUitnodiging(u, b.naam ?? b.email)) }, 201)
  })
}
