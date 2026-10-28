import { fout, json, leesJson } from '@/lib/auth/api'
import { verwijderAccount, zetRol } from '@/lib/auth/gebruiker'
import { idUit, metBeheerder } from '../../hulp'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Params = { params: Promise<{ id: string }> }

/** Rol wijzigen. Body: { rol: 'beheerder' | 'gebruiker' }. Er blijft altijd een beheerder over. */
export async function PATCH(req: Request, { params }: Params) {
  return metBeheerder('beheer/accounts PATCH', req, async () => {
    const id = await idUit(params)
    if (id === null) return fout(404, 'Dit account bestaat niet (meer).')
    const body = await leesJson<{ rol?: unknown }>(req, 1_000)
    if (body?.rol !== 'beheerder' && body?.rol !== 'gebruiker') return fout(422, 'Kies beheerder of gebruiker.')
    await zetRol(id, body.rol)
    return json({ ok: true })
  })
}

/** Account verwijderen, met het hele dossier. Niet het eigen account en niet de laatste beheerder. */
export async function DELETE(req: Request, { params }: Params) {
  return metBeheerder('beheer/accounts DELETE', req, async (b) => {
    const id = await idUit(params)
    if (id === null) return fout(404, 'Dit account bestaat niet (meer).')
    await verwijderAccount(id, b.userId)
    return json({ ok: true })
  })
}
