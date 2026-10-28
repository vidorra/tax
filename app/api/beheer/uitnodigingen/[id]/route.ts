import { fout, json } from '@/lib/auth/api'
import { trekIn, vernieuw } from '@/lib/auth/uitnodiging'
import { verstuurHerstel, verstuurUitnodiging } from '@/lib/auth/uitnodiging-mail'
import { idUit, metBeheerder } from '../../hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Opnieuw versturen: een nieuw token en een nieuwe geldigheid; de oude link werkt niet meer. */
export async function POST(req: Request, { params }: Params) {
  return metBeheerder('beheer/uitnodigingen opnieuw', req, async (b) => {
    const id = await idUit(params)
    if (id === null) return fout(404, 'Deze uitnodiging bestaat niet (meer).')
    const u = await vernieuw(id)
    if (u.soort === 'herstel') {
      // Een herstellink gaat alleen per mail naar het account zelf; lukt dat niet, dan is hij ingetrokken.
      const r = await verstuurHerstel(u, b.naam ?? b.email)
      return r.ok ? json({ gemaild: true }) : fout(502, r.melding)
    }
    return json(await verstuurUitnodiging(u, b.naam ?? b.email))
  })
}

/** Intrekken: de link werkt niet meer. */
export async function DELETE(req: Request, { params }: Params) {
  return metBeheerder('beheer/uitnodigingen DELETE', req, async () => {
    const id = await idUit(params)
    if (id === null || !(await trekIn(id))) return fout(404, 'Deze uitnodiging is al gebruikt, ingetrokken of bestaat niet.')
    return json({ ok: true })
  })
}
