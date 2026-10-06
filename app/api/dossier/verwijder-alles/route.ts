import { fout, json, leesJson } from '@/lib/auth/api'
import { SESSIE_COOKIE } from '@/lib/auth/sessie'
import { wisCookie } from '@/lib/auth/server'
import { verwijderAlles } from '@/lib/dossier/opslag'
import { metDossier } from '@/lib/dossier/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/** Verwijdert het hele dossier. Body: { bevestiging: 'VERWIJDER', ookAccount?: boolean }. */
export async function POST(req: Request) {
  return metDossier('dossier/verwijder-alles', async ({ userId }) => {
    const body = await leesJson<{ bevestiging?: unknown; ookAccount?: unknown }>(req, 2_000)
    if (body?.bevestiging !== 'VERWIJDER') return fout(400, "Typ VERWIJDER om te bevestigen dat je alles wilt verwijderen.")
    const ookAccount = body.ookAccount === true
    await verwijderAlles(userId, ookAccount)
    if (ookAccount) await wisCookie(SESSIE_COOKIE)
    return json({ ok: true, accountVerwijderd: ookAccount })
  }, req)
}
