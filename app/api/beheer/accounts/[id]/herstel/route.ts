import { fout, json } from '@/lib/auth/api'
import { maakHerstel } from '@/lib/auth/uitnodiging'
import { HERSTEL_ZONDER_MAILER, verstuurHerstel } from '@/lib/auth/uitnodiging-mail'
import { mailerSoort } from '@/lib/mail'
import { idUit, metBeheerder } from '../../../hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/**
 * Herstellink per mail naar het account zelf: nieuw wachtwoord en nieuwe authenticator-app. Het oude blijft werken tot
 * het nieuwe is bevestigd. De link komt nooit in het antwoord: anders kon een beheerder een ander account overnemen.
 */
export async function POST(req: Request, { params }: Params) {
  return metBeheerder('beheer/herstel POST', req, async (b) => {
    const id = await idUit(params)
    if (id === null) return fout(404, 'Dit account bestaat niet (meer).')
    if (!mailerSoort()) return fout(409, HERSTEL_ZONDER_MAILER)
    const herstel = await maakHerstel(id, b.userId)
    const r = await verstuurHerstel(herstel, b.naam ?? b.email)
    if (!r.ok) return fout(502, r.melding)
    return json({ gemaild: true }, 201)
  })
}
